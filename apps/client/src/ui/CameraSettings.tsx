import { CAMERA_RANGES, DEFAULT_CAMERA_PREFS, type CameraMode, type CameraPrefs } from "../app/cameraPrefs";
import { setCameraPrefs, useAppState } from "../app/store";

export const CAMERA_MODE_LABEL: Record<CameraMode, string> = {
  arena: "Arena",
  thirdPerson: "Terceira pessoa",
};

const SLIDERS: { key: Exclude<keyof CameraPrefs, "mode">; label: string; unit?: string }[] = [
  { key: "distance", label: "Distância", unit: "m" },
  { key: "height", label: "Altura", unit: "m" },
  { key: "fov", label: "Campo de visão", unit: "°" },
  { key: "lookAhead", label: "Olhar à frente", unit: "m" },
  { key: "smoothing", label: "Suavização" },
];

/**
 * Seletor de modo + sliders da camera. Escreve direto no store, entao qualquer
 * mudanca vale no proximo frame da partida, inclusive com o painel aberto no jogo.
 */
export function CameraSettings(props: { compact?: boolean; className?: string }) {
  const camera = useAppState((s) => s.camera);
  const third = camera.mode === "thirdPerson";
  return (
    <div className={props.className}>
      <div className={`grid grid-cols-2 gap-2 ${props.compact ? "text-xs" : "text-sm"}`}>
        {(Object.keys(CAMERA_MODE_LABEL) as CameraMode[]).map((m) => (
          <button
            key={m}
            type="button"
            data-camera-mode={m}
            aria-pressed={camera.mode === m}
            className={`rounded-xl border px-3 py-2 text-left transition ${camera.mode === m ? "border-[#9fe3ff] bg-[#9fe3ff]/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
            onClick={() => setCameraPrefs({ mode: m })}
          >
            <div className="font-semibold">{CAMERA_MODE_LABEL[m]}</div>
            {!props.compact && <div className="mt-0.5 text-xs text-white/50">{m === "arena" ? "Campo inteiro visível. Padrão competitivo." : "Atrás do seu jogador, seguindo a direção dele."}</div>}
          </button>
        ))}
      </div>

      <div className={`mt-3 space-y-2 ${third ? "" : "opacity-40"} ${props.compact ? "text-xs" : "text-sm"}`} aria-disabled={!third}>
        {SLIDERS.map((s) => {
          const r = CAMERA_RANGES[s.key];
          const v = camera[s.key];
          return (
            <label key={s.key} className={`grid items-center gap-3 ${props.compact ? "grid-cols-[88px_1fr_44px]" : "grid-cols-[120px_1fr_52px]"}`}>
              <span className="text-white/70">{s.label}</span>
              <input
                type="range"
                data-camera-slider={s.key}
                min={r.min}
                max={r.max}
                step={r.step}
                value={v}
                disabled={!third}
                className="accent-[#9fe3ff]"
                onChange={(e) => setCameraPrefs({ [s.key]: Number(e.target.value) })}
              />
              <span className="text-right tabular-nums text-white/80">
                {Number.isInteger(r.step) ? Math.round(v) : v.toFixed(1)}
                {s.unit ?? ""}
              </span>
            </label>
          );
        })}
        <div className="flex items-center justify-between pt-1 text-xs text-white/40">
          <span>{third ? "Ajustes valem na hora, até durante a partida." : "Ajustes só afetam a terceira pessoa."}</span>
          <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setCameraPrefs({ ...DEFAULT_CAMERA_PREFS, mode: camera.mode })}>
            padrão
          </button>
        </div>
      </div>
    </div>
  );
}
