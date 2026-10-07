import { ABILITIES, TICK_RATE } from "../config/tuning";
import type { AbilityDefinition } from "./types";

const cfg = ABILITIES.dash;

export const dash: AbilityDefinition = {
  id: "dash",
  name: "Impulso",
  description: "Arranca curta na direcao atual. Nao protege do contato.",
  cooldownTicks: Math.round(cfg.cooldownSeconds * TICK_RATE),
  activation: "press",
  canActivate: () => null,
  onActivate(ctx) {
    const p = ctx.player;
    let dx = ctx.input.dirX;
    let dz = ctx.input.dirZ;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) {
      dx = Math.cos(p.yaw);
      dz = Math.sin(p.yaw);
    } else {
      dx /= len;
      dz /= len;
    }
    const v = p.body.linvel();
    p.body.setLinvel({ x: dx * cfg.speed, y: v.y, z: dz * cfg.speed }, true);
    p.activeTicks = cfg.durationTicks;
    p.speedCapMultiplier = cfg.speedCapMultiplier;
    ctx.emitUsed();
  },
  onEnd(ctx) {
    ctx.player.speedCapMultiplier = 1;
  },
};
