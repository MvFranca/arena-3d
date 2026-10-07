import { FIXED_DT, initPhysics } from "@arena/sim";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { log } from "./log";
import { metrics } from "./metrics";
import { GameServer } from "./net/GameServer";
import { platform } from "./platform";
import { RoomManager } from "./rooms/RoomManager";
import { createHttpHandler } from "./http";

const DT_MS = FIXED_DT * 1000;

async function main(): Promise<void> {
  await initPhysics();

  const rooms = new RoomManager((report) => void platform.reportResult(report));
  const http = createServer();
  const wss = new WebSocketServer({ server: http, maxPayload: 4096 });
  const game = new GameServer(wss, rooms);
  rooms.nowTick = () => game.tick;
  http.on("request", createHttpHandler(rooms, game));

  // Loop de ticks com relogio monotonico e acumulador. Nao usa setInterval.
  let last = performance.now();
  let accumulator = 0;
  let sweepAt = 0;
  const loop = () => {
    const now = performance.now();
    accumulator += Math.min(now - last, 250);
    last = now;
    let steps = 0;
    while (accumulator >= DT_MS && steps < 5) {
      const t0 = performance.now();
      game.tickStartMs = t0;
      rooms.tickAll();
      game.tick++;
      const dur = performance.now() - t0;
      metrics.tickMs.record(dur);
      if (dur > config.tickBudgetMs) metrics.slowTicks++;
      accumulator -= DT_MS;
      steps++;
    }
    if (steps >= 5) {
      // Ficamos para tras demais: descarta o tempo em vez de entrar em espiral.
      log.warn({ accumulatorMs: accumulator.toFixed(1) }, "tick atrasado; descartando acumulado");
      accumulator = 0;
    }
    if (now > sweepAt) {
      sweepAt = now + 1000;
      rooms.sweep(Date.now());
      game.sweep(Date.now());
    }
    const wait = Math.max(0, DT_MS - accumulator);
    setTimeout(loop, wait > 2 ? wait - 1 : 0);
  };
  loop();

  if (platform.enabled) {
    const beat = () => void platform.heartbeat(rooms.count, rooms.capacity);
    beat();
    setInterval(beat, 5000);
  }

  http.listen(config.port, "0.0.0.0", () => {
    log.info({ port: config.port, publicUrl: config.publicUrl, api: platform.enabled ? config.apiUrl : "isolado", anon: config.allowAnonymous }, "game server pronto");
  });

  const shutdown = () => {
    log.info("encerrando");
    game.closeAll();
    wss.close();
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.fatal({ err }, "falha ao iniciar");
  process.exit(1);
});
