export type Team = "left" | "right";

export type MatchPhase = "lobby" | "countdown" | "playing" | "goal" | "finished";

export const PHASE_CODES: Record<MatchPhase, number> = {
  lobby: 0,
  countdown: 1,
  playing: 2,
  goal: 3,
  finished: 4,
};

export const PHASE_FROM_CODE: MatchPhase[] = ["lobby", "countdown", "playing", "goal", "finished"];

/** Intencao de um jogador em um tick. Nunca carrega atributos nem posicao. */
export interface PlayerInput {
  seq: number;
  /** Direcao normalizada (ou zero). O servidor clampa o modulo em 1. */
  dirX: number;
  dirZ: number;
  kick: boolean;
  ability: boolean;
}

export const EMPTY_INPUT: Readonly<PlayerInput> = Object.freeze({
  seq: 0,
  dirX: 0,
  dirZ: 0,
  kick: false,
  ability: false,
});

export type AbilityId = "dash" | "power_shot" | "shield";

/** Atributos crus 0..100. So a plataforma conhece esta forma. */
export interface Attributes {
  speed: number;
  acceleration: number;
  strength: number;
  control: number;
  power: number;
  precision: number;
  resilience: number;
  recharge: number;
}

export const ATTRIBUTE_KEYS: (keyof Attributes)[] = [
  "speed",
  "acceleration",
  "strength",
  "control",
  "power",
  "precision",
  "resilience",
  "recharge",
];

export interface Loadout {
  attributes: Attributes;
  abilityId: AbilityId | null;
  archetypeId?: string;
  skinId?: string;
}

/** Atributos ja convertidos em numeros que a fisica entende. */
export interface ResolvedStats {
  maxSpeed: number;
  acceleration: number;
  mass: number;
  kickBase: number;
  kickSpeedShare: number;
  controlFactor: number;
  precisionSteer: number;
  knockbackRecovery: number;
  cooldownMultiplier: number;
}

export interface Ruleset {
  id: string;
  arenaId: string;
  durationSeconds: number;
  maxPlayers: number;
  teamSize: number;
  countdownSeconds: number;
  goalPauseSeconds: number;
  kickoffSeconds: number;
  /** Partida termina antes do tempo se um time atingir este placar (0 desativa). */
  scoreLimit: number;
}

export interface PlayerSlotConfig {
  id: string;
  slot: number;
  team: Team;
  name: string;
  loadout: Loadout;
}

export interface MatchConfig {
  ruleset: Ruleset;
  players: PlayerSlotConfig[];
  /** Se true, comeca direto no countdown, sem fase de lobby. */
  autoStart?: boolean;
}

export const PLAYER_FLAG_CONNECTED = 1 << 0;
export const PLAYER_FLAG_SHIELD = 1 << 1;
export const PLAYER_FLAG_DASH = 1 << 2;
export const PLAYER_FLAG_CHARGED = 1 << 3;
export const PLAYER_FLAG_KICKING = 1 << 4;

export interface PlayerState {
  id: string;
  slot: number;
  team: Team;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  cooldownTicks: number;
  flags: number;
  lastSeq: number;
  abilityId: AbilityId | null;
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface MatchState {
  tick: number;
  phase: MatchPhase;
  phaseTicksRemaining: number;
  clockTicksRemaining: number;
  scoreLeft: number;
  scoreRight: number;
  ball: BallState;
  players: PlayerState[];
}

export type MatchEvent =
  | { type: "match_started"; tick: number }
  | { type: "kickoff"; tick: number }
  | { type: "goal"; tick: number; team: Team; scorerId: string | null; ownGoal: boolean }
  | { type: "kick"; tick: number; playerId: string; power: number }
  | { type: "ability_used"; tick: number; playerId: string; abilityId: AbilityId }
  | { type: "ability_rejected"; tick: number; playerId: string; reason: string }
  | { type: "ball_bounce"; tick: number; x: number; y: number; z: number; speed: number }
  | { type: "player_contact"; tick: number; a: string; b: string; speed: number }
  | { type: "match_ended"; tick: number; scoreLeft: number; scoreRight: number; winner: Team | "draw" };

export function createEmptyBallState(): BallState {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
}

export function createEmptyMatchState(): MatchState {
  return {
    tick: 0,
    phase: "lobby",
    phaseTicksRemaining: 0,
    clockTicksRemaining: 0,
    scoreLeft: 0,
    scoreRight: 0,
    ball: createEmptyBallState(),
    players: [],
  };
}
