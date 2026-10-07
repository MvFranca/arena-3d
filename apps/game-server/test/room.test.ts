import { PLAYER_FLAG_CONNECTED, TICK_RATE } from "@arena/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sleep, startServer, TestClient, type TestServer } from "./helpers";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.close();
});

describe("sala", () => {
  it("cria, entra com codigo, fica pronto e comeca", async () => {
    const a = new TestClient(server.port);
    const b = new TestClient(server.port);
    await a.connect("Ana");
    await b.connect("Bia");

    a.send({ t: "create", rulesetId: "duel" });
    await a.waitFor(() => !!a.room);
    expect(a.room!.players).toHaveLength(1);
    expect(a.room!.players[0]!.isHost).toBe(true);

    b.send({ t: "join", code: a.room!.code });
    await b.waitFor(() => !!b.room && b.room.players.length === 2);
    await a.waitFor(() => !!a.room && a.room.players.length === 2);
    const teams = a.room!.players.map((p) => p.team).sort();
    expect(teams).toEqual(["left", "right"]);

    a.send({ t: "start" });
    await a.waitFor(() => a.errors.length > 0);
    expect(a.errors[0]!.code).toBe("not_everyone_ready");

    b.send({ t: "ready", ready: true });
    await a.waitFor(() => !!a.room?.players.find((p) => p.name === "Bia")?.ready);
    a.send({ t: "start" });
    await a.waitFor(() => a.room?.phase === "countdown");

    server.tick(TICK_RATE * 3 + 5);
    await sleep(30);
    const snap = a.snapshots[a.snapshots.length - 1]!;
    expect(snap.phase).toBe("playing");
    expect(snap.players).toHaveLength(2);
    expect(a.events.some((e) => e.type === "match_started")).toBe(true);
    a.close();
    b.close();
  });

  it("codigo errado devolve erro", async () => {
    const a = new TestClient(server.port);
    await a.connect("Ana");
    a.send({ t: "join", code: "ZZZZZ" });
    await a.waitFor(() => a.errors.length > 0);
    expect(a.errors[0]!.code).toBe("not_found");
    a.close();
  });
});

describe("inputs e autoridade", () => {
  it("input move o jogador e lastSeq confirma; atributos do cliente sao ignorados", async () => {
    const a = new TestClient(server.port);
    const b = new TestClient(server.port);
    await a.connect("Ana");
    await b.connect("Bia");
    a.send({ t: "create", rulesetId: "duel" });
    await a.waitFor(() => !!a.room);
    b.send({ t: "join", code: a.room!.code });
    await b.waitFor(() => !!b.room && b.room.players.length === 2);
    b.send({ t: "ready", ready: true });
    await a.waitFor(() => !!a.room?.players.find((p) => p.name === "Bia")?.ready);
    a.send({ t: "start" });
    await a.waitFor(() => a.room?.phase === "countdown");
    server.tick(TICK_RATE * 3 + 2);
    await sleep(20);

    const before = a.snapshots[a.snapshots.length - 1]!.players.find((p) => p.slot === a.mySlot)!;
    // Envia input para os proximos ticks.
    for (let i = 0; i < 30; i++) a.sendInput(server.game.tick + 2 + i, { dirZ: 1 });
    await sleep(30);
    server.tick(40);
    await sleep(30);
    const after = a.snapshots[a.snapshots.length - 1]!.players.find((p) => p.slot === a.mySlot)!;
    expect(after.z).toBeGreaterThan(before.z + 1);
    expect(after.lastSeq).toBe(a.lastSeq);

    // Input com tick muito no futuro e descartado (nao gera erro nem movimento extra).
    a.sendInput(server.game.tick + 500, { dirX: 1 });
    await sleep(20);
    server.tick(5);
    await sleep(20);
    const later = a.snapshots[a.snapshots.length - 1]!.players.find((p) => p.slot === a.mySlot)!;
    expect(Math.abs(later.vx)).toBeLessThan(0.5);
    a.close();
    b.close();
  });

  it("input ainda move depois que o processo ja rodou muitos ticks", async () => {
    server.tick(50_000);
    const a = new TestClient(server.port);
    const b = new TestClient(server.port);
    await a.connect("Ana");
    await b.connect("Bia");
    a.send({ t: "create", rulesetId: "duel" });
    await a.waitFor(() => !!a.room);
    b.send({ t: "join", code: a.room!.code });
    await b.waitFor(() => !!b.room && b.room.players.length === 2);
    a.ping();
    await a.waitFor(() => a.lastPongTick >= 0);
    expect(a.lastPongTick).toBeGreaterThan(49_000);

    b.send({ t: "ready", ready: true });
    await a.waitFor(() => !!a.room?.players.find((p) => p.name === "Bia")?.ready);
    a.send({ t: "start" });
    await a.waitFor(() => a.room?.phase === "countdown");
    server.tick(TICK_RATE * 3 + 2);
    await sleep(20);

    a.ping();
    await a.waitFor(() => a.lastPongTick > 50_000);
    const before = a.snapshots[a.snapshots.length - 1]!.players.find((p) => p.slot === a.mySlot)!;
    const base = a.lastPongTick;
    for (let i = 0; i < 30; i++) a.sendInput(base + 2 + i, { dirZ: 1 });
    await sleep(30);
    server.tick(40);
    await sleep(30);
    const after = a.snapshots[a.snapshots.length - 1]!.players.find((p) => p.slot === a.mySlot)!;
    expect(after.z).toBeGreaterThan(before.z + 1);
    a.close();
    b.close();
  });
});

describe("reconexao", () => {
  it("jogador que cai volta para a mesma vaga com o sessionId", async () => {
    const a = new TestClient(server.port);
    const b = new TestClient(server.port);
    await a.connect("Ana");
    await b.connect("Bia");
    a.send({ t: "create", rulesetId: "duel" });
    await a.waitFor(() => !!a.room);
    const code = a.room!.code;
    b.send({ t: "join", code });
    await a.waitFor(() => !!a.room && a.room.players.length === 2);

    const slotB = b.mySlot;
    const idB = b.playerId;
    const sessionB = b.sessionId;
    b.close();
    await a.waitFor(() => a.room?.players.find((p) => p.id === idB)?.connected === false);
    server.tick(3);
    await sleep(20);
    const snap = a.snapshots[a.snapshots.length - 1]!;
    const pb = snap.players.find((p) => p.slot === slotB)!;
    expect(pb.flags & PLAYER_FLAG_CONNECTED).toBe(0);

    const b2 = new TestClient(server.port);
    await b2.connect("Bia", sessionB);
    expect(b2.playerId).toBe(idB);
    await b2.waitFor(() => !!b2.room);
    expect(b2.mySlot).toBe(slotB);
    await a.waitFor(() => a.room?.players.find((p) => p.id === idB)?.connected === true);
    expect(a.room!.players).toHaveLength(2);
    a.close();
    b2.close();
  });

  it("sala e destruida quando o ultimo jogador sai", async () => {
    const a = new TestClient(server.port);
    await a.connect("Ana");
    a.send({ t: "create", rulesetId: "duel" });
    await a.waitFor(() => !!a.room);
    expect(server.rooms.count).toBe(1);
    a.send({ t: "leave" });
    await a.waitFor(() => a.left === 1);
    expect(server.rooms.count).toBe(0);
    a.close();
  });
});

describe("mapa da sala", () => {
  it("create com mapId builtin resolve a arena e o host troca no lobby", async () => {
    const a = new TestClient(server.port);
    const b = new TestClient(server.port);
    await a.connect("Ana");
    await b.connect("Bia");
    a.send({ t: "create", rulesetId: "duel", mapId: "rooftop" });
    await a.waitFor(() => !!a.room);
    expect(a.room!.mapId).toBe("rooftop");
    expect(a.room!.arena.id).toBe("rooftop");
    expect(a.room!.arena.name).toBe("Terraco Solar");

    b.send({ t: "join", code: a.room!.code });
    await b.waitFor(() => !!b.room && b.room.players.length === 2);
    b.send({ t: "set_map", mapId: "classic" });
    await b.waitFor(() => b.errors.some((e) => e.code === "not_host"));

    a.send({ t: "set_map", mapId: "classic" });
    await a.waitFor(() => a.room?.mapId === "classic");
    expect(a.room!.arena.id).toBe("classic");
    a.close();
    b.close();
  });
});

describe("alocacao interna", () => {
  it("POST /internal/rooms cria sala reservada que so aceita convidados com ticket", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/internal/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": "dev-internal-secret" },
      body: JSON.stringify({ rulesetId: "duel", playerIds: ["anon_nobody"] }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { code: string; ticket: string };
    const a = new TestClient(server.port);
    await a.connect("Ana");
    a.send({ t: "join", code: body.code, ticket: body.ticket });
    await a.waitFor(() => a.errors.length > 0);
    expect(a.errors[0]!.code).toBe("not_invited");
    const bad = await fetch(`http://127.0.0.1:${server.port}/internal/rooms`, { method: "POST", headers: { "x-internal-secret": "wrong" } });
    expect(bad.status).toBe(401);
    a.close();
  });
});
