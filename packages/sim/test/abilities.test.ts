import { describe, expect, it } from "vitest";
import { ABILITIES, BALL, PLAYER, listAbilities, PLAYER_FLAG_SHIELD, createEmptyMatchState } from "../src";
import { createSim, input, skipCountdown, stepN } from "./helpers";

describe("registro de habilidades", () => {
  it("expoe as tres habilidades iniciais", () => {
    const ids = listAbilities().map((a) => a.id).sort();
    expect(ids).toEqual(["dash", "power_shot", "shield"]);
  });
});

describe("cooldown", () => {
  it("segundo uso durante o cooldown e rejeitado", async () => {
    const sim = await createSim({ players: [{ id: "a", team: "left", ability: "dash" }, { id: "b", team: "right", ability: null }] });
    skipCountdown(sim);
    sim.setInput("a", input({ dirX: 1, ability: true }));
    let events = stepN(sim, 1);
    expect(events.some((e) => e.type === "ability_used")).toBe(true);
    sim.setInput("a", input({ dirX: 1, ability: false }));
    stepN(sim, 5);
    sim.setInput("a", input({ dirX: 1, ability: true }));
    events = stepN(sim, 1);
    expect(events.some((e) => e.type === "ability_rejected" && e.reason === "cooldown")).toBe(true);
    sim.dispose();
  });

  it("sem habilidade equipada o pedido e rejeitado", async () => {
    const sim = await createSim({ players: [{ id: "a", team: "left", ability: null }, { id: "b", team: "right", ability: null }] });
    skipCountdown(sim);
    sim.setInput("a", input({ ability: true }));
    const events = stepN(sim, 1);
    expect(events.some((e) => e.type === "ability_rejected" && e.reason === "no_ability")).toBe(true);
    sim.dispose();
  });
});

describe("dash", () => {
  it("empurra o jogador acima da velocidade normal e depois volta ao teto", async () => {
    const sim = await createSim({ players: [{ id: "a", team: "left", ability: "dash" }, { id: "b", team: "right", ability: null }] });
    skipCountdown(sim);
    sim.setInput("a", input({ dirZ: 1, ability: true }));
    stepN(sim, 2);
    const during = sim.getPlayerPosition("a")!;
    expect(Math.hypot(during.vx, during.vz)).toBeGreaterThan(PLAYER.baseMaxSpeed * 1.3);
    sim.setInput("a", input({ dirZ: 1 }));
    stepN(sim, ABILITIES.dash.durationTicks + 60);
    const after = sim.getPlayerPosition("a")!;
    expect(Math.hypot(after.vx, after.vz)).toBeLessThanOrEqual(PLAYER.baseMaxSpeed * PLAYER.speedCapSlack + 1e-6);
    sim.dispose();
  });
});

describe("carga de chute", () => {
  it("chute carregado sai mais forte que o normal", async () => {
    const run = async (charged: boolean) => {
      const sim = await createSim({ players: [{ id: "a", team: "left", ability: "power_shot" }, { id: "b", team: "right", ability: null }] });
      skipCountdown(sim);
      const a = sim.getPlayerPosition("a")!;
      if (charged) {
        sim.setInput("a", input({ ability: true }));
        stepN(sim, 1);
      }
      sim.setBallTransform(a.x + PLAYER.radius + BALL.radius + 0.1, BALL.radius, a.z, 0, 0, 0);
      sim.setInput("a", input({ kick: true }));
      const events = stepN(sim, 2);
      const kick = events.find((e) => e.type === "kick");
      sim.dispose();
      return kick && kick.type === "kick" ? kick.power : 0;
    };
    const normal = await run(false);
    const strong = await run(true);
    expect(normal).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(normal * 1.5);
  });

  it("a carga expira depois da janela", async () => {
    const sim = await createSim({ players: [{ id: "a", team: "left", ability: "power_shot" }, { id: "b", team: "right", ability: null }] });
    skipCountdown(sim);
    sim.setInput("a", input({ ability: true }));
    stepN(sim, 1);
    sim.setInput("a", input());
    stepN(sim, ABILITIES.power_shot.windowTicks + 5);
    const a = sim.getPlayerPosition("a")!;
    sim.setBallTransform(a.x + PLAYER.radius + BALL.radius + 0.1, BALL.radius, a.z, 0, 0, 0);
    sim.setInput("a", input({ kick: true }));
    const events = stepN(sim, 2);
    const kick = events.find((e) => e.type === "kick");
    expect(kick && kick.type === "kick" && kick.power < 25).toBe(true);
    sim.dispose();
  });
});

describe("escudo", () => {
  it("segura o jogador no lugar durante o contato", async () => {
    const run = async (withShield: boolean) => {
      const sim = await createSim({
        players: [
          { id: "wall", team: "left", ability: withShield ? "shield" : null },
          { id: "rusher", team: "right", ability: null },
        ],
      });
      skipCountdown(sim);
      // Coloca os dois frente a frente no centro.
      const state = createEmptyMatchState();
      sim.readState(state);
      const s = state.players.find((p) => p.id === "wall")!;
      const r = state.players.find((p) => p.id === "rusher")!;
      s.x = 0; s.z = 0; s.vx = 0; s.vz = 0;
      r.x = 6; r.z = 0; r.vx = 0; r.vz = 0;
      state.ball.z = -8;
      sim.applyState(state);
      if (withShield) {
        sim.setInput("wall", input({ ability: true }));
        stepN(sim, 1);
      }
      sim.setInput("wall", input());
      sim.setInput("rusher", input({ dirX: -1 }));
      stepN(sim, 70);
      sim.readState(state);
      const after = state.players.find((p) => p.id === "wall")!;
      sim.dispose();
      return { x: after.x, shielded: (after.flags & PLAYER_FLAG_SHIELD) !== 0 };
    };
    const noShield = await run(false);
    const shield = await run(true);
    expect(shield.shielded).toBe(true);
    expect(Math.abs(shield.x)).toBeLessThan(Math.abs(noShield.x) * 0.5);
  });
});
