import { describe, expect, it } from "vitest";
import { BALL_HARD_CORR_M, decayBallOffset, isHardBallReset, localOwnsBall, nextBallOffset, nextOwnBlend, presentBall, remoteContactsBall, showPredictedBall } from "../src/game/ballCorrection";

describe("ballCorrection", () => {
  it("guarda offset so para erros pequenos", () => {
    const off = nextBallOffset({ x: 1, y: 0.5, z: 0 }, { x: 1.2, y: 0.5, z: 0 }, false);
    expect(off.x).toBeCloseTo(-0.2, 5);
    expect(nextBallOffset({ x: 0, y: 0, z: 0 }, { x: 0.01, y: 0, z: 0 }, false)).toEqual({ x: 0, y: 0, z: 0 });
    expect(nextBallOffset({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, false)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("zera em reset duro, gol ou countdown", () => {
    expect(nextBallOffset({ x: 1, y: 0, z: 0 }, { x: 1.2, y: 0, z: 0 }, true)).toEqual({ x: 0, y: 0, z: 0 });
    expect(isHardBallReset({ error: 0.2, prevPhase: "playing", nextPhase: "goal" })).toBe(true);
    expect(isHardBallReset({ error: 0.2, prevPhase: "playing", nextPhase: "playing" })).toBe(false);
    expect(isHardBallReset({ error: BALL_HARD_CORR_M, prevPhase: "playing", nextPhase: "playing" })).toBe(true);
  });

  it("a bola atrasada aparece quando o local esta longe e sem chute recente", () => {
    expect(localOwnsBall({ localX: 0, localZ: 0, ballX: 8, ballZ: 0, sinceLocalKickMs: -1 })).toBe(false);
    expect(localOwnsBall({ localX: 0, localZ: 0, ballX: 1.2, ballZ: 0, sinceLocalKickMs: -1 })).toBe(true);
    expect(localOwnsBall({ localX: 10, localZ: 0, ballX: 0, ballZ: 0, sinceLocalKickMs: 40 })).toBe(true);
    const shown = presentBall({ x: 4, y: 0.5, z: 0 }, { x: 1, y: 0.5, z: 0 }, 0);
    expect(shown.x).toBe(1);
    expect(nextOwnBlend(1, false, 0.2)).toBeLessThan(1);
    expect(remoteContactsBall([{ x: 0.4, z: 0 }], 0, 0)).toBe(true);
    expect(remoteContactsBall([{ x: 6, z: 0 }], 0, 0)).toBe(false);
    expect(showPredictedBall(false, false)).toBe(true);
    expect(showPredictedBall(false, true)).toBe(false);
    expect(showPredictedBall(true, true)).toBe(true);
  });

  it("decai o offset sem inverter o sinal", () => {
    const next = decayBallOffset({ x: 0.4, y: 0, z: -0.2 }, 0.05);
    expect(Math.abs(next.x)).toBeLessThan(0.4);
    expect(next.x).toBeGreaterThan(0);
    expect(next.z).toBeLessThan(0);
  });
});
