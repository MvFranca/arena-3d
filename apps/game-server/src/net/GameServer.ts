import {
  BufferWriter,
  decodeInputPacket,
  decodePing,
  encodePong,
  OP,
  parseClientMessage,
  PROTOCOL_VERSION,
  readOpcode,
  type ClientMessage,
} from "@arena/protocol";
import { FIXED_DT } from "@arena/sim";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { resolveIdentity } from "../auth";
import { resolveRoomMap } from "../platform";
import { config } from "../config";
import { log } from "../log";
import { metrics } from "../metrics";
import type { RoomManager } from "../rooms/RoomManager";
import { Session } from "./Session";

const DT_MS = FIXED_DT * 1000;

/**
 * Camada de socket: autentica, roteia mensagens para a sala e cuida da
 * reconexao por sessionId. Nenhuma regra de jogo vive aqui.
 */
export class GameServer {
  private readonly sessions = new Map<string, Session>();
  private readonly byPlayer = new Map<string, Session>();
  private readonly writer = new BufferWriter(32);
  /** Tick global aproximado, usado so para o relogio do cliente. */
  tick = 0;
  tickStartMs = performance.now();

  constructor(
    private readonly wss: WebSocketServer,
    private readonly rooms: RoomManager,
  ) {
    wss.on("connection", (ws, req) => this.onConnection(ws, req));
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    metrics.connections++;
    let session: Session | null = null;
    const ip = req.socket.remoteAddress;
    log.debug({ ip }, "socket aberto");

    const helloTimeout = setTimeout(() => {
      if (!session) ws.close(4001, "hello timeout");
    }, 8000);

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        if (session) this.onBinary(session, data as Buffer);
        return;
      }
      const msg = parseClientMessage(data.toString());
      if (!msg) return;
      if (!session) {
        if (msg.t !== "hello") return;
        void this.onHello(ws, msg).then((s) => {
          clearTimeout(helloTimeout);
          session = s;
          if (!s) ws.close(4003, "unauthorized");
        });
        return;
      }
      this.onJson(session, msg);
    });

    ws.on("close", () => {
      clearTimeout(helloTimeout);
      metrics.connections--;
      if (!session || session.ws !== ws) return;
      session.detach();
      session.room?.markDisconnected(session.playerId);
      log.debug({ player: session.playerId }, "socket fechado");
      // Sessao sem sala some na hora; com sala espera o tempo de graca.
      if (!session.room) this.dropSession(session);
    });

    ws.on("error", (err) => log.debug({ err: err.message }, "socket erro"));
  }

  private async onHello(ws: WebSocket, msg: Extract<ClientMessage, { t: "hello" }>): Promise<Session | null> {
    if (msg.v !== PROTOCOL_VERSION) {
      ws.send(JSON.stringify({ t: "error", code: "protocol", message: "Versão do cliente incompatível. Recarregue a página." }));
      return null;
    }
    // Reconexao pela sessao anterior.
    if (msg.sessionId) {
      const prev = this.sessions.get(msg.sessionId);
      if (prev && !prev.connected) {
        prev.attach(ws);
        prev.send({ t: "welcome", playerId: prev.playerId, sessionId: prev.id, serverTick: this.tick });
        if (prev.room) prev.room.join(prev);
        return prev;
      }
    }
    const identity = await resolveIdentity(msg);
    if (!identity) {
      ws.send(JSON.stringify({ t: "error", code: "unauthorized", message: "Não foi possível autenticar." }));
      return null;
    }
    // Mesma identidade em outra conexao: derruba a antiga.
    const dup = this.byPlayer.get(identity.playerId);
    if (dup) {
      dup.send({ t: "kicked", reason: "Conectado em outra aba." });
      dup.ws?.close(4002, "duplicate");
      if (dup.room && dup.room.phase !== "lobby") {
        // Mantem a vaga: a nova sessao assume.
        dup.attach(ws);
        dup.name = identity.name;
        dup.send({ t: "welcome", playerId: dup.playerId, sessionId: dup.id, serverTick: this.tick });
        dup.room.join(dup);
        return dup;
      }
      this.dropSession(dup);
    }
    const session = new Session(randomUUID(), identity.playerId, identity.name, identity.loadout, identity.guest);
    session.attach(ws);
    this.sessions.set(session.id, session);
    this.byPlayer.set(session.playerId, session);
    session.send({ t: "welcome", playerId: session.playerId, sessionId: session.id, serverTick: this.tick });
    log.info({ player: session.playerId, name: session.name, guest: session.guest }, "sessao criada");
    return session;
  }

  private onJson(session: Session, msg: ClientMessage): void {
    switch (msg.t) {
      case "create": {
        void this.handleCreate(session, msg);
        break;
      }
      case "join": {
        const room = this.rooms.get(msg.code);
        if (!room) {
          session.send({ t: "error", code: "not_found", message: "Sala não encontrada." });
          return;
        }
        const reason = room.canJoin(session, msg.ticket);
        if (reason) {
          session.send({ t: "error", code: reason, message: errorText(reason) });
          return;
        }
        if (session.room && session.room !== room) session.room.leave(session.playerId);
        room.join(session);
        break;
      }
      case "team":
        if (msg.team === "left" || msg.team === "right") session.room?.setTeam(session.playerId, msg.team);
        break;
      case "ready":
        session.room?.setReady(session.playerId, !!msg.ready);
        break;
      case "start": {
        const reason = session.room?.requestStart(session.playerId);
        if (reason) session.send({ t: "error", code: reason, message: errorText(reason) });
        break;
      }
      case "set_map": {
        void this.handleSetMap(session, msg.mapId);
        break;
      }
      case "leave":
        session.room?.leave(session.playerId);
        break;
      default:
        break;
    }
  }

  private async handleCreate(session: Session, msg: Extract<ClientMessage, { t: "create" }>): Promise<void> {
    if (session.room) session.room.leave(session.playerId);
    try {
      const room = await this.rooms.create(msg.rulesetId, { mapId: msg.mapId });
      room.join(session);
    } catch (err) {
      session.send({ t: "error", code: String((err as Error).message), message: errorText((err as Error).message) });
    }
  }

  private async handleSetMap(session: Session, mapId: string): Promise<void> {
    const room = session.room;
    if (!room) return;
    try {
      const resolved = await resolveRoomMap(mapId, room.ranked, room.ruleset.arenaId);
      const reason = room.setMap(session.playerId, resolved.mapId, resolved.arena);
      if (reason) session.send({ t: "error", code: reason, message: errorText(reason) });
    } catch (err) {
      session.send({ t: "error", code: String((err as Error).message), message: errorText((err as Error).message) });
    }
  }

  private onBinary(session: Session, data: Buffer): void {
    if (data.length < 1) return;
    const { op, reader } = readOpcode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    if (op === OP.INPUT) {
      if (!session.allowInputPacket(Date.now())) {
        metrics.inputsDropped++;
        return;
      }
      if (!session.room) return;
      session.room.handleInput(session.playerId, decodeInputPacket(reader));
    } else if (op === OP.PING) {
      const { clientTimeMs } = decodePing(reader);
      const fraction = Math.min(0.999, (performance.now() - this.tickStartMs) / DT_MS);
      session.sendBinary(encodePong(this.writer, clientTimeMs, this.tick, fraction));
    }
  }

  /** Remove sessoes desconectadas cujo tempo de graca acabou e que nao estao em sala. */
  sweep(now: number): void {
    for (const s of this.sessions.values()) {
      if (!s.connected && s.disconnectedAt !== null && now - s.disconnectedAt > config.reconnectGraceMs) {
        s.room?.leave(s.playerId);
        this.dropSession(s);
      }
    }
  }

  private dropSession(s: Session): void {
    this.sessions.delete(s.id);
    if (this.byPlayer.get(s.playerId) === s) this.byPlayer.delete(s.playerId);
  }

  closeAll(): void {
    for (const s of this.sessions.values()) s.ws?.close(1001, "shutdown");
  }
}

function errorText(code: string): string {
  const map: Record<string, string> = {
    room_full: "A sala está cheia.",
    not_invited: "Esta sala é de uma partida automática.",
    bad_ticket: "Convite inválido para esta sala.",
    match_in_progress: "A partida já começou.",
    room_closed: "A sala foi encerrada.",
    server_full: "Servidor lotado. Tente de novo em instantes.",
    unknown_ruleset: "Modo de jogo desconhecido.",
    not_host: "Só o host pode fazer isso.",
    already_started: "A partida já começou.",
    need_two_players: "Precisa de pelo menos 2 jogadores.",
    not_everyone_ready: "Todos precisam estar prontos.",
    automatic_room: "Esta sala começa sozinha.",
    unknown_map: "Mapa não encontrado.",
    custom_map_ranked: "Partida ranqueada só usa mapas oficiais.",
  };
  return map[code] ?? code;
}
