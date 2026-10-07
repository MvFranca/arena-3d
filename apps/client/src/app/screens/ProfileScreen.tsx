import { ARCHETYPES, ATTR, ATTRIBUTE_KEYS, attributeBudgetUsed, listAbilities, listSkins, sanitizeLoadout, type AbilityId, type Attributes, type Loadout } from "@arena/sim";
import { useEffect, useState } from "react";
import { api, type MatchHistoryItem, type PlayerStats } from "../../session/api";
import { CameraSettings } from "../../ui/CameraSettings";
import { Card, ErrorBanner, Logo, Shell } from "../../ui/common";
import { getState, navigate, setState, useAppState } from "../store";

const ATTR_LABEL: Record<keyof Attributes, string> = {
  speed: "Velocidade",
  acceleration: "Aceleração",
  strength: "Força",
  control: "Controle",
  power: "Potência",
  precision: "Precisão",
  resilience: "Resistência",
  recharge: "Recarga",
};

export function ProfileScreen() {
  const loadout = useAppState((s) => s.loadout);
  const apiOnline = useAppState((s) => s.apiOnline);
  const user = useAppState((s) => s.user);
  const error = useAppState((s) => s.error);
  const [draft, setDraft] = useState<Loadout>(() => ({ ...loadout, attributes: { ...loadout.attributes } }));
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!apiOnline || !getState().token) return;
    api.stats().then((r) => setStats(r.stats)).catch(() => undefined);
    api.history().then((r) => setHistory(r.matches)).catch(() => undefined);
  }, [apiOnline]);

  const used = attributeBudgetUsed(draft.attributes);
  const remaining = ATTR.budget - used;

  const setAttr = (k: keyof Attributes, v: number) => {
    const next = { ...draft.attributes, [k]: Math.max(0, Math.min(100, Math.round(v))) };
    setDraft({ ...draft, attributes: next, archetypeId: "custom" });
  };

  const applyArchetype = (id: string) => {
    const a = ARCHETYPES[id];
    if (!a) return;
    setDraft({ attributes: { ...a.attributes }, abilityId: a.abilityId, archetypeId: a.id, skinId: draft.skinId });
  };

  const save = async () => {
    if (remaining < 0) return;
    setSaving(true);
    const clean = sanitizeLoadout(draft);
    setState({ loadout: clean });
    try {
      if (apiOnline && getState().token) await api.putLoadout(clean);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setState({ error: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell wide>
      <div className="mb-6 flex items-center justify-between">
        <Logo small />
        <button className="btn btn-ghost" onClick={() => navigate("home")}>
          ← Voltar
        </button>
      </div>
      <ErrorBanner message={error} onClose={() => setState({ error: null })} />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Atributos</h2>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${remaining < 0 ? "bg-red-500/30 text-red-100" : "bg-white/10 text-white/80"}`}>
              {remaining} ponto{Math.abs(remaining) === 1 ? "" : "s"} {remaining < 0 ? "a mais" : "livres"}
            </span>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {Object.values(ARCHETYPES).map((a) => (
              <button key={a.id} className={`rounded-xl border px-3 py-2 text-left text-sm transition ${draft.archetypeId === a.id ? "border-[#ff4fd8] bg-[#ff4fd8]/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`} onClick={() => applyArchetype(a.id)} title={a.description}>
                <div className="font-semibold">{a.name}</div>
                <div className="text-xs text-white/50">{a.description}</div>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {ATTRIBUTE_KEYS.map((k) => (
              <div key={k} className="grid grid-cols-[120px_1fr_40px] items-center gap-3 text-sm">
                <span className="text-white/70">{ATTR_LABEL[k]}</span>
                <input type="range" min={0} max={100} step={5} value={draft.attributes[k]} onChange={(e) => setAttr(k, Number(e.target.value))} className="accent-[#ff4fd8]" />
                <span className="text-right tabular-nums">{draft.attributes[k]}</span>
              </div>
            ))}
          </div>

          <h3 className="font-display mt-6 mb-2 text-lg font-bold">Habilidade</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {listAbilities().map((a) => (
              <button key={a.id} className={`rounded-xl border p-3 text-left text-sm transition ${draft.abilityId === a.id ? "border-[#9fe3ff] bg-[#9fe3ff]/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`} onClick={() => setDraft({ ...draft, abilityId: a.id as AbilityId })}>
                <div className="font-semibold">{a.name}</div>
                <div className="mt-1 text-xs text-white/50">{a.description}</div>
                <div className="mt-1 text-xs text-white/40">recarga {Math.round(a.cooldownTicks / 60)} s</div>
              </button>
            ))}
            <button className={`rounded-xl border p-3 text-left text-sm transition ${draft.abilityId === null ? "border-white/40 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`} onClick={() => setDraft({ ...draft, abilityId: null })}>
              <div className="font-semibold">Nenhuma</div>
              <div className="mt-1 text-xs text-white/50">Só habilidade pura.</div>
            </button>
          </div>

          <h3 className="font-display mt-6 mb-2 text-lg font-bold">Visual</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {listSkins().map((s) => (
              <button
                key={s.id}
                className={`rounded-xl border p-3 text-left text-sm transition ${draft.skinId === s.id ? "border-white/50 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                onClick={() => setDraft({ ...draft, skinId: s.id })}
              >
                <div className="mb-2 h-3 w-10 rounded-full" style={{ background: s.swatch }} />
                <div className="font-semibold">{s.name}</div>
                <div className="mt-1 text-xs text-white/50">{s.description}</div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-emerald-300">salvo</span>}
            <button className="btn btn-primary" disabled={remaining < 0 || saving} onClick={() => void save()}>
              Salvar loadout
            </button>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-display mb-3 text-xl font-bold">{user ? user.name : "Perfil"}</h2>
            {!apiOnline && <p className="text-sm text-white/50">A API está offline. O loadout fica salvo neste navegador e vale nas partidas locais e em salas sem conta.</p>}
            {apiOnline && !stats && <p className="text-sm text-white/50">Carregando estatísticas…</p>}
            {stats && (
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Nível" value={stats.level} />
                <Stat label="MMR" value={stats.mmr} />
                <Stat label="Partidas" value={stats.matches} />
                <Stat label="Vitórias" value={stats.wins} />
                <Stat label="Derrotas" value={stats.losses} />
                <Stat label="Gols" value={stats.goals} />
              </div>
            )}
          </Card>
          <Card>
            <h3 className="font-display mb-1 text-lg font-bold">Câmera</h3>
            <p className="mb-3 text-sm text-white/50">Preferência deste navegador. Salva automaticamente e vale em todas as partidas; tecla C troca durante o jogo.</p>
            <CameraSettings />
          </Card>
          {history.length > 0 && (
            <Card>
              <h3 className="font-display mb-3 text-lg font-bold">Últimas partidas</h3>
              <ul className="space-y-2 text-sm">
                {history.slice(0, 8).map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <span className={m.result === "win" ? "text-emerald-300" : m.result === "loss" ? "text-red-300" : "text-white/60"}>{m.result === "win" ? "Vitória" : m.result === "loss" ? "Derrota" : "Empate"}</span>
                    <span className="tabular-nums">
                      {m.scoreLeft} : {m.scoreRight}
                    </span>
                    <span className="text-white/40">{m.goals} gol{m.goals === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-3">
      <div className="font-display text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}
