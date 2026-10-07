import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createDatabase, ensureSchema, type Database } from "../src/db/client";

let db: Database;
let close: () => Promise<void>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  const created = await createDatabase({ memory: true });
  db = created.db;
  close = created.close;
  await ensureSchema(db);
  app = createApp(db);
});

afterAll(async () => {
  await close();
});

async function guest(name: string) {
  const res = await app.request("/auth/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
  expect(res.status).toBe(200);
  return (await res.json()) as { token: string; user: { id: string; name: string } };
}

describe("maps", () => {
  it("publica, lista, le e bloqueia delete de outro autor", async () => {
    const ana = await guest("Ana");
    const create = await app.request("/maps", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ana.token}` },
      body: JSON.stringify({ name: "Mini Neon", config: { halfLength: 12, halfWidth: 8, theme: { floor: "#112233" } } }),
    });
    expect(create.status).toBe(201);
    const saved = (await create.json()) as { id: string; config: { halfLength: number; theme: { floor: string } } };
    expect(saved.config.halfLength).toBe(12);
    expect(saved.config.theme.floor).toBe("#112233");

    const list = await app.request("/maps");
    const listed = (await list.json()) as { maps: { id: string; name: string }[] };
    expect(listed.maps.some((m) => m.id === saved.id)).toBe(true);

    const one = await app.request(`/maps/${saved.id}`);
    expect(one.status).toBe(200);

    const internal = await app.request(`/internal/maps/${saved.id}`, { headers: { "x-internal-secret": "dev-internal-secret" } });
    expect(internal.status).toBe(200);

    const bia = await guest("Bia");
    const forbidden = await app.request(`/maps/${saved.id}`, { method: "DELETE", headers: { authorization: `Bearer ${bia.token}` } });
    expect(forbidden.status).toBe(403);

    const del = await app.request(`/maps/${saved.id}`, { method: "DELETE", headers: { authorization: `Bearer ${ana.token}` } });
    expect(del.status).toBe(204);
  });
});
