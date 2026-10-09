import { describe, expect, it } from "vitest";
import { REMOTE_DECAY_TICKS, remoteInputDecay } from "../src/game/remoteInputDecay";

describe("remoteInputDecay", () => {
  it("comeca em 1 e chega a 0 no horizonte de decay", () => {
    expect(remoteInputDecay(0)).toBe(1);
    expect(remoteInputDecay(REMOTE_DECAY_TICKS / 2)).toBeCloseTo(0.5, 5);
    expect(remoteInputDecay(REMOTE_DECAY_TICKS)).toBe(0);
    expect(remoteInputDecay(REMOTE_DECAY_TICKS + 8)).toBe(0);
  });
});
