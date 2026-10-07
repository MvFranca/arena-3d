import { boolean, index, integer, jsonb, pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 16 }).notNull(),
  /** "guest" ou um provedor futuro (google, discord...). */
  provider: varchar("provider", { length: 32 }).notNull().default("guest"),
  providerId: varchar("provider_id", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loadouts = pgTable("loadouts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  attributes: jsonb("attributes").notNull(),
  abilityId: varchar("ability_id", { length: 32 }),
  archetypeId: varchar("archetype_id", { length: 32 }),
  skinId: varchar("skin_id", { length: 32 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomCode: varchar("room_code", { length: 8 }).notNull(),
    rulesetId: varchar("ruleset_id", { length: 32 }).notNull(),
    arenaId: varchar("arena_id", { length: 32 }).notNull(),
    ranked: boolean("ranked").notNull().default(false),
    scoreLeft: integer("score_left").notNull(),
    scoreRight: integer("score_right").notNull(),
    winner: varchar("winner", { length: 8 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("matches_ended_idx").on(t.endedAt)],
);

export const matchParticipants = pgTable(
  "match_participants",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    team: varchar("team", { length: 8 }).notNull(),
    goals: integer("goals").notNull().default(0),
    ownGoals: integer("own_goals").notNull().default(0),
    result: varchar("result", { length: 8 }).notNull(),
    mmrBefore: integer("mmr_before").notNull().default(1000),
    mmrAfter: integer("mmr_after").notNull().default(1000),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] }), index("participants_user_idx").on(t.userId)],
);

export const maps = pgTable(
  "maps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 32 }).notNull(),
    config: jsonb("config").notNull(),
    public: boolean("public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("maps_created_idx").on(t.createdAt)],
);

export const playerStats = pgTable("player_stats", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  matches: integer("matches").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  goals: integer("goals").notNull().default(0),
  ownGoals: integer("own_goals").notNull().default(0),
  mmr: integer("mmr").notNull().default(1000),
  xp: integer("xp").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schema = { users, loadouts, matches, matchParticipants, playerStats, maps };
