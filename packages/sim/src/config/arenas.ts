import type { Team } from "../types";

export interface ArenaTheme {
  floor: string;
  lines: string;
  walls: string;
  accent: string;
  sky: string;
  fog: string;
  left: string;
  right: string;
}

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
  theme: ArenaTheme;
}

export const ARENA_BOUNDS = {
  halfLength: { min: 10, max: 40 },
  halfWidth: { min: 8, max: 24 },
  wallHeight: { min: 1.4, max: 5 },
  ceilingHeight: { min: 4, max: 12 },
  goalHalfWidth: { min: 1.4, max: 6 },
  goalHeight: { min: 1.4, max: 4.5 },
  goalDepth: { min: 1.2, max: 5 },
  wallRestitution: { min: 0.1, max: 0.95 },
  floorFriction: { min: 0.2, max: 0.95 },
} as const;

const HEX = /^#([0-9a-fA-F]{6})$/;

const DEFAULT_THEME: ArenaTheme = {
  floor: "#1b2a4a",
  lines: "#9fe3ff",
  walls: "#2f4b86",
  accent: "#ff4fd8",
  sky: "#0b1020",
  fog: "#0b1020",
  left: "#ff5f6d",
  right: "#4fc3ff",
};

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
      floor: "#16324a",
      lines: "#b8f0ff",
      walls: "#2a4f88",
      accent: "#ff4fd8",
      sky: "#071018",
      fog: "#0a1522",
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
      floor: "#3a4a32",
      lines: "#fff4c8",
      walls: "#7a5a3a",
      accent: "#ffb347",
      sky: "#f2b06a",
      fog: "#f6d2a4",
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

export function isBuiltinArena(id: string): boolean {
  return id in ARENAS;
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeHex(v: unknown, fallback: string): string {
  if (typeof v === "string" && HEX.test(v)) return v.toLowerCase();
  return fallback;
}

function sanitizeId(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const cleaned = v.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36);
  return cleaned || fallback;
}

function sanitizeName(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const cleaned = v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 32);
  return cleaned || fallback;
}

/**
 * Normaliza um mapa vindo de fora. Dimensoes, cores e ids ficam em ranges seguros.
 * Nunca confia no cliente.
 */
export function sanitizeArena(input: Partial<ArenaConfig> | null | undefined): ArenaConfig {
  const src = input ?? {};
  const halfLength = clampNum(src.halfLength, ARENA_BOUNDS.halfLength.min, ARENA_BOUNDS.halfLength.max, 20);
  const halfWidth = clampNum(src.halfWidth, ARENA_BOUNDS.halfWidth.min, ARENA_BOUNDS.halfWidth.max, 12);
  const wallHeight = clampNum(src.wallHeight, ARENA_BOUNDS.wallHeight.min, ARENA_BOUNDS.wallHeight.max, 2.5);
  const ceilingHeight = clampNum(src.ceilingHeight, ARENA_BOUNDS.ceilingHeight.min, ARENA_BOUNDS.ceilingHeight.max, 6);
  const maxGoalHalf = Math.min(ARENA_BOUNDS.goalHalfWidth.max, halfWidth - 1.5);
  const goalHalfWidth = clampNum(src.goalHalfWidth, ARENA_BOUNDS.goalHalfWidth.min, maxGoalHalf, Math.min(3.2, maxGoalHalf));
  const maxGoalHeight = Math.min(ARENA_BOUNDS.goalHeight.max, ceilingHeight - 0.8);
  const goalHeight = clampNum(src.goalHeight, ARENA_BOUNDS.goalHeight.min, maxGoalHeight, Math.min(2.4, maxGoalHeight));
  const themeIn: Partial<ArenaTheme> = src.theme ?? {};
  return {
    id: sanitizeId(src.id, "custom"),
    name: sanitizeName(src.name, "Mapa custom"),
    halfLength,
    halfWidth,
    wallHeight,
    ceilingHeight: Math.max(ceilingHeight, goalHeight + 0.8),
    goalHalfWidth,
    goalHeight,
    goalDepth: clampNum(src.goalDepth, ARENA_BOUNDS.goalDepth.min, ARENA_BOUNDS.goalDepth.max, 2.6),
    wallRestitution: clampNum(src.wallRestitution, ARENA_BOUNDS.wallRestitution.min, ARENA_BOUNDS.wallRestitution.max, 0.6),
    floorFriction: clampNum(src.floorFriction, ARENA_BOUNDS.floorFriction.min, ARENA_BOUNDS.floorFriction.max, 0.6),
    theme: {
      floor: sanitizeHex(themeIn.floor, DEFAULT_THEME.floor),
      lines: sanitizeHex(themeIn.lines, DEFAULT_THEME.lines),
      walls: sanitizeHex(themeIn.walls, DEFAULT_THEME.walls),
      accent: sanitizeHex(themeIn.accent, DEFAULT_THEME.accent),
      sky: sanitizeHex(themeIn.sky, DEFAULT_THEME.sky),
      fog: sanitizeHex(themeIn.fog, DEFAULT_THEME.fog),
      left: sanitizeHex(themeIn.left, DEFAULT_THEME.left),
      right: sanitizeHex(themeIn.right, DEFAULT_THEME.right),
    },
  };
}

/** Builtin pelo id, ou override sanitizado. */
export function resolveArena(id: string, override?: Partial<ArenaConfig> | null): ArenaConfig {
  if (override) return sanitizeArena({ ...override, id: override.id ?? id });
  const builtin = ARENAS[id];
  if (builtin) return builtin;
  throw new Error(`Arena desconhecida: ${id}`);
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
