import type { MatchState, PlayerState } from "@arena/sim";
import type { RenderPlayer, RenderState } from "./types";

export function copyMatchState(src: MatchState, dst: MatchState): void {
  dst.tick = src.tick;
  dst.phase = src.phase;
  dst.phaseTicksRemaining = src.phaseTicksRemaining;
  dst.clockTicksRemaining = src.clockTicksRemaining;
  dst.scoreLeft = src.scoreLeft;
  dst.scoreRight = src.scoreRight;
  Object.assign(dst.ball, src.ball);
  for (let i = 0; i < src.players.length; i++) {
    const s = src.players[i]!;
    let d = dst.players[i];
    if (!d) {
      d = { ...s };
      dst.players[i] = d;
    } else {
      Object.assign(d, s);
    }
  }
  dst.players.length = src.players.length;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function ensureRenderPlayer(out: RenderState, index: number, src: PlayerState, isLocal: boolean): RenderPlayer {
  let rp = out.players[index];
  if (!rp) {
    rp = {
      id: src.id, slot: src.slot, team: src.team, name: src.name, x: 0, z: 0, yaw: 0, flags: 0,
      cooldownTicks: 0, abilityId: src.abilityId, isLocal, connected: true,
    };
    out.players[index] = rp;
  }
  rp.id = src.id;
  rp.slot = src.slot;
  rp.team = src.team;
  rp.name = src.name;
  rp.abilityId = src.abilityId;
  rp.isLocal = isLocal;
  return rp;
}

/** Interpola prev -> curr com alpha e escreve em out. */
export function interpolateStates(out: RenderState, prev: MatchState, curr: MatchState, alpha: number, localIds: readonly string[]): void {
  out.tick = curr.tick;
  out.phase = curr.phase;
  out.phaseTicksRemaining = curr.phaseTicksRemaining;
  out.clockTicksRemaining = curr.clockTicksRemaining;
  out.scoreLeft = curr.scoreLeft;
  out.scoreRight = curr.scoreRight;
  out.ball.x = lerp(prev.ball.x, curr.ball.x, alpha);
  out.ball.y = lerp(prev.ball.y, curr.ball.y, alpha);
  out.ball.z = lerp(prev.ball.z, curr.ball.z, alpha);
  out.ball.vx = curr.ball.vx;
  out.ball.vy = curr.ball.vy;
  out.ball.vz = curr.ball.vz;
  let n = 0;
  for (let i = 0; i < curr.players.length; i++) {
    const c = curr.players[i]!;
    const p = prev.players.find((q) => q.id === c.id) ?? c;
    const rp = ensureRenderPlayer(out, n++, c, localIds.includes(c.id));
    rp.x = lerp(p.x, c.x, alpha);
    rp.z = lerp(p.z, c.z, alpha);
    rp.yaw = lerpAngle(p.yaw, c.yaw, alpha);
    rp.flags = c.flags;
    rp.cooldownTicks = c.cooldownTicks;
    rp.connected = (c.flags & 1) !== 0;
  }
  out.players.length = n;
  out.focusPlayerId = localIds[0] ?? null;
}
