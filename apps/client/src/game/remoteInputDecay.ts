/** Confianca no input remoto cai a zero em ~66 ms. */
export const REMOTE_DECAY_TICKS = 4;

export function remoteInputDecay(ticksSinceSnapshot: number, decayTicks = REMOTE_DECAY_TICKS): number {
  return Math.max(0, 1 - ticksSinceSnapshot / decayTicks);
}
