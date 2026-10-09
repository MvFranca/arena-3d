import { describe, expect, it } from "vitest";
import { BALL, KICK, PLAYER, PLAYER_FLAG_KICKING, createEmptyMatchState, resolveStats, DEFAULT_ATTRIBUTES, TICK_RATE } from "../src";
import { createSim, input, skipCountdown, stepN } from "./helpers";

describe("fases e relogio", () => {
  it("comeca em countdown e entra em playing emitindo match_started", async () => {
    const sim = await createSim();
    expect(sim.phase).toBe("countdown");
    const events = skipCountdown(sim);
    expect(sim.phase).toBe("playing");
    expect(events.some((e) => e.type === "match_started")).toBe(true);
    sim.dispose();
  });

  it("jogadores ficam congelados no countdown", async () => {
    const sim = await createSim();
    sim.setInput("a", input({ dirX: 1 }));
    stepN(sim, 10);
    const pos = sim.getPlayerPosition("a")!;
    expect(Math.abs(pos.vx)).toBeLessThan(1e-6);
    sim.dispose();
  });

  it("termina quando o relogio zera", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    const events = stepN(sim, sim.clockTicksRemaining + 1);
    expect(sim.phase).toBe("finished");
    expect(events.some((e) => e.type === "match_ended")).toBe(true);
    sim.dispose();
  });
});

describe("movimento", () => {
  it("nao passa do teto de velocidade", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    sim.setInput("a", input({ dirX: 0, dirZ: 1 }));
    stepN(sim, 50);
    const pos = sim.getPlayerPosition("a")!;
    const speed = Math.hypot(pos.vx, pos.vz);
    const max = resolveStats(DEFAULT_ATTRIBUTES).maxSpeed;
    expect(speed).toBeGreaterThan(max * 0.9);
    expect(speed).toBeLessThanOrEqual(max * PLAYER.speedCapSlack + 1e-6);
    sim.dispose();
  });

  it("atravessa a lateral e para no limite externo", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    sim.setInput("a", input({ dirZ: 1 }));
    stepN(sim, 300);
    const pos = sim.getPlayerPosition("a")!;
    const outer = sim.arena.halfWidth + PLAYER.corridorWidth;
    expect(pos.z).toBeGreaterThan(sim.arena.halfWidth + PLAYER.radius * 0.4);
    expect(pos.z).toBeLessThan(outer + 0.05);
    expect(pos.z).toBeGreaterThan(outer - PLAYER.radius - 0.6);
    sim.dispose();
  });

  it("velocidade maior com atributo de velocidade maior", async () => {
    const sim = await createSim({
      players: [
        { id: "slow", team: "left", loadout: { attributes: { ...DEFAULT_ATTRIBUTES, speed: 0 } } },
        { id: "fast", team: "right", loadout: { attributes: { ...DEFAULT_ATTRIBUTES, speed: 100 } } },
      ],
    });
    skipCountdown(sim);
    sim.setInput("slow", input({ dirZ: 1 }));
    sim.setInput("fast", input({ dirZ: 1 }));
    stepN(sim, 50);
    const s = sim.getPlayerPosition("slow")!;
    const f = sim.getPlayerPosition("fast")!;
    expect(Math.hypot(f.vx, f.vz)).toBeGreaterThan(Math.hypot(s.vx, s.vz) * 1.2);
    sim.dispose();
  });
});

describe("chute e gol", () => {
  it("chute fora do alcance nao move a bola", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    const before = sim.getBallPosition();
    sim.setInput("a", input({ kick: true }));
    const events = stepN(sim, KICK.bufferTicks + 2);
    const after = sim.getBallPosition();
    expect(events.some((e) => e.type === "kick")).toBe(false);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-3);
    sim.dispose();
  });

  it("chute no alcance impulsiona a bola e emite evento", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    const a = sim.getPlayerPosition("a")!;
    sim.setBallTransform(a.x + PLAYER.radius + BALL.radius + 0.1, BALL.radius, a.z, 0, 0, 0);
    sim.setInput("a", input({ kick: true }));
    const events = stepN(sim, 3);
    expect(events.some((e) => e.type === "kick")).toBe(true);
    sim.setInput("a", input());
    stepN(sim, 10);
    const ball = sim.getBallPosition();
    expect(ball.x).toBeGreaterThan(a.x + 2);
    sim.dispose();
  });

  it("replay apos applyState pre-chute reaplica o kick", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    const a = sim.getPlayerPosition("a")!;
    sim.setBallTransform(a.x + PLAYER.radius + BALL.radius + 0.1, BALL.radius, a.z, 0, 0, 0);
    sim.setInput("a", input({ kick: true }));
    const kicked = stepN(sim, 1);
    expect(kicked.some((e) => e.type === "kick")).toBe(true);
    const afterKick = sim.getBallPosition();

    const pre = createEmptyMatchState();
    sim.readState(pre);
    const pa = pre.players.find((p) => p.id === "a")!;
    pa.flags &= ~PLAYER_FLAG_KICKING;
    pre.ball.x = a.x + PLAYER.radius + BALL.radius + 0.1;
    pre.ball.y = BALL.radius;
    pre.ball.z = a.z;
    pre.ball.vx = 0;
    pre.ball.vy = 0;
    pre.ball.vz = 0;
    sim.applyState(pre);
    sim.setInput("a", input({ kick: true }));
    const replayed = stepN(sim, 1);
    expect(replayed.some((e) => e.type === "kick")).toBe(true);
    expect(sim.getBallPosition().x).toBeGreaterThan(pre.ball.x + 0.2);
    expect(afterKick.x).toBeGreaterThan(a.x);
    sim.dispose();
  });

  it("replay apos applyState com chute ja aplicado nao chuta de novo", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    const a = sim.getPlayerPosition("a")!;
    sim.setBallTransform(a.x + PLAYER.radius + BALL.radius + 0.1, BALL.radius, a.z, 0, 0, 0);
    sim.setInput("a", input({ kick: true }));
    expect(stepN(sim, 1).some((e) => e.type === "kick")).toBe(true);
    const state = createEmptyMatchState();
    sim.readState(state);
    const pa = state.players.find((p) => p.id === "a")!;
    pa.flags |= PLAYER_FLAG_KICKING;
    sim.applyState(state);
    sim.setInput("a", input({ kick: true }));
    const replayed = stepN(sim, 1);
    expect(replayed.some((e) => e.type === "kick")).toBe(false);
    sim.dispose();
  });

  it("gol conta uma vez, pausa, reinicia e marca o autor", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    const a = sim.getPlayerPosition("a")!;
    sim.setBallTransform(a.x + PLAYER.radius + BALL.radius + 0.1, BALL.radius, a.z, 0, 0, 0);
    sim.setInput("a", input({ kick: true }));
    stepN(sim, 2);
    sim.setInput("a", input());
    // Bola lancada direto para o gol da direita.
    sim.setBallTransform(sim.arena.halfLength - 2, BALL.radius, 0, 30, 0, 0);
    const events = stepN(sim, TICK_RATE * 6);
    const goals = events.filter((e) => e.type === "goal");
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ team: "left", scorerId: "a", ownGoal: false });
    expect(sim.scoreLeft).toBe(1);
    expect(sim.scoreRight).toBe(0);
    expect(events.some((e) => e.type === "kickoff")).toBe(true);
    expect(sim.phase).toBe("playing");
    const ball = sim.getBallPosition();
    expect(Math.abs(ball.x)).toBeLessThan(0.5);
    sim.dispose();
  });

  it("bola em alta velocidade nao atravessa a parede lateral", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    sim.setBallTransform(0, BALL.radius, 0, 0, 0, BALL.maxSpeed);
    stepN(sim, TICK_RATE * 2);
    const ball = sim.getBallPosition();
    expect(Math.abs(ball.z)).toBeLessThan(sim.arena.halfWidth + 0.1);
    sim.dispose();
  });
});

describe("perimetro haxball", () => {
  it("jogador passa as quatro paredes internas", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    const W = sim.arena.halfWidth;
    const L = sim.arena.halfLength;

    sim.setPlayerTransform("a", 0, W - 1);
    sim.setInput("a", input({ dirZ: 1 }));
    stepN(sim, 80);
    expect(sim.getPlayerPosition("a")!.z).toBeGreaterThan(W + PLAYER.radius * 0.3);

    sim.setPlayerTransform("a", 0, -(W - 1));
    sim.setInput("a", input({ dirZ: -1 }));
    stepN(sim, 80);
    expect(sim.getPlayerPosition("a")!.z).toBeLessThan(-(W + PLAYER.radius * 0.3));

    sim.setPlayerTransform("a", L - 1, 0);
    sim.setInput("a", input({ dirX: 1 }));
    stepN(sim, 80);
    expect(sim.getPlayerPosition("a")!.x).toBeGreaterThan(L);

    sim.setPlayerTransform("a", -(L - 1), 0);
    sim.setInput("a", input({ dirX: -1 }));
    stepN(sim, 80);
    expect(sim.getPlayerPosition("a")!.x).toBeLessThan(-L);
    sim.dispose();
  });

  it("entra no gol e para na rede", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    const L = sim.arena.halfLength;
    sim.setPlayerTransform("a", L - 0.4, 0);
    sim.setInput("a", input({ dirX: 1 }));
    stepN(sim, 220);
    const pos = sim.getPlayerPosition("a")!;
    expect(pos.x).toBeGreaterThan(L + 0.2);
    expect(pos.x).toBeLessThan(L + sim.arena.goalDepth);
    sim.dispose();
  });

  it("nao atravessa a trave", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    const L = sim.arena.halfLength;
    const gw = sim.arena.goalHalfWidth;
    sim.setPlayerTransform("a", L - 1.4, gw);
    sim.setInput("a", input({ dirX: 1 }));
    stepN(sim, 160);
    const pos = sim.getPlayerPosition("a")!;
    expect(pos.x).toBeLessThan(L);
    sim.dispose();
  });

  it("chuta a bola colada na parede vindo de fora", async () => {
    const sim = await createSim();
    skipCountdown(sim);
    const W = sim.arena.halfWidth;
    sim.setPlayerTransform("a", 0, W + 1.0);
    sim.setBallTransform(0, BALL.radius, W - BALL.radius - 0.02, 0, 0, 0);
    sim.setInput("a", input({ kick: true, dirZ: -1 }));
    const events = stepN(sim, 5);
    expect(events.some((e) => e.type === "kick")).toBe(true);
    sim.dispose();
  });

  it("dash nao atravessa o limite externo", async () => {
    const sim = await createSim({
      players: [
        { id: "a", team: "left", ability: "dash" },
        { id: "b", team: "right" },
      ],
    });
    skipCountdown(sim);
    const outer = sim.arena.halfWidth + PLAYER.corridorWidth;
    sim.setPlayerTransform("a", 0, outer - 0.3);
    sim.setInput("a", input({ dirZ: 1, ability: true }));
    stepN(sim, 20);
    const pos = sim.getPlayerPosition("a")!;
    expect(pos.z).toBeLessThan(outer + 0.15);
    sim.dispose();
  });
});
