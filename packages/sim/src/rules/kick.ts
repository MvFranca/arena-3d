import { BALL, FIXED_DT, KICK, PLAYER } from "../config/tuning";
import type { SimPlayer } from "../internal/SimPlayer";
import type { RigidBody } from "../physics/rapier";

const CONTACT_DIST = PLAYER.radius + BALL.radius;

export interface KickResult {
  kicked: boolean;
  power: number;
}

export function ballHorizontalDistance(p: SimPlayer, ball: RigidBody): number {
  const a = p.body.translation();
  const b = ball.translation();
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Toque suave: controle puxa a bola para a velocidade do jogador. E drible, nao ima. */
export function applyBallControl(p: SimPlayer, ball: RigidBody, tick: number): void {
  const dist = ballHorizontalDistance(p, ball);
  if (dist > CONTACT_DIST + KICK.touchReach) return;
  p.lastBallTouchTick = tick;
  if (p.stats.controlFactor <= 0) return;
  const pv = p.body.linvel();
  const bv = ball.linvel();
  const f = p.stats.controlFactor * FIXED_DT * 6; // por segundo -> por tick
  ball.setLinvel({ x: bv.x + (pv.x - bv.x) * f, y: bv.y, z: bv.z + (pv.z - bv.z) * f }, true);
}

/**
 * Chute: so acontece se houver pedido valido no buffer e a bola estiver no alcance.
 * Direcao = jogador->bola, com desvio parcial para o input conforme a precisao.
 */
export function tryKick(p: SimPlayer, ball: RigidBody, tick: number): KickResult {
  if (p.kickBufferTicks <= 0 || p.kickRefractoryTicks > 0) return { kicked: false, power: 0 };
  const a = p.body.translation();
  const b = ball.translation();
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist > CONTACT_DIST + KICK.reach) return { kicked: false, power: 0 };

  let nx = dist > 1e-4 ? dx / dist : Math.cos(p.yaw);
  let nz = dist > 1e-4 ? dz / dist : Math.sin(p.yaw);

  const ilen = Math.hypot(p.input.dirX, p.input.dirZ);
  if (ilen > 0.2) {
    const ix = p.input.dirX / ilen;
    const iz = p.input.dirZ / ilen;
    const s = p.stats.precisionSteer;
    nx = nx * (1 - s) + ix * s;
    nz = nz * (1 - s) + iz * s;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
  }

  const pv = p.body.linvel();
  const along = Math.max(0, pv.x * nx + pv.z * nz);
  let impulse = p.stats.kickBase + along * p.stats.kickSpeedShare;
  if (p.kickChargeTicks > 0) {
    impulse *= p.kickChargeMultiplier;
    p.kickChargeTicks = 0;
    p.kickChargeMultiplier = 1;
  }

  const bm = ball.mass();
  ball.applyImpulse({ x: nx * impulse * bm, y: impulse * KICK.lift * bm, z: nz * impulse * bm }, true);

  p.kickBufferTicks = 0;
  p.kickRefractoryTicks = KICK.refractoryTicks;
  p.kickedThisTick = true;
  p.lastBallTouchTick = tick;
  return { kicked: true, power: impulse };
}
