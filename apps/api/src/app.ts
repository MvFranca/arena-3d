import { DEFAULT_LOADOUT, sanitizeArena, sanitizeLoadout, type ArenaConfig } from "@arena/sim";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requireAuth, requireInternal, type AuthEnv } from "./auth/middleware";
import { signToken } from "./auth/jwt";
import { config } from "./config";
import type { Database } from "./db/client";
import { loadouts, maps, playerStats, users } from "./db/schema";

const MAX_MAP_JSON = 8 * 1024;

function clampName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001f]/g, "").trim() : "";
  return s.slice(0, 16);
}

function emptyStats() {
  return { matches: 0, wins: 0, losses: 0, draws: 0, goals: 0, ownGoals: 0, mmr: 1000, level: 1, xp: 0 };
}

function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / 200);
}

export function createApp(db: Database) {
  const app = new Hono<AuthEnv>();
  app.use("*", cors({ origin: config.corsOrigin, allowHeaders: ["content-type", "authorization", "x-internal-secret"], allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/auth/guest", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const name = clampName((body as { name?: string }).name) || "Jogador";
    if (name.length < 2) return c.json({ error: "Nome muito curto." }, 400);
    const [user] = await db.insert(users).values({ name, provider: "guest" }).returning();
    if (!user) return c.json({ error: "falha ao criar conta" }, 500);
    await db.insert(loadouts).values({
      userId: user.id,
      attributes: DEFAULT_LOADOUT.attributes,
      abilityId: DEFAULT_LOADOUT.abilityId,
      archetypeId: DEFAULT_LOADOUT.archetypeId,
      skinId: DEFAULT_LOADOUT.skinId,
    });
    await db.insert(playerStats).values({ userId: user.id });
    const token = await signToken({ sub: user.id, name: user.name, guest: true });
    return c.json({ token, user: { id: user.id, name: user.name, guest: true, createdAt: user.createdAt } });
  });

  app.get("/me", requireAuth, async (c) => {
    const { sub } = c.get("user");
    const [user] = await db.select().from(users).where(eq(users.id, sub)).limit(1);
    if (!user) return c.json({ error: "not_found" }, 404);
    const [lo] = await db.select().from(loadouts).where(eq(loadouts.userId, sub)).limit(1);
    const [st] = await db.select().from(playerStats).where(eq(playerStats.userId, sub)).limit(1);
    const loadout = sanitizeLoadout({
      attributes: lo?.attributes as never,
      abilityId: lo?.abilityId as never,
      archetypeId: lo?.archetypeId ?? undefined,
      skinId: lo?.skinId ?? undefined,
    });
    const stats = st
      ? { matches: st.matches, wins: st.wins, losses: st.losses, draws: st.draws, goals: st.goals, ownGoals: st.ownGoals, mmr: st.mmr, xp: st.xp, level: levelFromXp(st.xp) }
      : emptyStats();
    return c.json({ user: { id: user.id, name: user.name, guest: user.provider === "guest", createdAt: user.createdAt }, loadout, stats });
  });

  app.patch("/me", requireAuth, async (c) => {
    const { sub } = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const name = clampName((body as { name?: string }).name);
    if (name.length < 2) return c.json({ error: "Nome muito curto." }, 400);
    const [user] = await db.update(users).set({ name, lastSeenAt: new Date() }).where(eq(users.id, sub)).returning();
    if (!user) return c.json({ error: "not_found" }, 404);
    return c.json({ user: { id: user.id, name: user.name, guest: user.provider === "guest", createdAt: user.createdAt } });
  });

  app.put("/me/loadout", requireAuth, async (c) => {
    const { sub } = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const loadout = sanitizeLoadout(body);
    await db
      .insert(loadouts)
      .values({ userId: sub, attributes: loadout.attributes, abilityId: loadout.abilityId, archetypeId: loadout.archetypeId, skinId: loadout.skinId })
      .onConflictDoUpdate({
        target: loadouts.userId,
        set: { attributes: loadout.attributes, abilityId: loadout.abilityId, archetypeId: loadout.archetypeId, skinId: loadout.skinId, updatedAt: new Date() },
      });
    return c.json({ loadout });
  });

  app.get("/me/stats", requireAuth, async (c) => {
    const { sub } = c.get("user");
    const [st] = await db.select().from(playerStats).where(eq(playerStats.userId, sub)).limit(1);
    return c.json({ stats: st ? { ...st, level: levelFromXp(st.xp) } : emptyStats() });
  });

  app.get("/me/matches", requireAuth, (c) => c.json({ matches: [] }));
  app.get("/leaderboard", (c) => c.json({ players: [] }));
  app.get("/servers", (c) => c.json({ servers: [{ id: "local", url: config.fallbackGameServerUrl, rooms: 0, capacity: 32 }] }));
  app.post("/matchmaking/queue", requireAuth, (c) => c.json({ error: "matchmaking_offline" }, 503));
  app.get("/matchmaking/status", requireAuth, (c) => c.json({ status: "idle", waitedMs: 0 }));
  app.delete("/matchmaking/queue", requireAuth, (c) => c.body(null, 204));

  app.get("/maps", async (c) => {
    const rows = await db.select({
      id: maps.id,
      name: maps.name,
      authorId: maps.authorId,
      createdAt: maps.createdAt,
      authorName: users.name,
    }).from(maps).innerJoin(users, eq(users.id, maps.authorId)).where(eq(maps.public, true)).orderBy(maps.createdAt);
    return c.json({
      maps: rows
        .slice()
        .reverse()
        .slice(0, 50)
        .map((r) => ({ id: r.id, name: r.name, authorName: r.authorName, createdAt: r.createdAt })),
    });
  });

  app.get("/maps/:id", async (c) => {
    const id = c.req.param("id");
    const [row] = await db.select().from(maps).where(eq(maps.id, id)).limit(1);
    if (!row || !row.public) return c.json({ error: "not_found" }, 404);
    return c.json({ id: row.id, name: row.name, config: row.config, authorId: row.authorId, createdAt: row.createdAt });
  });

  app.post("/maps", requireAuth, async (c) => {
    const { sub } = c.get("user");
    const raw = await c.req.text();
    if (raw.length > MAX_MAP_JSON) return c.json({ error: "mapa grande demais" }, 413);
    let body: { name?: string; config?: Partial<ArenaConfig> };
    try {
      body = JSON.parse(raw) as { name?: string; config?: Partial<ArenaConfig> };
    } catch {
      return c.json({ error: "json inválido" }, 400);
    }
    const name = typeof body.name === "string" ? body.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 32) : "";
    if (name.length < 2) return c.json({ error: "Nome do mapa muito curto." }, 400);
    const arena = sanitizeArena({ ...body.config, name, id: "custom" });
    const [row] = await db.insert(maps).values({ authorId: sub, name, config: arena, public: true }).returning();
    if (!row) return c.json({ error: "falha ao salvar" }, 500);
    return c.json({ id: row.id, name: row.name, config: row.config, createdAt: row.createdAt }, 201);
  });

  app.delete("/maps/:id", requireAuth, async (c) => {
    const { sub } = c.get("user");
    const id = c.req.param("id");
    const [row] = await db.select().from(maps).where(eq(maps.id, id)).limit(1);
    if (!row) return c.json({ error: "not_found" }, 404);
    if (row.authorId !== sub) return c.json({ error: "forbidden" }, 403);
    await db.delete(maps).where(eq(maps.id, id));
    return c.body(null, 204);
  });

  app.get("/internal/maps/:id", requireInternal, async (c) => {
    const id = c.req.param("id");
    const [row] = await db.select().from(maps).where(eq(maps.id, id)).limit(1);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ id: row.id, name: row.name, config: row.config });
  });

  app.get("/internal/users/:id/loadout", requireInternal, async (c) => {
    const id = c.req.param("id");
    const [lo] = await db.select().from(loadouts).where(eq(loadouts.userId, id)).limit(1);
    if (!lo) return c.json({ error: "not_found" }, 404);
    return c.json({
      loadout: sanitizeLoadout({
        attributes: lo.attributes as never,
        abilityId: lo.abilityId as never,
        archetypeId: lo.archetypeId ?? undefined,
        skinId: lo.skinId ?? undefined,
      }),
    });
  });

  return app;
}
