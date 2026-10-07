import type { ServerMessage } from "@arena/protocol";
import type { Loadout } from "@arena/sim";
import type { WebSocket } from "ws";
import { config } from "../config";
import type { MatchRoom } from "../rooms/MatchRoom";

/**
 * Uma identidade conectada ao servidor. Sobrevive a quedas de socket pelo
 * tempo de graca, para o jogador voltar a mesma vaga.
 */
export class Session {
  ws: WebSocket | null = null;
  room: MatchRoom | null = null;
  disconnectedAt: number | null = null;
  private inputWindowStart = 0;
  private inputWindowCount = 0;

  constructor(
    readonly id: string,
    readonly playerId: string,
    public name: string,
    public loadout: Loadout,
    readonly guest: boolean,
  ) {}

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === this.ws.OPEN;
  }

  attach(ws: WebSocket): void {
    this.ws = ws;
    this.disconnectedAt = null;
  }

  detach(): void {
    this.ws = null;
    this.disconnectedAt = Date.now();
  }

  send(msg: ServerMessage): void {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  sendBinary(bytes: Uint8Array): void {
    if (this.connected) this.ws!.send(bytes, { binary: true });
  }

  /** Limita pacotes de input por segundo. Devolve false se estourou. */
  allowInputPacket(now: number): boolean {
    if (now - this.inputWindowStart >= 1000) {
      this.inputWindowStart = now;
      this.inputWindowCount = 0;
    }
    this.inputWindowCount++;
    return this.inputWindowCount <= config.maxInputPacketsPerSecond;
  }
}
