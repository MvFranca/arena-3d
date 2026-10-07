import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";
import { log } from "../log";
import { schema } from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Em producao: Postgres via DATABASE_URL. Em dev/teste: PGlite, o mesmo
 * dialeto embarcado, sem servico externo. O codigo da API nao ve a diferenca.
 */
export async function createDatabase(opts: { memory?: boolean } = {}): Promise<{ db: Database; close(): Promise<void> }> {
  if (config.databaseUrl && !opts.memory) {
    const client = postgres(config.databaseUrl, { max: 10 });
    const db = drizzlePostgres(client, { schema }) as unknown as Database;
    log.info("banco: postgres");
    return { db, close: () => client.end() };
  }
  const pg = opts.memory || !config.pgliteDir ? new PGlite() : new PGlite(config.pgliteDir);
  const db = drizzlePglite(pg, { schema }) as unknown as Database;
  log.info({ dir: opts.memory ? "memoria" : config.pgliteDir || "memoria" }, "banco: pglite");
  return { db, close: () => pg.close() };
}

/** Cria as tabelas se nao existirem. Em producao, prefira drizzle-kit migrate. */
export async function ensureSchema(db: Database): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(16) NOT NULL,
      provider varchar(32) NOT NULL DEFAULT 'guest',
      provider_id varchar(128),
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS loadouts (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      attributes jsonb NOT NULL,
      ability_id varchar(32),
      archetype_id varchar(32),
      skin_id varchar(32),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS matches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_code varchar(8) NOT NULL,
      ruleset_id varchar(32) NOT NULL,
      arena_id varchar(32) NOT NULL,
      ranked boolean NOT NULL DEFAULT false,
      score_left integer NOT NULL,
      score_right integer NOT NULL,
      winner varchar(8) NOT NULL,
      started_at timestamptz NOT NULL,
      ended_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS matches_ended_idx ON matches(ended_at);
    CREATE TABLE IF NOT EXISTS match_participants (
      match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team varchar(8) NOT NULL,
      goals integer NOT NULL DEFAULT 0,
      own_goals integer NOT NULL DEFAULT 0,
      result varchar(8) NOT NULL,
      mmr_before integer NOT NULL DEFAULT 1000,
      mmr_after integer NOT NULL DEFAULT 1000,
      PRIMARY KEY (match_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS participants_user_idx ON match_participants(user_id);
    CREATE TABLE IF NOT EXISTS player_stats (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      matches integer NOT NULL DEFAULT 0,
      wins integer NOT NULL DEFAULT 0,
      losses integer NOT NULL DEFAULT 0,
      draws integer NOT NULL DEFAULT 0,
      goals integer NOT NULL DEFAULT 0,
      own_goals integer NOT NULL DEFAULT 0,
      mmr integer NOT NULL DEFAULT 1000,
      xp integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}
