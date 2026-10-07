import { DEFAULT_LOADOUT, sanitizeLoadout, type Loadout } from "@arena/sim";
import { jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { config } from "./config";
import { log } from "./log";
import { platform } from "./platform";

export interface Identity {
  playerId: string;
  name: string;
  guest: boolean;
  loadout: Loadout;
}

const secret = new TextEncoder().encode(config.jwtSecret);

function cleanName(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 16) : "";
  return s.length >= 2 ? s : fallback;
}

/**
 * Resolve quem esta do outro lado do socket. Com token, a identidade e o
 * loadout vem da plataforma: nada que o cliente mandou sobre atributos e usado.
 */
export async function resolveIdentity(hello: { token?: string; name?: string; loadout?: Partial<Loadout> }): Promise<Identity | null> {
  if (hello.token) {
    try {
      const { payload } = await jwtVerify(hello.token, secret, { algorithms: ["HS256"] });
      const playerId = String(payload.sub ?? "");
      if (!playerId) return null;
      const name = cleanName(payload.name, "Jogador");
      const guest = payload.guest === true;
      let loadout: Loadout | null = null;
      if (platform.enabled) loadout = await platform.fetchLoadout(playerId);
      if (!loadout) loadout = sanitizeLoadout(hello.loadout ?? DEFAULT_LOADOUT);
      return { playerId, name, guest, loadout };
    } catch (err) {
      log.warn({ err: (err as Error).message }, "token invalido");
      if (!config.allowAnonymous) return null;
    }
  }
  if (!config.allowAnonymous) return null;
  return {
    playerId: `anon_${randomUUID().slice(0, 12)}`,
    name: cleanName(hello.name, "Convidado"),
    guest: true,
    loadout: sanitizeLoadout(hello.loadout ?? DEFAULT_LOADOUT),
  };
}
