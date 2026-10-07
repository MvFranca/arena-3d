import { randomUUID } from "node:crypto";

function int(name: string, def: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

export const config = {
  /** Identidade deste processo no registro de servidores. */
  serverId: process.env.SERVER_ID ?? randomUUID().slice(0, 8),
  port: int("PORT", 8080),
  /** URL publica que os clientes usam para alcancar este processo. */
  publicUrl: process.env.PUBLIC_WS_URL ?? `ws://localhost:${int("PORT", 8080)}`,
  maxRooms: int("MAX_ROOMS", 24),
  /** Em dev, aceita convidados sem token. Em producao, exige JWT da API. */
  allowAnonymous: (process.env.ALLOW_ANON ?? "true") === "true",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  /** API da plataforma. Opcional: sem ela o servidor roda em modo isolado. */
  apiUrl: process.env.API_URL ?? "",
  /** Segredo compartilhado para chamadas servidor<->API. */
  internalSecret: process.env.INTERNAL_SECRET ?? "dev-internal-secret",
  reconnectGraceMs: int("RECONNECT_GRACE_MS", 15000),
  /** Depois de terminar, a sala volta ao lobby apos este tempo. */
  postMatchResetMs: int("POST_MATCH_RESET_MS", 12000),
  /** Sala vazia e destruida depois disso. */
  emptyRoomTtlMs: int("EMPTY_ROOM_TTL_MS", 60000),
  /** Orcamento por tick antes de registrar atraso. */
  tickBudgetMs: 4,
  /** Limite de pacotes de input por segundo por conexao. */
  maxInputPacketsPerSecond: 150,
  logLevel: process.env.LOG_LEVEL ?? "info",
};
