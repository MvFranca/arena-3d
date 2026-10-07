import { describe, expect, it } from "vitest";
import { ARENAS, sanitizeArena, sanitizeLoadout, sanitizeSkinId, SKINS } from "../src";
import { createSim, skipCountdown, stepN } from "./helpers";

describe("sanitizeArena", () => {
  it("usa fallbacks seguros quando o input e lixo", () => {
    const a = sanitizeArena({
      id: "../../../x<script>",
      name: "  \u0000ruim  ",
      halfLength: Number.NaN,
      halfWidth: 999,
      goalHalfWidth: 80,
      theme: { floor: "red", lines: "#fff", walls: "#00ff00", accent: "#GGGGGG" } as never,
    });
    expect(a.id).toBe("xscript");
    expect(a.name).toBe("ruim");
    expect(a.halfLength).toBe(20);
    expect(a.halfWidth).toBe(24);
    expect(a.goalHalfWidth).toBeLessThan(a.halfWidth);
    expect(a.theme.floor).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.theme.lines).toBe("#9fe3ff");
    expect(a.theme.walls).toBe("#00ff00");
  });

  it("clampa dimensoes e mantem gol coerente com o teto", () => {
    const a = sanitizeArena({ halfLength: 8, ceilingHeight: 4, goalHeight: 12 });
    expect(a.halfLength).toBe(10);
    expect(a.goalHeight).toBeLessThanOrEqual(a.ceilingHeight - 0.8);
  });
});

describe("sanitizeSkinId", () => {
  it("aceita skins conhecidas e cai no default", () => {
    expect(sanitizeSkinId("gold")).toBe("gold");
    expect(sanitizeSkinId("nope")).toBe("default");
    expect(sanitizeLoadout({ skinId: "neon" }).skinId).toBe("neon");
    expect(sanitizeLoadout({ skinId: "hack" }).skinId).toBe("default");
    expect(Object.keys(SKINS)).toHaveLength(6);
  });
});

describe("MatchSimulation arena override", () => {
  it("usa a arena passada em vez do builtin do ruleset", async () => {
    const arena = sanitizeArena({ ...ARENAS.classic, halfWidth: 8, halfLength: 12, name: "Mini" });
    const sim = await createSim({ arena });
    expect(sim.arena.halfWidth).toBe(8);
    expect(sim.arena.halfLength).toBe(12);
    skipCountdown(sim);
    stepN(sim, 5);
    expect(sim.phase).toBe("playing");
    sim.dispose();
  });
});
