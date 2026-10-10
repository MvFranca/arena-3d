import type { AbilityId, ArenaConfig, Attributes, Loadout, MatchEvent, Ruleset, Team } from "@arena/sim";

/** Time em campo ou fora da partida. A fisica so conhece left/right. */
export type RosterTeam = Team | "spec";

/** Jogador como aparece no roster da sala. O loadout aqui e o que o servidor congelou. */
export interface RosterPlayer {
  id: string;
  slot: number;
  name: string;
  team: RosterTeam;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  abilityId: AbilityId | null;
  attributes: Attributes;
  archetypeId?: string;
  skinId?: string;
}

export type RoomPhase = "lobby" | "countdown" | "playing" | "goal" | "finished";

export interface RoomInfo {
  code: string;
  ruleset: Ruleset;
  /** Arena ja resolvida (builtin ou custom). */
  arena: ArenaConfig;
  /** Id builtin ou uuid do mapa da API. */
  mapId: string;
  phase: RoomPhase;
  players: RosterPlayer[];
  /** Partida ranqueada/matchmaking: ninguem controla o start, o servidor inicia sozinho. */
  automatic: boolean;
  /** Host pausou: bola, jogadores e relogio parados. */
  paused: boolean;
}

// ------------------------------------------------------------- cliente -> servidor

export type ClientMessage =
  | {
      t: "hello";
      v: number;
      /** JWT da plataforma, quando houver. Sem token o servidor pode aceitar convidado. */
      token?: string;
      name?: string;
      /** Loadout desejado por um convidado. Com token, o servidor ignora e busca o oficial. */
      loadout?: Partial<Loadout>;
      /** Para reconectar na mesma vaga. */
      sessionId?: string;
    }
  | { t: "create"; rulesetId: string; mapId?: string }
  | { t: "join"; code: string; ticket?: string }
  | { t: "team"; team: Team }
  | { t: "assign"; playerId: string; team: RosterTeam }
  | { t: "ready"; ready: boolean }
  | { t: "start" }
  | { t: "pause"; paused: boolean }
  | { t: "set_limits"; durationSeconds: number; scoreLimit: number }
  | { t: "set_map"; mapId: string }
  | { t: "set_arena"; arena: ArenaConfig }
  | { t: "restart" }
  | { t: "leave" };

// ------------------------------------------------------------- servidor -> cliente

export type ServerMessage =
  | { t: "welcome"; playerId: string; sessionId: string; serverTick: number }
  | { t: "room"; room: RoomInfo; you: { slot: number } }
  | { t: "left" }
  | { t: "event"; ev: MatchEvent }
  | { t: "error"; code: string; message: string }
  | { t: "kicked"; reason: string };

export function parseClientMessage(text: string): ClientMessage | null {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && typeof v.t === "string") return v as ClientMessage;
  } catch {
    /* ignora lixo */
  }
  return null;
}

export function parseServerMessage(text: string): ServerMessage | null {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && typeof v.t === "string") return v as ServerMessage;
  } catch {
    /* ignora lixo */
  }
  return null;
}
