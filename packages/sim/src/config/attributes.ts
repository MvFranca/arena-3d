import { ATTRIBUTE_KEYS, type Attributes, type Loadout, type ResolvedStats } from "../types";
import { sanitizeSkinId } from "./skins";
import { ATTR, KICK, PLAYER } from "./tuning";

export const DEFAULT_ATTRIBUTES: Attributes = {
  speed: 50,
  acceleration: 50,
  strength: 50,
  control: 50,
  power: 50,
  precision: 50,
  resilience: 50,
  recharge: 50,
};

export const DEFAULT_LOADOUT: Loadout = {
  attributes: { ...DEFAULT_ATTRIBUTES },
  abilityId: "dash",
  archetypeId: "balanced",
  skinId: "default",
};

export interface Archetype {
  id: string;
  name: string;
  description: string;
  attributes: Attributes;
  abilityId: Loadout["abilityId"];
}

export const ARCHETYPES: Record<string, Archetype> = {
  balanced: {
    id: "balanced",
    name: "Equilibrado",
    description: "Sem ponto fraco. Bom para aprender o jogo.",
    attributes: { ...DEFAULT_ATTRIBUTES },
    abilityId: "dash",
  },
  striker: {
    id: "striker",
    name: "Finalizador",
    description: "Chute forte e preciso. Sofre no contato.",
    attributes: { speed: 50, acceleration: 45, strength: 30, control: 55, power: 80, precision: 70, resilience: 30, recharge: 40 },
    abilityId: "power_shot",
  },
  wall: {
    id: "wall",
    name: "Muralha",
    description: "Dificil de tirar do lugar. Lento para arrancar.",
    attributes: { speed: 35, acceleration: 35, strength: 80, control: 45, power: 50, precision: 40, resilience: 80, recharge: 35 },
    abilityId: "shield",
  },
  playmaker: {
    id: "playmaker",
    name: "Armador",
    description: "Dominio e passe. Chute mediano.",
    attributes: { speed: 50, acceleration: 55, strength: 40, control: 80, power: 35, precision: 65, resilience: 40, recharge: 35 },
    abilityId: "dash",
  },
  sprinter: {
    id: "sprinter",
    name: "Velocista",
    description: "Chega primeiro em toda bola. Leve demais para brigar.",
    attributes: { speed: 80, acceleration: 75, strength: 25, control: 45, power: 45, precision: 45, resilience: 30, recharge: 55 },
    abilityId: "dash",
  },
};

export function attributeBudgetUsed(attrs: Attributes): number {
  let sum = 0;
  for (const k of ATTRIBUTE_KEYS) sum += attrs[k];
  return sum;
}

/**
 * Normaliza atributos vindos de fora: inteiros 0..100 e soma dentro do orcamento.
 * Se a soma estourar, reduz proporcionalmente. Nunca confia no cliente.
 */
export function sanitizeAttributes(input: Partial<Attributes> | null | undefined): Attributes {
  const out: Attributes = { ...DEFAULT_ATTRIBUTES };
  if (input) {
    for (const k of ATTRIBUTE_KEYS) {
      const v = Number(input[k]);
      out[k] = Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : DEFAULT_ATTRIBUTES[k];
    }
  }
  const used = attributeBudgetUsed(out);
  if (used > ATTR.budget) {
    const scale = ATTR.budget / used;
    for (const k of ATTRIBUTE_KEYS) out[k] = Math.floor(out[k] * scale);
  }
  return out;
}

export function sanitizeLoadout(input: Partial<Loadout> | null | undefined): Loadout {
  const abilityId = input?.abilityId;
  const validAbility = abilityId === "dash" || abilityId === "power_shot" || abilityId === "shield" ? abilityId : null;
  return {
    attributes: sanitizeAttributes(input?.attributes),
    abilityId: validAbility,
    archetypeId: typeof input?.archetypeId === "string" ? input.archetypeId.slice(0, 32) : undefined,
    skinId: sanitizeSkinId(input?.skinId),
  };
}

/** Converte 0..100 em multiplicadores. Rodado uma vez por jogador ao criar o corpo. */
export function resolveStats(attrs: Attributes): ResolvedStats {
  const n = (v: number) => Math.min(1, Math.max(0, v / 100));
  return {
    maxSpeed: PLAYER.baseMaxSpeed * (ATTR.speedMin + ATTR.speedRange * n(attrs.speed)),
    acceleration: PLAYER.baseAcceleration * (ATTR.accelMin + ATTR.accelRange * n(attrs.acceleration)),
    mass: PLAYER.baseMass * (ATTR.massMin + ATTR.massRange * n(attrs.strength)),
    kickBase: KICK.baseImpulse * (ATTR.powerMin + ATTR.powerRange * n(attrs.power)),
    kickSpeedShare: KICK.speedShare,
    controlFactor: ATTR.controlMax * n(attrs.control),
    precisionSteer: ATTR.precisionMin + ATTR.precisionRange * n(attrs.precision),
    knockbackRecovery: ATTR.recoveryMin + ATTR.recoveryRange * n(attrs.resilience),
    cooldownMultiplier: ATTR.cooldownMax - ATTR.cooldownRange * n(attrs.recharge),
  };
}
