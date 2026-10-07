import type { Team } from "../types";

export interface ArenaConfig {
  id: string;
  name: string;
  /** Metade do comprimento (eixo X, de gol a gol). */
  halfLength: number;
  /** Metade da largura (eixo Z). */
  halfWidth: number;
  wallHeight: number;
  ceilingHeight: number;
  goalHalfWidth: number;
  goalHeight: number;
  goalDepth: number;
  wallRestitution: number;
  floorFriction: number;
  /** Paleta usada so pela view. A simulacao ignora. */
  theme: {
    floor: string;
    lines: string;
    walls: string;
    accent: string;
    sky: string;
    fog: string;
    left: string;
    right: string;
  };
}

export const ARENAS: Record<string, ArenaConfig> = {
  classic: {
    id: "classic",
    name: "Quadra Neon",
    halfLength: 20,
    halfWidth: 12,
    wallHeight: 2.5,
    ceilingHeight: 6,
    goalHalfWidth: 3.2,
    goalHeight: 2.4,
    goalDepth: 2.6,
    wallRestitution: 0.6,
    floorFriction: 0.6,
    theme: {
      floor: "#1b2a4a",
      lines: "#9fe3ff",
      walls: "#2f4b86",
      accent: "#ff4fd8",
      sky: "#0b1020",
      fog: "#0b1020",
      left: "#ff5f6d",
      right: "#4fc3ff",
    },
  },
  rooftop: {
    id: "rooftop",
    name: "Terraco Solar",
    halfLength: 23,
    halfWidth: 13,
    wallHeight: 2.2,
    ceilingHeight: 7,
    goalHalfWidth: 3.6,
    goalHeight: 2.6,
    goalDepth: 2.8,
    wallRestitution: 0.7,
    floorFriction: 0.55,
    theme: {
      floor: "#2d3b2e",
      lines: "#f7f3d0",
      walls: "#6a5137",
      accent: "#ffb347",
      sky: "#f0b27a",
      fog: "#f5d1a8",
      left: "#ff7a33",
      right: "#38d9a9",
    },
  },
};

export function getArena(id: string): ArenaConfig {
  const arena = ARENAS[id];
  if (!arena) throw new Error(`Arena desconhecida: ${id}`);
  return arena;
}

/** Posicao de kickoff de um jogador, pela ordem dentro do time. */
export function spawnPosition(
  arena: ArenaConfig,
  team: Team,
  indexInTeam: number,
  teamSize: number,
): { x: number; z: number } {
  const side = team === "left" ? -1 : 1;
  const depth = indexInTeam === 0 ? 0.35 : 0.55 + (indexInTeam % 2) * 0.2;
  const x = side * arena.halfLength * depth;
  const spread = teamSize <= 1 ? 0 : (arena.halfWidth * 1.2) / teamSize;
  const z = (indexInTeam - (teamSize - 1) / 2) * spread;
  return { x, z };
}
