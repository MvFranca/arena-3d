import { DEFAULT_LOADOUT, getRuleset, initPhysics, MatchSimulation, type AbilityId, type Loadout, type MatchEvent, type PlayerInput, type Team } from "../src";

export async function createSim(opts: { players?: { id: string; team: Team; ability?: AbilityId | null; loadout?: Partial<Loadout> }[]; ruleset?: string; autoStart?: boolean; arena?: import("../src").ArenaConfig } = {}) {
  await initPhysics();
  const players = opts.players ?? [
    { id: "a", team: "left" as Team },
    { id: "b", team: "right" as Team },
  ];
  return new MatchSimulation({
    ruleset: getRuleset(opts.ruleset ?? "practice"),
    arena: opts.arena,
    autoStart: opts.autoStart ?? true,
    players: players.map((p, i) => ({
      id: p.id,
      slot: i,
      team: p.team,
      name: p.id,
      loadout: { ...DEFAULT_LOADOUT, ...p.loadout, abilityId: p.ability === undefined ? DEFAULT_LOADOUT.abilityId : p.ability },
    })),
  });
}

export function input(partial: Partial<PlayerInput> = {}): PlayerInput {
  return { seq: 0, dirX: 0, dirZ: 0, kick: false, ability: false, ...partial };
}

/** Avanca ate sair do countdown. */
export function skipCountdown(sim: MatchSimulation): MatchEvent[] {
  const all: MatchEvent[] = [];
  let guard = 0;
  while (sim.phase !== "playing" && guard++ < 1000) all.push(...sim.step());
  return all;
}

export function stepN(sim: MatchSimulation, n: number): MatchEvent[] {
  const all: MatchEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...sim.step());
  return all;
}
