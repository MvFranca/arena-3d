import type { ArenaConfig } from "../config/arenas";
import { BALL } from "../config/tuning";
import type { Team } from "../types";

/**
 * Volume do gol definido pela arena. A bola inteira precisa cruzar a linha.
 * Devolve o time que marcou (quem ataca aquele gol), ou null.
 */
export function detectGoal(arena: ArenaConfig, x: number, y: number, z: number): Team | null {
  if (Math.abs(z) > arena.goalHalfWidth) return null;
  if (y > arena.goalHeight) return null;
  const line = arena.halfLength + BALL.radius;
  if (x > line) return "left"; // bola no gol da direita: ponto do time da esquerda
  if (x < -line) return "right";
  return null;
}
