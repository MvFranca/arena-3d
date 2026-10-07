import { TICK_RATE } from "../config/tuning";

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

export function ticksToSeconds(ticks: number): number {
  return ticks / TICK_RATE;
}

export function formatClock(ticks: number): string {
  const total = Math.max(0, Math.ceil(ticks / TICK_RATE));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
