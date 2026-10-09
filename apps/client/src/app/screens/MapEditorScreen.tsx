import { ARENAS, ARENA_BOUNDS, sanitizeArena, type ArenaConfig } from "@arena/sim";
import { useEffect, useMemo, useState } from "react";
import { connection } from "../../net/GameConnection";
import { api } from "../../session/api";
import { Card, ErrorBanner, Logo, Shell } from "../../ui/common";
import { blurFieldOnEscape } from "../../ui/keys";
import { MapPreview } from "../../ui/MapPreview";
import { getState, navigate, setState, useAppState } from "../store";

const THEME_KEYS = ["floor", "lines", "walls", "accent", "sky", "fog", "left", "right"] as const;
const THEME_LABEL: Record<(typeof THEME_KEYS)[number], string> = {
  floor: "Piso",
  lines: "Linhas",
  walls: "Paredes",
  accent: "Accent",
  sky: "Céu",
  fog: "Névoa",
  left: "Time A",
  right: "Time B",
};

export function MapEditorScreen() {
  const apiOnline = useAppState((s) => s.apiOnline);
  const error = useAppState((s) => s.error);
  const room = useAppState((s) => s.room);
  const mySlot = useAppState((s) => s.mySlot);
  const [draft, setDraft] = useState<ArenaConfig>(() => sanitizeArena({ ...ARENAS.classic, id: "custom", name: "Meu mapa" }));
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const preview = useMemo(() => sanitizeArena(draft), [draft]);
  const me = room?.players.find((p) => p.slot === mySlot);
  const canUseInRoom = !!me?.isHost && room?.phase === "lobby" && !room.automatic;

  const setNum = (k: keyof ArenaConfig, v: number) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const clean = sanitizeArena(draft);
      if (!apiOnline || !getState().token) throw new Error("Entre com a API online para publicar o mapa.");
      const res = await api.createMap({ name: clean.name, config: clean });
      setSavedId(res.id);
      setState({ notice: "Mapa publicado." });
    } catch (e) {
      setState({ error: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (blurFieldOnEscape(e.target)) return;
      navigate(room ? "lobby" : "home");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const useInRoom = () => {
    const id = savedId;
    if (!id || !canUseInRoom) return;
    connection.sendJson({ t: "set_map", mapId: id });
    navigate("lobby");
  };

  return (
    <Shell wide>
      <div className="mb-6 flex items-center justify-between">
        <Logo small />
        <button className="btn btn-ghost" onClick={() => navigate(room ? "lobby" : "home")}>
          ← Voltar
        </button>
      </div>
      <ErrorBanner message={error} onClose={() => setState({ error: null })} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <h2 className="font-display mb-4 text-xl font-bold">Editor de mapa</h2>
          <label className="mb-4 block text-sm text-white/70">
            Nome
            <input className="input mt-1" value={draft.name} maxLength={32} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <Dim label="Comprimento" value={draft.halfLength * 2} min={ARENA_BOUNDS.halfLength.min * 2} max={ARENA_BOUNDS.halfLength.max * 2} onChange={(v) => setNum("halfLength", v / 2)} />
          <Dim label="Largura" value={draft.halfWidth * 2} min={ARENA_BOUNDS.halfWidth.min * 2} max={ARENA_BOUNDS.halfWidth.max * 2} onChange={(v) => setNum("halfWidth", v / 2)} />
          <Dim label="Gol (largura)" value={draft.goalHalfWidth * 2} min={ARENA_BOUNDS.goalHalfWidth.min * 2} max={ARENA_BOUNDS.goalHalfWidth.max * 2} onChange={(v) => setNum("goalHalfWidth", v / 2)} />
          <Dim label="Gol (altura)" value={draft.goalHeight} min={ARENA_BOUNDS.goalHeight.min} max={ARENA_BOUNDS.goalHeight.max} onChange={(v) => setNum("goalHeight", v)} />
          <Dim label="Paredes" value={draft.wallHeight} min={ARENA_BOUNDS.wallHeight.min} max={ARENA_BOUNDS.wallHeight.max} onChange={(v) => setNum("wallHeight", v)} />
          <h3 className="font-display mt-5 mb-2 text-lg font-bold">Cores</h3>
          <div className="grid grid-cols-2 gap-2">
            {THEME_KEYS.map((k) => (
              <label key={k} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
                <span className="text-white/70">{THEME_LABEL[k]}</span>
                <input
                  type="color"
                  value={draft.theme[k]}
                  onChange={(e) => setDraft({ ...draft, theme: { ...draft.theme, [k]: e.target.value } })}
                />
              </label>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            {savedId && canUseInRoom && (
              <button className="btn btn-secondary" onClick={useInRoom}>
                Usar nesta sala
              </button>
            )}
            <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>
              {saving ? "…" : "Publicar mapa"}
            </button>
          </div>
        </Card>
        <Card className="min-h-[320px] overflow-hidden p-3">
          <div className="h-72 w-full">
            <MapPreview arena={preview} />
          </div>
          <p className="mt-3 text-sm text-white/50">
            {preview.halfLength * 2} × {preview.halfWidth * 2} · gol {preview.goalHalfWidth * 2}
          </p>
        </Card>
      </div>
    </Shell>
  );
}

function Dim(props: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-3 grid grid-cols-[120px_1fr_48px] items-center gap-3 text-sm">
      <span className="text-white/70">{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={0.5} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} className="accent-[#9fe3ff]" />
      <span className="text-right tabular-nums">{props.value.toFixed(1)}</span>
    </div>
  );
}
