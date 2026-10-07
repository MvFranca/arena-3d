import type { AbilityId, PlayerInput } from "../types";
import type { SimPlayer } from "../internal/SimPlayer";

export interface AbilityContext {
  tick: number;
  player: SimPlayer;
  input: PlayerInput;
  emitUsed(): void;
  reject(reason: string): void;
}

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  description: string;
  cooldownTicks: number;
  activation: "press";
  /** Condicoes alem de cooldown zerado. */
  canActivate(ctx: AbilityContext): string | null;
  onActivate(ctx: AbilityContext): void;
  /** Rodado a cada tick enquanto a habilidade estiver ativa (activeTicks > 0). */
  onTick?(ctx: AbilityContext): void;
  onEnd?(ctx: AbilityContext): void;
}
