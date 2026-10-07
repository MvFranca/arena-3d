import type { Loadout } from "@arena/sim";
import { getState, setState } from "../app/store";

export interface ApiUser {
  id: string;
  name: string;
  guest: boolean;
  createdAt: string;
}

export interface PlayerStats {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  goals: number;
  ownGoals: number;
  mmr: number;
  level: number;
  xp: number;
}

export interface MatchHistoryItem {
  id: string;
  rulesetId: string;
  arenaId: string;
  scoreLeft: number;
  scoreRight: number;
  team: "left" | "right";
  result: "win" | "loss" | "draw";
  goals: number;
  endedAt: string;
}

export interface QueueStatus {
  status: "idle" | "searching" | "found";
  waitedMs: number;
  match?: { serverUrl: string; roomCode: string; ticket: string };
}

export function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) ?? `${location.protocol}//${location.hostname}:8787`;
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) };
  const token = getState().token;
  if (auth && token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
  if (res.status === 401 && auth) {
    setState({ token: null, user: null });
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? body.message ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  async health(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${apiBaseUrl()}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  },
  guestLogin(name: string) {
    return request<{ token: string; user: ApiUser }>("/auth/guest", { method: "POST", body: JSON.stringify({ name }) }, false);
  },
  me() {
    return request<{ user: ApiUser; loadout: Loadout; stats: PlayerStats }>("/me");
  },
  updateName(name: string) {
    return request<{ user: ApiUser }>("/me", { method: "PATCH", body: JSON.stringify({ name }) });
  },
  putLoadout(loadout: Loadout) {
    return request<{ loadout: Loadout }>("/me/loadout", { method: "PUT", body: JSON.stringify(loadout) });
  },
  stats() {
    return request<{ stats: PlayerStats }>("/me/stats");
  },
  history() {
    return request<{ matches: MatchHistoryItem[] }>("/me/matches");
  },
  leaderboard() {
    return request<{ players: { id: string; name: string; mmr: number; wins: number; matches: number }[] }>("/leaderboard", {}, false);
  },
  queueJoin(rulesetId: string) {
    return request<QueueStatus>("/matchmaking/queue", { method: "POST", body: JSON.stringify({ rulesetId }) });
  },
  queueStatus() {
    return request<QueueStatus>("/matchmaking/status");
  },
  queueLeave() {
    return request<void>("/matchmaking/queue", { method: "DELETE" });
  },
  servers() {
    return request<{ servers: { id: string; url: string; rooms: number; capacity: number }[] }>("/servers", {}, false);
  },
  listMaps() {
    return request<{ maps: CommunityMapListItem[] }>("/maps", {}, false);
  },
  getMap(id: string) {
    return request<CommunityMap>(`/maps/${encodeURIComponent(id)}`, {}, false);
  },
  createMap(body: { name: string; config: import("@arena/sim").ArenaConfig }) {
    return request<CommunityMap>("/maps", { method: "POST", body: JSON.stringify(body) });
  },
  deleteMap(id: string) {
    return request<void>(`/maps/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export interface CommunityMapListItem {
  id: string;
  name: string;
  authorName: string;
  createdAt: string;
}

export interface CommunityMap {
  id: string;
  name: string;
  config: import("@arena/sim").ArenaConfig;
  authorId?: string;
  createdAt: string;
}

/** Garante sessao: reaproveita token salvo ou cria convidado. Falha em silencio se a API estiver fora. */
export async function ensureSession(name: string): Promise<boolean> {
  const online = await api.health();
  setState({ apiOnline: online });
  if (!online) return false;
  try {
    if (getState().token) {
      const me = await api.me();
      setState({ user: { id: me.user.id, name: me.user.name, guest: me.user.guest }, loadout: me.loadout, name: me.user.name || name });
      return true;
    }
  } catch {
    setState({ token: null, user: null });
  }
  try {
    const res = await api.guestLogin(name || "Jogador");
    setState({ token: res.token, user: { id: res.user.id, name: res.user.name, guest: res.user.guest } });
    // Envia o loadout local para virar o oficial da conta nova.
    await api.putLoadout(getState().loadout).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
