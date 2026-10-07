function int(name: string, def: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
}

export const config = {
  port: int("PORT", 8787),
  /** Sem DATABASE_URL a API usa PGlite (Postgres embarcado) em memoria ou em PGLITE_DIR. */
  databaseUrl: process.env.DATABASE_URL ?? "",
  pgliteDir: process.env.PGLITE_DIR ?? "",
  /** Sem REDIS_URL a fila de matchmaking e o registro de servidores ficam em memoria. */
  redisUrl: process.env.REDIS_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  internalSecret: process.env.INTERNAL_SECRET ?? "dev-internal-secret",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  /** Game server padrao quando nenhum fez heartbeat (dev). */
  fallbackGameServerUrl: process.env.FALLBACK_GAME_SERVER_URL ?? "ws://localhost:8080",
  fallbackGameServerHttp: process.env.FALLBACK_GAME_SERVER_HTTP ?? "http://localhost:8080",
  serverTtlMs: 15000,
  matchmakingIntervalMs: 1000,
  logLevel: process.env.LOG_LEVEL ?? "info",
};
