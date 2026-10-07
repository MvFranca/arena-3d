import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { config } from "./config";
import { createDatabase, ensureSchema } from "./db/client";
import { log } from "./log";

const { db } = await createDatabase();
await ensureSchema(db);
const app = createApp(db);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info({ port: info.port }, "api ouvindo");
});
