import { ARCHETYPES, ARENAS, getAbility, RULESETS } from "@arena/sim";
import { useEffect, useState, type ReactNode } from "react";
import { connection, defaultGameServerUrl } from "../../net/GameConnection";
import { api, ensureSession, type MatchHistoryItem, type PlayerStats } from "../../session/api";
import { CameraSettings } from "../../ui/CameraSettings";
import { ErrorBanner, Logo } from "../../ui/common";
import { HubScene } from "../../ui/HubScene";
import { getState, navigate, setState, showError, useAppState } from "../store";

type ModeId = "treino" | "ranked" | "sala" | "perfil";

const ABILITY_LABEL: Record<string, string> = { dash: "Impulso", power_shot: "Carga", shield: "Escudo" };

export function HomeScreen() {
  const name = useAppState((s) => s.name);
  const error = useAppState((s) => s.error);
  const apiOnline = useAppState((s) => s.apiOnline);
  const user = useAppState((s) => s.user);
  const localTwo = useAppState((s) => s.localTwoPlayers);
  const localRuleset = useAppState((s) => s.localRulesetId);
  const loadout = useAppState((s) => s.loadout);
  const result = useAppState((s) => s.result);
  const [code, setCode] = useState("");
  const [rulesetId, setRulesetId] = useState("duel");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<ModeId>("treino");
  const [settings, setSettings] = useState(false);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);

  useEffect(() => {
    void ensureSession(getState().name);
  }, []);

  useEffect(() => {
    if (!apiOnline || !getState().token) return;
    api.stats().then((r) => setStats(r.stats)).catch(() => undefined);
    api.history().then((r) => setHistory(r.matches)).catch(() => undefined);
  }, [apiOnline]);

  const requireName = (): string | null => {
    const n = name.trim();
    if (n.length < 2) {
      showError("Escolha um nome com pelo menos 2 letras.");
      return null;
    }
    return n;
  };

  const connectAndJoin = async (action: "create" | "join", payload: { rulesetId?: string; code?: string }) => {
    const n = requireName();
    if (!n) return;
    setBusy(action);
    try {
      await ensureSession(n);
      const s = getState();
      const ok = await connection.connect(defaultGameServerUrl(), { token: s.token ?? undefined, name: n, loadout: s.loadout });
      if (!ok) throw new Error("Não foi possível conectar ao servidor de jogo.");
      const unsub = connection.on("error", (_c, m) => showError(m));
      if (action === "create") connection.sendJson({ t: "create", rulesetId: payload.rulesetId! });
      else connection.sendJson({ t: "join", code: payload.code!.toUpperCase() });
      const joined = await waitForRoom(4000);
      unsub();
      if (!joined) throw new Error(action === "join" ? "Sala não encontrada ou cheia." : "Servidor não respondeu.");
      setState({ mode: "online" });
      navigate("lobby");
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const startLocal = () => {
    const n = requireName();
    if (!n) return;
    setState({ mode: "local", room: null, mySlot: null });
    navigate("match");
  };

  const quickMatch = async () => {
    const n = requireName();
    if (!n) return;
    setBusy("queue");
    try {
      const ok = await ensureSession(n);
      if (!ok) throw new Error("Partida rápida precisa da API online.");
      await api.queueJoin(rulesetId);
      setState({ queue: { status: "searching", rulesetId, waitedMs: 0 }, mode: "online" });
      navigate("queue");
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const replay = () => {
    if (!requireName()) return;
    setState({ mode: result?.mode ?? "local", room: null, mySlot: null });
    if ((result?.mode ?? "local") === "local") navigate("match");
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b1020]">
      <HubScene />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        <header className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Logo small />
          <div className="flex flex-1 items-center justify-center gap-2">
            <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Nome</span>
              <input
                className="w-36 bg-transparent text-sm text-white outline-none placeholder:text-white/30 md:w-44"
                value={name}
                maxLength={16}
                placeholder="Como quer ser chamado?"
                onChange={(e) => setState({ name: e.target.value })}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] ${apiOnline ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/50"}`}>
              {apiOnline ? (user ? (user.guest ? "convidado" : user.name) : "conta…") : "offline"}
            </span>
            <button className="btn btn-ghost rounded-full px-3 py-1 text-xs" onClick={() => setSettings((v) => !v)} title="Ajustes da câmera">
              Ajustes
            </button>
          </div>
        </header>

        {history.length > 0 && (
          <div className="pointer-events-auto mx-4 mb-1 flex gap-2 overflow-x-auto text-[11px] text-white/55 md:mx-6">
            <span className="shrink-0 uppercase tracking-widest text-white/30">Recente</span>
            {history.slice(0, 3).map((m) => (
              <span key={m.id} className="glass shrink-0 rounded-full px-2.5 py-1">
                {m.result === "win" ? "Vitória" : m.result === "loss" ? "Derrota" : "Empate"} {m.scoreLeft}:{m.scoreRight}
              </span>
            ))}
          </div>
        )}

        <div className="pointer-events-auto mx-4 md:mx-6">
          <ErrorBanner message={error} onClose={() => setState({ error: null })} />
        </div>

        {settings && (
          <div className="pointer-events-auto glass absolute right-4 top-16 z-20 w-80 rounded-2xl p-4 shadow-2xl md:right-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">Câmera</h3>
              <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => setSettings(false)}>
                fechar
              </button>
            </div>
            <CameraSettings compact />
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 px-4 pb-4 md:grid-cols-[280px_1fr_300px] md:px-6 md:pb-6">
          <nav className="pointer-events-auto flex flex-col gap-2 self-center">
            <ModeTile id="treino" open={open} setOpen={setOpen} title="Treino" hint="Arena no seu navegador. Sem rede." accent="#38d9a9">
              <label className="mb-2 flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={localTwo} onChange={(e) => setState({ localTwoPlayers: e.target.checked })} />
                2 jogadores no mesmo teclado (IJKL)
              </label>
              <select className="input mb-3 py-1.5 text-sm" value={localRuleset} onChange={(e) => setState({ localRulesetId: e.target.value })}>
                {Object.values(RULESETS)
                  .filter((r) => r.id !== "squads" && r.id !== "trios")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {ARENAS[r.arenaId]?.name ?? r.arenaId} · {r.durationSeconds / 60} min
                    </option>
                  ))}
              </select>
              <button className="btn btn-primary w-full py-2 text-sm" onClick={startLocal}>
                Entrar na arena
              </button>
            </ModeTile>

            <ModeTile id="ranked" open={open} setOpen={setOpen} title="Partida rápida" hint={apiOnline ? "Fila por habilidade." : "Precisa da API online."} accent="#ff4fd8">
              <select className="input mb-3 py-1.5 text-sm" value={rulesetId} onChange={(e) => setRulesetId(e.target.value)}>
                <option value="duel">1v1 · Quadra Neon</option>
                <option value="doubles">2v2 · Quadra Neon</option>
                <option value="trios">3v3 · Terraço Solar</option>
                <option value="squads">4v4 · Terraço Solar</option>
              </select>
              <button className="btn btn-primary w-full py-2 text-sm" disabled={!apiOnline || busy !== null} onClick={() => void quickMatch()}>
                {busy === "queue" ? "…" : "Buscar"}
              </button>
            </ModeTile>

            <ModeTile id="sala" open={open} setOpen={setOpen} title="Sala" hint="Crie ou entre com um código." accent="#4fc3ff">
              <div className="mb-2 flex gap-2">
                <select className="input py-1.5 text-sm" value={rulesetId} onChange={(e) => setRulesetId(e.target.value)}>
                  <option value="duel">1v1</option>
                  <option value="doubles">2v2</option>
                  <option value="trios">3v3</option>
                  <option value="squads">4v4</option>
                </select>
                <button className="btn btn-secondary shrink-0 px-3 py-1.5 text-sm" disabled={busy !== null} onClick={() => void connectAndJoin("create", { rulesetId })}>
                  {busy === "create" ? "…" : "Criar"}
                </button>
              </div>
              <div className="flex gap-2">
                <input className="input py-1.5 text-sm uppercase tracking-widest" value={code} maxLength={6} placeholder="CÓDIGO" onChange={(e) => setCode(e.target.value.toUpperCase())} />
                <button className="btn btn-secondary shrink-0 px-3 py-1.5 text-sm" disabled={busy !== null || code.length < 4} onClick={() => void connectAndJoin("join", { code })}>
                  {busy === "join" ? "…" : "Entrar"}
                </button>
              </div>
            </ModeTile>

            <ModeTile id="perfil" open={open} setOpen={setOpen} title="Perfil" hint="Atributos, habilidade e câmera." accent="#ffb347">
              <button className="btn btn-secondary w-full py-2 text-sm" onClick={() => navigate("profile")}>
                Editar atributos
              </button>
            </ModeTile>
          </nav>

          <div className="pointer-events-none flex flex-col items-center justify-end pb-2">
            {stats && (
              <div className="mb-3 flex gap-2">
                <Medal label="Nível" value={stats.level} />
                <Medal label="MMR" value={stats.mmr} />
                <Medal label="Partidas" value={stats.matches} />
              </div>
            )}
            <button className="pointer-events-auto btn btn-ghost rounded-full bg-black/35 px-4 py-2 text-xs backdrop-blur" onClick={() => navigate("profile")}>
              Editar loadout
            </button>
          </div>

          <aside className="pointer-events-auto self-center">
            <div className="glass rounded-3xl p-5 shadow-2xl">
              {result ? (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Última partida</div>
                  <div className="font-display mt-1 text-3xl font-bold tabular-nums">
                    {result.scoreLeft}
                    <span className="mx-2 text-white/25">:</span>
                    {result.scoreRight}
                  </div>
                  <p className="mt-1 text-sm text-white/55">
                    {result.winner === "draw" ? "Empate" : result.myTeam ? (result.myTeam === result.winner ? "Vitória" : "Derrota") : result.winner === "left" ? "Vermelho venceu" : "Azul venceu"}
                    {result.mode === "local" ? " · local" : " · online"}
                  </p>
                  <button className="btn btn-primary mt-4 w-full py-2 text-sm" onClick={replay}>
                    Jogar de novo
                  </button>
                </>
              ) : (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Sua build</div>
                  <h3 className="font-display mt-1 text-xl font-bold">{ARCHETYPES[loadout.archetypeId ?? ""]?.name ?? "Personalizado"}</h3>
                  <p className="mt-1 text-sm text-white/55">{loadout.abilityId ? ABILITY_LABEL[loadout.abilityId] ?? getAbility(loadout.abilityId).name : "Sem habilidade"}</p>
                  <button className="btn btn-secondary mt-4 w-full py-2 text-sm" onClick={() => navigate("profile")}>
                    Montar build
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ModeTile(props: { id: ModeId; open: ModeId; setOpen: (id: ModeId) => void; title: string; hint: string; accent: string; children: ReactNode }) {
  const expanded = props.open === props.id;
  return (
    <div className="overflow-hidden rounded-2xl border bg-black/45 shadow-xl backdrop-blur-md" style={{ borderColor: `${props.accent}55` }}>
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => props.setOpen(props.id)}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: props.accent, boxShadow: `0 0 10px ${props.accent}` }} />
        <span>
          <span className="font-display block text-base font-bold">{props.title}</span>
          {!expanded && <span className="block text-xs text-white/45">{props.hint}</span>}
        </span>
      </button>
      {expanded && <div className="px-4 pb-4">{props.children}</div>}
    </div>
  );
}

function Medal({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass pointer-events-none rounded-2xl px-3 py-2 text-center">
      <div className="font-display text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}

function waitForRoom(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (connection.room) return resolve(true);
    const t = setTimeout(() => {
      unsub();
      resolve(false);
    }, timeoutMs);
    const unsub = connection.on("room", () => {
      clearTimeout(t);
      unsub();
      resolve(true);
    });
  });
}
