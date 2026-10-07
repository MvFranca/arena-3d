import { getArena, isBuiltinArena, sanitizeArena, sanitizeLoadout, type ArenaConfig, type Loadout } from "@arena/sim";
import { config } from "./config";
import { log } from "./log";
import type { MatchResultReport } from "./rooms/MatchRoom";

/** Cliente da API da plataforma. Tudo aqui e opcional: sem API_URL o servidor roda isolado. */
class PlatformClient {
  readonly enabled = config.apiUrl.length > 0;

  private headers(): Record<string, string> {
    return { "content-type": "application/json", "x-internal-secret": config.internalSecret };
  }

  async fetchLoadout(playerId: string): Promise<Loadout | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`${config.apiUrl}/internal/users/${encodeURIComponent(playerId)}/loadout`, { headers: this.headers() });
      if (!res.ok) return null;
      const body = (await res.json()) as { loadout: Partial<Loadout> };
      return sanitizeLoadout(body.loadout);
    } catch (err) {
      log.warn({ err: (err as Error).message }, "falha ao buscar loadout");
      return null;
    }
  }

  async reportResult(report: MatchResultReport): Promise<void> {
    if (!this.enabled) return;
    try {
      const res = await fetch(`${config.apiUrl}/internal/matches`, { method: "POST", headers: this.headers(), body: JSON.stringify(report) });
      if (!res.ok) log.warn({ status: res.status }, "API rejeitou resultado");
    } catch (err) {
      log.warn({ err: (err as Error).message }, "falha ao reportar resultado");
    }
  }

  async fetchMap(mapId: string): Promise<ArenaConfig | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`${config.apiUrl}/internal/maps/${encodeURIComponent(mapId)}`, { headers: this.headers() });
      if (!res.ok) return null;
      const body = (await res.json()) as { config?: Partial<ArenaConfig> };
      return sanitizeArena(body.config);
    } catch (err) {
      log.warn({ err: (err as Error).message, mapId }, "falha ao buscar mapa");
      return null;
    }
  }

  async heartbeat(rooms: number, capacity: number): Promise<void> {
    if (!this.enabled) return;
    try {
      await fetch(`${config.apiUrl}/internal/servers/heartbeat`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ id: config.serverId, url: config.publicUrl, rooms, capacity }),
      });
    } catch (err) {
      log.debug({ err: (err as Error).message }, "heartbeat falhou");
    }
  }
}

export const platform = new PlatformClient();

/** Builtin local ou fetch na API. Ranked nao aceita custom. */
export async function resolveRoomMap(mapId: string | undefined, ranked: boolean, fallbackId: string): Promise<{ mapId: string; arena: ArenaConfig }> {
  const id = mapId && mapId.length > 0 ? mapId : fallbackId;
  if (isBuiltinArena(id)) return { mapId: id, arena: getArena(id) };
  if (ranked) throw new Error("custom_map_ranked");
  const arena = await platform.fetchMap(id);
  if (!arena) throw new Error("unknown_map");
  return { mapId: id, arena };
}
