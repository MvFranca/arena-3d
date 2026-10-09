import type { AbilityId, MatchEvent, MatchPhase, Team } from "@arena/sim";

/** O que o renderer consome a cada frame. Posicoes ja interpoladas. */
export interface RenderPlayer {
  id: string;
  slot: number;
  team: Team;
  name: string;
  x: number;
  z: number;
  yaw: number;
  flags: number;
  cooldownTicks: number;
  abilityId: AbilityId | null;
  skinId?: string;
  isLocal: boolean;
  connected: boolean;
}

export interface RenderBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface RenderState {
  tick: number;
  phase: MatchPhase;
  phaseTicksRemaining: number;
  clockTicksRemaining: number;
  scoreLeft: number;
  scoreRight: number;
  ball: RenderBall;
  players: RenderPlayer[];
  /** Jogador que a camera acompanha (primeiro local). */
  focusPlayerId: string | null;
}

export function createRenderState(): RenderState {
  return {
    tick: 0,
    phase: "lobby",
    phaseTicksRemaining: 0,
    clockTicksRemaining: 0,
    scoreLeft: 0,
    scoreRight: 0,
    ball: { x: 0, y: 0.5, z: 0, vx: 0, vy: 0, vz: 0 },
    players: [],
    focusPlayerId: null,
  };
}

/**
 * Quem alimenta o renderer. A implementacao local avanca a simulacao no
 * processo; a remota manda inputs e aplica snapshots. O renderer nao sabe a diferenca.
 */
export interface NetDebug {
  snapshotAgeMs: number;
  delayTicks: number;
  bufferSize: number;
  ballCorr: number;
  remoteCorr: number;
}

export interface SimulationHost {
  /** Avanca o tempo real em ms; roda os ticks fixos necessarios. */
  update(deltaMs: number): void;
  /** Preenche o estado interpolado para o frame atual. */
  render(out: RenderState): void;
  /** Eventos acumulados desde a ultima chamada (array reutilizado). */
  drainEvents(): MatchEvent[];
  readonly localPlayerIds: string[];
  readonly pingMs: number;
  readonly netDebug?: NetDebug;
  dispose(): void;
}
