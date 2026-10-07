export type CameraMode = "arena" | "thirdPerson";

/** Preferencias de camera. So do cliente: nunca vao para o servidor. */
export interface CameraPrefs {
  mode: CameraMode;
  distance: number;
  height: number;
  fov: number;
  lookAhead: number;
  smoothing: number;
}

export const CAMERA_RANGES = {
  distance: { min: 4, max: 12, step: 0.5 },
  height: { min: 1.5, max: 5, step: 0.1 },
  fov: { min: 45, max: 80, step: 1 },
  lookAhead: { min: 1, max: 6, step: 0.5 },
  smoothing: { min: 2, max: 12, step: 0.5 },
} as const;

export const DEFAULT_CAMERA_PREFS: CameraPrefs = {
  mode: "arena",
  distance: 6.5,
  height: 2.8,
  fov: 60,
  lookAhead: 3,
  smoothing: 6,
};

export const CAMERA_STORAGE_KEY = "arena.camera";

function clamp(v: unknown, range: { min: number; max: number }, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(range.max, Math.max(range.min, n));
}

export function sanitizeCameraPrefs(input: Partial<CameraPrefs> | null | undefined): CameraPrefs {
  const d = DEFAULT_CAMERA_PREFS;
  return {
    mode: input?.mode === "thirdPerson" ? "thirdPerson" : "arena",
    distance: clamp(input?.distance, CAMERA_RANGES.distance, d.distance),
    height: clamp(input?.height, CAMERA_RANGES.height, d.height),
    fov: clamp(input?.fov, CAMERA_RANGES.fov, d.fov),
    lookAhead: clamp(input?.lookAhead, CAMERA_RANGES.lookAhead, d.lookAhead),
    smoothing: clamp(input?.smoothing, CAMERA_RANGES.smoothing, d.smoothing),
  };
}

export function loadCameraPrefs(): CameraPrefs {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (raw) return sanitizeCameraPrefs(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CAMERA_PREFS };
}

export function saveCameraPrefs(prefs: CameraPrefs): void {
  localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(prefs));
}
