import { BufferWriter, decodePong, decodeSnapshot, encodeInputPacket, encodePing, OP, parseServerMessage, PROTOCOL_VERSION, readOpcode, type RoomInfo, type ServerMessage, type Snapshot, type TimedInput } from "@arena/protocol";
import { initPhysics } from "@arena/sim";
import { createServer, type Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { GameServer } from "../src/net/GameServer";
import { RoomManager } from "../src/rooms/RoomManager";
import { createHttpHandler } from "../src/http";
import type { MatchResultReport } from "../src/rooms/MatchRoom";

export interface TestServer {
  port: number;
  rooms: RoomManager;
  game: GameServer;
  results: MatchResultReport[];
  tick(n: number): void;
  close(): Promise<void>;
}

/** Sobe um servidor em porta livre, com o tick controlado pelo teste. */
export async function startServer(): Promise<TestServer> {
  await initPhysics();
  const results: MatchResultReport[] = [];
  const rooms = new RoomManager((r) => results.push(r));
  const http: Server = createServer();
  const wss = new WebSocketServer({ server: http });
  const game = new GameServer(wss, rooms);
  rooms.nowTick = () => game.tick;
  http.on("request", createHttpHandler(rooms, game));
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as { port: number }).port;
  return {
    port,
    rooms,
    game,
    results,
    tick(n) {
      for (let i = 0; i < n; i++) {
        rooms.tickAll();
        game.tick++;
      }
    },
    close: () =>
      new Promise<void>((r) => {
        game.closeAll();
        wss.close();
        http.close(() => r());
      }),
  };
}

export class TestClient {
  ws!: WebSocket;
  playerId = "";
  sessionId = "";
  room: RoomInfo | null = null;
  mySlot = -1;
  snapshots: Snapshot[] = [];
  events: any[] = [];
  errors: { code: string; message: string }[] = [];
  left = 0;
  lastPongTick = -1;
  private readonly writer = new BufferWriter(64);
  private seq = 0;

  constructor(private readonly port: number) {}

  async connect(name: string, sessionId?: string): Promise<void> {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    this.ws.binaryType = "arraybuffer";
    this.ws.on("message", (data, isBinary) => {
      if (isBinary) {
        const { op, reader } = readOpcode(new Uint8Array(data as ArrayBuffer));
        if (op === OP.SNAPSHOT) this.snapshots.push(decodeSnapshot(reader));
        else if (op === OP.PONG) this.lastPongTick = decodePong(reader).serverTick;
        return;
      }
      const msg = parseServerMessage(data.toString());
      if (msg) this.onMsg(msg);
    });
    await new Promise<void>((r) => this.ws.once("open", () => r()));
    this.ws.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, name, sessionId }));
    await this.waitFor(() => this.playerId !== "");
  }

  private onMsg(msg: ServerMessage): void {
    switch (msg.t) {
      case "welcome":
        this.playerId = msg.playerId;
        this.sessionId = msg.sessionId;
        break;
      case "room":
        this.room = msg.room;
        this.mySlot = msg.you.slot;
        break;
      case "event":
        this.events.push(msg.ev);
        break;
      case "error":
        this.errors.push({ code: msg.code, message: msg.message });
        break;
      case "left":
        this.left++;
        this.room = null;
        break;
      default:
        break;
    }
  }

  send(msg: object): void {
    this.ws.send(JSON.stringify(msg));
  }

  sendInput(tick: number, partial: Partial<TimedInput>): void {
    const inp: TimedInput = { seq: ++this.seq, tick, dirX: 0, dirZ: 0, kick: false, ability: false, ...partial };
    this.ws.send(encodeInputPacket(this.writer, [inp]));
  }

  ping(): void {
    this.ws.send(encodePing(this.writer, Date.now()));
  }

  get lastSeq(): number {
    return this.seq;
  }

  async waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > timeoutMs) throw new Error("timeout esperando condicao");
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  close(): void {
    this.ws.close();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
