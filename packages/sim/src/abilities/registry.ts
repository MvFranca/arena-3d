import type { AbilityId } from "../types";
import type { AbilityDefinition } from "./types";

const registry = new Map<AbilityId, AbilityDefinition>();

export function registerAbility(def: AbilityDefinition): void {
  registry.set(def.id, def);
}

export function getAbility(id: AbilityId): AbilityDefinition {
  const def = registry.get(id);
  if (!def) throw new Error(`Habilidade nao registrada: ${id}`);
  return def;
}

export function hasAbility(id: string): id is AbilityId {
  return registry.has(id as AbilityId);
}

export function listAbilities(): AbilityDefinition[] {
  return [...registry.values()];
}
