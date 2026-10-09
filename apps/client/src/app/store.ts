import type { RoomInfo } from "@arena/protocol";
import { DEFAULT_LOADOUT, sanitizeLoadout, type AbilityId, type Loadout, type MatchPhase, type Team } from "@arena/sim";
import { useSyncExternalStore } from "react";
import { loadCameraPrefs, sanitizeCameraPrefs, saveCameraPrefs, type CameraPrefs } from "./cameraPrefs";

export type Screen = "home" | "lobby" | "match" | "result" | "profile" | "queue" | "maps";

export interface HudState {
  scoreLeft: number;
  scoreRight: number;
  clockTicks: number;
  phase: MatchPhase;
  phaseTicks: number;
  cooldownTicks: number;
  cooldownTotal: number;
  abilityId: AbilityId | null;
  charged: boolean;
  shielded: boolean;
  pingMs: number;
  team: Team | null;
  connected: boolean;
  netHint: string | null;
}

export interface MatchResult {
  scoreLeft: number;
  scoreRight: number;
  winner: Team | "draw";
  myTeam: Team | null;
  goals: { team: Team; scorerName: string; ownGoal: boolean; clockTicks: number }[];
  players: { id: string; name: string; team: Team; goals: number; ownGoals: number }[];
  durationTicks: number;
  mode: "local" | "online";
}

export interface SessionUser {
  id: string;
  name: string;
  guest: boolean;
}

export interface AppState {
  screen: Screen;
  name: string;
  token: string | null;
  user: SessionUser | null;
  apiOnline: boolean;
  loadout: Loadout;
  camera: CameraPrefs;
  mode: "local" | "online";
  localTwoPlayers: boolean;
  localRulesetId: string;
  room: RoomInfo | null;
  mySlot: number | null;
  playerId: string | null;
  hud: HudState;
  result: MatchResult | null;
  error: string | null;
  notice: string | null;
  queue: { status: "idle" | "searching" | "found"; rulesetId: string; waitedMs: number } | null;
}

const LS_NAME = "arena.name";
const LS_LOADOUT = "arena.loadout";
const LS_TOKEN = "arena.token";

function loadLocalLoadout(): Loadout {
  try {
    const raw = localStorage.getItem(LS_LOADOUT);
    if (raw) return sanitizeLoadout(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_LOADOUT, attributes: { ...DEFAULT_LOADOUT.attributes } };
}

export const initialHud: HudState = {
  scoreLeft: 0,
  scoreRight: 0,
  clockTicks: 0,
  phase: "lobby",
  phaseTicks: 0,
  cooldownTicks: 0,
  cooldownTotal: 1,
  abilityId: null,
  charged: false,
  shielded: false,
  pingMs: 0,
  team: null,
  connected: true,
  netHint: null,
};

let state: AppState = {
  screen: "home",
  name: localStorage.getItem(LS_NAME) ?? "",
  token: localStorage.getItem(LS_TOKEN),
  user: null,
  apiOnline: false,
  loadout: loadLocalLoadout(),
  camera: loadCameraPrefs(),
  mode: "local",
  localTwoPlayers: false,
  localRulesetId: "practice",
  room: null,
  mySlot: null,
  playerId: null,
  hud: { ...initialHud },
  result: null,
  error: null,
  notice: null,
  queue: null,
};

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  if (p.name !== undefined) localStorage.setItem(LS_NAME, p.name);
  if (p.loadout !== undefined) localStorage.setItem(LS_LOADOUT, JSON.stringify(p.loadout));
  if (p.camera !== undefined) saveCameraPrefs(p.camera);
  if (p.token !== undefined) {
    if (p.token) localStorage.setItem(LS_TOKEN, p.token);
    else localStorage.removeItem(LS_TOKEN);
  }
  for (const l of listeners) l();
}

export function setHud(patch: Partial<HudState>): void {
  const next = { ...state.hud, ...patch };
  let changed = false;
  for (const k in next) {
    if ((next as any)[k] !== (state.hud as any)[k]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = { ...state, hud: next };
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

/** Ajusta a camera ao vivo: o renderer le o store no proximo frame. */
export function setCameraPrefs(patch: Partial<CameraPrefs>): void {
  setState({ camera: sanitizeCameraPrefs({ ...state.camera, ...patch }) });
}

export function toggleCameraMode(): void {
  setCameraPrefs({ mode: state.camera.mode === "arena" ? "thirdPerson" : "arena" });
}

export function navigate(screen: Screen): void {
  setState({ screen, error: null });
}

export function showError(message: string): void {
  setState({ error: message });
}
