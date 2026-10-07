import {
  BufferWriter,
  decodePong,
  decodeSnapshot,
  encodePing,
  OP,
  parseServerMessage,
  PROTOCOL_VERSION,
  readOpcode,
  type ClientMessage,
  type RoomInfo,
  type ServerMessage,
  type Snapshot,
} from "@arena/protocol";
import type { Loadout, MatchEvent } from "@arena/sim";
import { setState } from "../app/store";
import { ClockSync } from "./ClockSync";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

type Handlers = {
  snapshot: (s: Snapshot) => void;
  event: (ev: MatchEvent) => void;
  room: (room: RoomInfo, mySlot: number) => void;
  status: (s: ConnectionStatus) => void;
  error: (code: string, message: string) => void;
  left: () => void;
};

export interface HelloOptions {
  token?: string;
  name: string;
  loadout?: Partial<Loadout>;
}

const RECONNECT_WINDOW_MS = 15000;

/**
 * Socket com o servidor de jogo. Frames de texto sao JSON de lobby;
 * frames binarios sao snapshots e pong. Reconecta na mesma vaga por 15 s.
 */
export class GameConnection {
  private ws: WebSocket | null = null;
  private url = "";
  private hello: HelloOptions | null = null;
  status: ConnectionStatus = "disconnected";
  sessionId: string | null = null;
  playerId: string | null = null;
  room: RoomInfo | null = null;
  mySlot: number | null = null;
  readonly clock = new ClockSync();
  private readonly writer = new BufferWriter(64);
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private disconnectedAt = 0;
  private intentionalClose = false;
  private readonly handlers: { [K in keyof Handlers]: Set<Handlers[K]> } = {
    snapshot: new Set(),
    event: new Set(),
    room: new Set(),
    status: new Set(),
    error: new Set(),
    left: new Set(),
  };
  private welcomeResolve: ((ok: boolean) => void) | null = null;

  on<K extends keyof Handlers>(type: K, fn: Handlers[K]): () => void {
    (this.handlers[type] as Set<Handlers[K]>).add(fn);
    return () => (this.handlers[type] as Set<Handlers[K]>).delete(fn);
  }

  private emit<K extends keyof Handlers>(type: K, ...args: Parameters<Handlers[K]>): void {
    for (const fn of this.handlers[type]) (fn as (...a: Parameters<Handlers[K]>) => void)(...args);
  }

  private setStatus(s: ConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.emit("status", s);
  }

  get isOpen(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /** Abre a conexao e espera o welcome. */
  connect(url: string, hello: HelloOptions): Promise<boolean> {
    this.disconnect();
    this.url = url;
    this.hello = hello;
    this.intentionalClose = false;
    return this.open();
  }

  private open(): Promise<boolean> {
    this.setStatus(this.sessionId ? "reconnecting" : "connecting");
    return new Promise<boolean>((resolve) => {
      this.welcomeResolve = resolve;
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch {
        this.setStatus("disconnected");
        resolve(false);
        return;
      }
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      ws.onopen = () => {
        const h = this.hello!;
        this.sendJson({ t: "hello", v: PROTOCOL_VERSION, token: h.token, name: h.name, loadout: h.loadout, sessionId: this.sessionId ?? undefined });
      };
      ws.onmessage = (e) => this.onMessage(e);
      ws.onclose = () => this.onClose();
      ws.onerror = () => {
        /* onclose cuida */
      };
    });
  }

  private onMessage(e: MessageEvent): void {
    if (typeof e.data === "string") {
      const msg = parseServerMessage(e.data);
      if (msg) this.onServerMessage(msg);
      return;
    }
    const { op, reader } = readOpcode(e.data as ArrayBuffer);
    if (op === OP.SNAPSHOT) {
      this.emit("snapshot", decodeSnapshot(reader));
    } else if (op === OP.PONG) {
      const p = decodePong(reader);
      this.clock.onPong(p.clientTimeMs, p.serverTick, p.serverTickFraction, performance.now());
    }
  }

  private onServerMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case "welcome":
        this.sessionId = msg.sessionId;
        this.playerId = msg.playerId;
        this.clock.seed(msg.serverTick, performance.now());
        this.setStatus("connected");
        this.startPing();
        this.welcomeResolve?.(true);
        this.welcomeResolve = null;
        break;
      case "room":
        this.room = msg.room;
        this.mySlot = msg.you.slot;
        setState({ room: msg.room, mySlot: msg.you.slot, playerId: this.playerId });
        this.emit("room", msg.room, msg.you.slot);
        break;
      case "event":
        this.emit("event", msg.ev);
        break;
      case "left":
        this.room = null;
        this.mySlot = null;
        setState({ room: null, mySlot: null });
        this.emit("left");
        break;
      case "error":
        this.emit("error", msg.code, msg.message);
        if (this.welcomeResolve) {
          this.welcomeResolve(false);
          this.welcomeResolve = null;
        }
        break;
      case "kicked":
        this.emit("error", "kicked", msg.reason);
        this.intentionalClose = true;
        break;
    }
  }

  private onClose(): void {
    this.stopPing();
    this.ws = null;
    if (this.welcomeResolve) {
      this.welcomeResolve(false);
      this.welcomeResolve = null;
    }
    if (this.intentionalClose || !this.sessionId) {
      this.setStatus("disconnected");
      this.room = null;
      return;
    }
    if (this.status !== "reconnecting") this.disconnectedAt = performance.now();
    if (performance.now() - this.disconnectedAt > RECONNECT_WINDOW_MS) {
      this.setStatus("disconnected");
      this.sessionId = null;
      this.room = null;
      setState({ room: null, mySlot: null });
      this.emit("left");
      return;
    }
    this.setStatus("reconnecting");
    this.reconnectTimer = window.setTimeout(() => void this.open(), 800);
  }

  private startPing(): void {
    this.stopPing();
    const tick = () => {
      if (this.isOpen) this.ws!.send(encodePing(this.writer, performance.now()));
    };
    tick();
    this.pingTimer = window.setInterval(tick, 1000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  sendJson(msg: ClientMessage): void {
    if (this.isOpen) this.ws!.send(JSON.stringify(msg));
  }

  sendBinary(bytes: Uint8Array): void {
    if (this.isOpen) this.ws!.send(bytes);
  }

  leaveRoom(): void {
    this.sendJson({ t: "leave" });
    this.room = null;
    this.mySlot = null;
    setState({ room: null, mySlot: null });
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopPing();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.sessionId = null;
    this.playerId = null;
    this.room = null;
    this.mySlot = null;
    this.setStatus("disconnected");
  }
}

export const connection = new GameConnection();

export function defaultGameServerUrl(): string {
  const env = import.meta.env.VITE_GAME_SERVER_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.hostname}:8080`;
}
