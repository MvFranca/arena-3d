import { FIXED_DT, PLAYER, PLAYER_CENTER_Y } from "../config/tuning";
import type { SimPlayer } from "../internal/SimPlayer";
import { clampHorizontalSpeed } from "../physics/world";

/**
 * Aplica a intencao de movimento como impulso, para que o empurrao entre
 * jogadores continue sendo resolvido pelo solver e nao por teleporte.
 */
export function applyMovement(p: SimPlayer): void {
  const body = p.body;
  const input = p.input;
  let dx = input.dirX;
  let dz = input.dirZ;
  const len = Math.hypot(dx, dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }

  const stats = p.stats;
  const v = body.linvel();
  const targetX = dx * stats.maxSpeed;
  const targetZ = dz * stats.maxSpeed;

  let dvx = targetX - v.x;
  let dvz = targetZ - v.z;
  const maxDv = stats.acceleration * FIXED_DT;
  const dvLen = Math.hypot(dvx, dvz);
  if (dvLen > maxDv) {
    const s = maxDv / dvLen;
    dvx *= s;
    dvz *= s;
  }

  // Resiliencia: componente da velocidade que nao e a desejada decai mais rapido.
  if (len > 0.05) {
    const curLen = Math.hypot(dx, dz) || 1;
    const nx = dx / curLen;
    const nz = dz / curLen;
    const along = v.x * nx + v.z * nz;
    const sideX = v.x - along * nx;
    const sideZ = v.z - along * nz;
    const recovery = p.shieldTicks > 0 ? 1 : stats.knockbackRecovery;
    dvx -= sideX * recovery;
    dvz -= sideZ * recovery;
  }

  if (p.activeTicks > 0 && p.speedCapMultiplier > 1) {
    // Durante o dash o jogador nao freia por falta de input.
    if (len < 0.05) return;
  }

  const mass = body.mass();
  body.applyImpulse({ x: dvx * mass, y: 0, z: dvz * mass }, true);

  if (len > PLAYER.yawMinSpeed / stats.maxSpeed) {
    p.yaw = Math.atan2(dz, dx);
  }
}

export function postStepMovement(p: SimPlayer): void {
  const cap = p.stats.maxSpeed * PLAYER.speedCapSlack * p.speedCapMultiplier;
  clampHorizontalSpeed(p.body, cap);
  const v = p.body.linvel();
  const speed = Math.hypot(v.x, v.z);
  if (speed > PLAYER.yawMinSpeed && Math.hypot(p.input.dirX, p.input.dirZ) < 0.05) {
    p.yaw = Math.atan2(v.z, v.x);
  }
  // Jogador preso ao chao: zera qualquer deriva vertical do solver.
  const t = p.body.translation();
  const groundY = PLAYER_CENTER_Y;
  if (Math.abs(t.y - groundY) > 1e-3) {
    p.body.setTranslation({ x: t.x, y: groundY, z: t.z }, true);
  }
}

export function freezePlayer(p: SimPlayer): void {
  p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
}
