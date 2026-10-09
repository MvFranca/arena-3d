import { describe, expect, it } from "vitest";
import { ClockSync } from "../src/net/ClockSync";

describe("ClockSync", () => {
  it("seed so na primeira vez", () => {
    const c = new ClockSync();
    c.seed(100, 1000);
    const a = c.serverTickNow(1000);
    c.seed(500, 1000);
    expect(c.serverTickNow(1000)).toBe(a);
  });

  it("nao realinha snapshot com idade normal", () => {
    const c = new ClockSync();
    c.seed(200, 0);
    const before = c.serverTickNow(16);
    c.noteSnapshot(200, 16);
    expect(c.serverTickNow(16)).toBeCloseTo(before, 8);
  });

  it("realinha quando o relogio esta muito a frente do snapshot", () => {
    const c = new ClockSync();
    c.seed(1000, 0);
    c.noteSnapshot(10, 0);
    expect(c.serverTickNow(0)).toBeCloseTo(10, 5);
  });
});
