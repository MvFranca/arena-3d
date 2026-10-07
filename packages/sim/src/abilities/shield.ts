import { ABILITIES, TICK_RATE } from "../config/tuning";
import type { AbilityDefinition } from "./types";

const cfg = ABILITIES.shield;

export const shield: AbilityDefinition = {
  id: "shield",
  name: "Escudo",
  description: "Por 1,5 s voce nao sai do lugar no contato. Nao afeta a bola.",
  cooldownTicks: Math.round(cfg.cooldownSeconds * TICK_RATE),
  activation: "press",
  canActivate(ctx) {
    return ctx.player.shieldTicks > 0 ? "already_active" : null;
  },
  onActivate(ctx) {
    const p = ctx.player;
    p.shieldTicks = cfg.durationTicks;
    p.activeTicks = cfg.durationTicks;
    p.collider.setMass(p.baseMass * cfg.massMultiplier);
    ctx.emitUsed();
  },
  onEnd(ctx) {
    const p = ctx.player;
    p.shieldTicks = 0;
    p.collider.setMass(p.baseMass);
  },
};
