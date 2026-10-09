export const BALL_SOFT_CORR_M = 1.2;
export const BALL_HARD_CORR_M = 3.5;
/** Alcance em que a bola prevista do jogador local substitui a bola atrasada. */
export const LOCAL_BALL_REACH = 1.7;
/** Depois do chute local, a bola fica no presente por este tempo. */
export const LOCAL_KICK_HOLD_MS = 220;
/** So segura a bola atrasada enquanto um adversario renderizado esta neste raio. */
export const REMOTE_BALL_REACH = 2.1;

export interface BallVec {
  x: number;
  y: number;
  z: number;
}

/** Offset visual que decai; o fisico ja foi reconciliado. */
export function nextBallOffset(
  predicted: BallVec,
  reconciled: BallVec,
  hard: boolean,
): BallVec {
  if (hard) return { x: 0, y: 0, z: 0 };
  const dx = predicted.x - reconciled.x;
  const dy = predicted.y - reconciled.y;
  const dz = predicted.z - reconciled.z;
  const err = Math.hypot(dx, dy, dz);
  if (err < 0.04 || err > BALL_SOFT_CORR_M) return { x: 0, y: 0, z: 0 };
  const s = Math.min(1, BALL_SOFT_CORR_M / err);
  return { x: dx * s, y: dy * s, z: dz * s };
}

export function decayBallOffset(offset: BallVec, dtSec: number, rate = 14): BallVec {
  const k = Math.exp(-dtSec * rate);
  const next = { x: offset.x * k, y: offset.y * k, z: offset.z * k };
  if (Math.hypot(next.x, next.y, next.z) < 0.01) return { x: 0, y: 0, z: 0 };
  return next;
}

/** Bola do buffer atrasado, no mesmo instante visual dos adversarios. */
export function localOwnsBall(opts: {
  localX: number;
  localZ: number;
  ballX: number;
  ballZ: number;
  sinceLocalKickMs: number;
}): boolean {
  if (opts.sinceLocalKickMs >= 0 && opts.sinceLocalKickMs < LOCAL_KICK_HOLD_MS) return true;
  return Math.hypot(opts.localX - opts.ballX, opts.localZ - opts.ballZ) <= LOCAL_BALL_REACH;
}

export function remoteContactsBall(
  remotes: readonly { x: number; z: number }[],
  ballX: number,
  ballZ: number,
): boolean {
  const reach2 = REMOTE_BALL_REACH * REMOTE_BALL_REACH;
  for (const p of remotes) {
    const dx = p.x - ballX;
    const dz = p.z - ballZ;
    if (dx * dx + dz * dz <= reach2) return true;
  }
  return false;
}

/** Bola prevista (fluida) fora do contato; atrasada so enquanto o adversario encosta. */
export function showPredictedBall(localOwns: boolean, remoteContact: boolean): boolean {
  return localOwns || !remoteContact;
}

export function nextOwnBlend(current: number, owns: boolean, dtSec: number): number {
  const target = owns ? 1 : 0;
  const rate = target === 1 ? 22 : 12;
  const k = 1 - Math.exp(-Math.max(0, dtSec) * rate);
  const next = current + (target - current) * k;
  if (Math.abs(next - target) < 0.01) return target;
  return next;
}

export function presentBall(predicted: BallVec, delayed: BallVec, own: number): BallVec {
  if (own >= 0.999) return predicted;
  if (own <= 0.001) return delayed;
  return {
    x: delayed.x + (predicted.x - delayed.x) * own,
    y: delayed.y + (predicted.y - delayed.y) * own,
    z: delayed.z + (predicted.z - delayed.z) * own,
  };
}

export function isHardBallReset(opts: {
  error: number;
  prevPhase: string;
  nextPhase: string;
}): boolean {
  if (opts.error >= BALL_HARD_CORR_M) return true;
  if (opts.prevPhase !== opts.nextPhase && (opts.nextPhase === "goal" || opts.nextPhase === "countdown" || opts.nextPhase === "lobby")) {
    return true;
  }
  return false;
}
