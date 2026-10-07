import { createDatabase, ensureSchema } from "./client";

const { db, close } = await createDatabase();
await ensureSchema(db);
await close();
console.log("schema ok");
