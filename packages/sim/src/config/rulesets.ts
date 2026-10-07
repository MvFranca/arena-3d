import type { Ruleset } from "../types";
import { CLOCK } from "./tuning";

const base = {
  arenaId: "classic",
  durationSeconds: CLOCK.defaultDurationSeconds,
  countdownSeconds: CLOCK.countdownSeconds,
  goalPauseSeconds: CLOCK.goalPauseSeconds,
  kickoffSeconds: CLOCK.kickoffSeconds,
  scoreLimit: 0,
};

export const RULESETS: Record<string, Ruleset> = {
  duel: { ...base, id: "duel", maxPlayers: 2, teamSize: 1 },
  doubles: { ...base, id: "doubles", maxPlayers: 4, teamSize: 2 },
  trios: { ...base, id: "trios", maxPlayers: 6, teamSize: 3, arenaId: "rooftop" },
  squads: { ...base, id: "squads", maxPlayers: 8, teamSize: 4, arenaId: "rooftop" },
  /** Usado em testes e na partida local. */
  practice: { ...base, id: "practice", maxPlayers: 8, teamSize: 4, durationSeconds: 180 },
};

export function getRuleset(id: string): Ruleset {
  const r = RULESETS[id];
  if (!r) throw new Error(`Ruleset desconhecido: ${id}`);
  return r;
}
