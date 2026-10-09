import { FIXED_DT } from "@arena/sim";

const DT_MS = FIXED_DT * 1000;

/**
 * Estima o tick atual do servidor a partir de pings. O cliente usa isso para
 * numerar inputs a frente o bastante para chegarem antes do tick ser simulado.
 */
export class ClockSync {
  private offsetTicks: number | null = null;
  private rttMs = 80;
  private samples = 0;

  get pingMs(): number {
    return this.rttMs;
  }

  get synced(): boolean {
    return this.offsetTicks !== null;
  }

  onPong(clientSentMs: number, serverTick: number, serverTickFraction: number, nowMs: number): void {
    const rtt = Math.max(0, nowMs - clientSentMs);
    this.rttMs = this.samples === 0 ? rtt : this.rttMs * 0.8 + rtt * 0.2;
    const serverNowTicks = serverTick + serverTickFraction + rtt / 2 / DT_MS;
    const offset = serverNowTicks - nowMs / DT_MS;
    if (this.offsetTicks === null || this.samples < 3) this.offsetTicks = offset;
    else {
      const diff = offset - this.offsetTicks;
      this.offsetTicks += Math.abs(diff) > 10 ? diff : diff * 0.1;
    }
    this.samples++;
  }

  /** Tick do servidor neste instante (fracionario). */
  serverTickNow(nowMs: number): number {
    if (this.offsetTicks === null) return 0;
    return nowMs / DT_MS + this.offsetTicks;
  }

  /** Quantos ticks a frente do servidor o input deve ser numerado. */
  leadTicks(): number {
    const halfRtt = this.rttMs / 2 / DT_MS;
    return Math.min(30, Math.max(2, Math.ceil(halfRtt) + 2));
  }

  /** Forca o relogio a partir do welcome, antes do primeiro pong. */
  seed(serverTick: number, nowMs: number): void {
    if (this.offsetTicks === null) this.offsetTicks = serverTick - nowMs / DT_MS;
  }

  /**
   * Snapshot e um pouco do passado. So realinha se o relogio estiver
   * claramente atrasado ou muitos ticks a frente.
   */
  noteSnapshot(serverTick: number, nowMs: number): void {
    if (this.offsetTicks === null) {
      this.offsetTicks = serverTick - nowMs / DT_MS;
      return;
    }
    const estimated = this.serverTickNow(nowMs);
    const drift = estimated - serverTick;
    if (drift < -8 || drift > 45) this.offsetTicks = serverTick - nowMs / DT_MS;
  }

  /** Alinha o relogio ao tick autoritativo da partida (snapshot). */
  resync(serverTick: number, nowMs: number): void {
    this.offsetTicks = serverTick - nowMs / DT_MS;
  }
}
