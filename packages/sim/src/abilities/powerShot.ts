import { ABILITIES, TICK_RATE } from "../config/tuning";
import type { AbilityDefinition } from "./types";

const cfg = ABILITIES.power_shot;

export const powerShot: AbilityDefinition = {
  id: "power_shot",
  name: "Carga de Chute",
  description: "O proximo chute em ate 2 s sai muito mais forte. Se a janela passar, a carga some.",
  cooldownTicks: Math.round(cfg.cooldownSeconds * TICK_RATE),
  activation: "press",
  canActivate(ctx) {
    return ctx.player.kickChargeTicks > 0 ? "already_charged" : null;
  },
  onActivate(ctx) {
    ctx.player.kickChargeTicks = cfg.windowTicks;
    ctx.player.kickChargeMultiplier = cfg.multiplier;
    ctx.emitUsed();
  },
};
