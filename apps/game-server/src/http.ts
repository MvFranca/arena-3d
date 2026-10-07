import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { config } from "./config";
import { metrics } from "./metrics";
import type { GameServer } from "./net/GameServer";
import type { RoomManager } from "./rooms/RoomManager";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-internal-secret",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

/** Endpoints HTTP do processo: saude, metricas e alocacao interna de salas. */
export function createHttpHandler(rooms: RoomManager, game: GameServer) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "OPTIONS") return json(res, 204, {});

    if (url.pathname === "/health") {
      return json(res, 200, { ok: true, id: config.serverId, rooms: rooms.count, capacity: rooms.capacity, tick: game.tick });
    }

    if (url.pathname === "/metrics") {
      return json(res, 200, {
        server: config.serverId,
        uptimeSeconds: Math.round((Date.now() - metrics.startedAt) / 1000),
        rooms: rooms.count,
        roomCapacity: rooms.capacity,
        sessions: game.sessionCount,
        connections: metrics.connections,
        tickMs: metrics.tickMs.summary(),
        slowTicks: metrics.slowTicks,
        snapshotBytes: metrics.snapshotBytes.summary(),
        inputsDropped: metrics.inputsDropped,
        inputsLate: metrics.inputsLate,
        roomsDetail: rooms.list().map((r) => ({ code: r.code, players: r.playerCount, phase: r.phase, ruleset: r.ruleset.id })),
      });
    }

    if (url.pathname === "/rooms" && req.method === "GET") {
      return json(res, 200, {
        rooms: rooms
          .list()
          .filter((r) => !r.automatic && r.phase === "lobby")
          .map((r) => ({ code: r.code, players: r.playerCount, max: r.ruleset.maxPlayers, ruleset: r.ruleset.id })),
      });
    }

    // Alocacao de sala pela API (matchmaking). Exige segredo compartilhado.
    if (url.pathname === "/internal/rooms" && req.method === "POST") {
      if (req.headers["x-internal-secret"] !== config.internalSecret) return json(res, 401, { error: "unauthorized" });
      try {
        const body = await readBody(req);
        const ticket = randomBytes(12).toString("base64url");
        const room = rooms.create(String(body.rulesetId ?? "duel"), {
          automatic: true,
          reserved: Array.isArray(body.playerIds) ? body.playerIds.map(String) : [],
          ticket,
          ranked: body.ranked === true,
        });
        return json(res, 201, { code: room.code, ticket, url: config.publicUrl });
      } catch (err) {
        return json(res, 400, { error: (err as Error).message });
      }
    }

    json(res, 404, { error: "not_found" });
  };
}
