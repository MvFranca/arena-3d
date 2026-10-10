import { ARCHETYPES, ARENAS, getAbility, RULESETS } from "@arena/sim";
import { useEffect, useState, type ReactNode } from "react";
import { connection, defaultGameServerUrl } from "../../net/GameConnection";
import { api, ensureSession, type MatchHistoryItem, type PlayerStats } from "../../session/api";
import { CameraSettings } from "../../ui/CameraSettings";
import { ErrorBanner, Logo } from "../../ui/common";
import { blurFieldOnEscape, consumesArrows, isFormField } from "../../ui/keys";
import { MapSelect } from "../../ui/MapSelect";
import { HubScene } from "../../ui/HubScene";
import { readSalaParam } from "../roomLink";
import { getState, navigate, setState, showError, useAppState } from "../store";

type ModeId = "treino" | "ranked" | "sala" | "perfil";
const MODES: ModeId[] = ["treino", "ranked", "sala", "perfil"];

const ABILITY_LABEL: Record<string, string> = { dash: "Impulso", power_shot: "Carga", shield: "Escudo" };
let salaInviteStarted = false;

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
  const [mapId, setMapId] = useState("classic");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<ModeId>("treino");
  const [settings, setSettings] = useState(false);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);

  useEffect(() => {
    void ensureSession(getState().name);
  }, []);

  useEffect(() => {
    const code = readSalaParam();
    if (!code || salaInviteStarted) return;
    salaInviteStarted = true;
    setCode(code);
    setOpen("sala");
    if (getState().name.trim().length >= 2) void connectAndJoin("join", { code });
    // O convite da URL entra uma vez, na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (blurFieldOnEscape(e.target)) return;
        if (settings) {
          e.preventDefault();
          setSettings(false);
        }
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !consumesArrows(e.target) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        const i = MODES.indexOf(open);
        const dir = e.key === "ArrowDown" ? 1 : -1;
        const next = MODES[(i + dir + MODES.length) % MODES.length]!;
        setOpen(next);
        return;
      }
      if (e.key === "Enter" && !isFormField(e.target) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (open === "treino") startLocal();
        else if (open === "ranked") void quickMatch();
        else if (open === "perfil") navigate("profile");
        else if (code.trim().length >= 4) void connectAndJoin("join", { code });
        else void connectAndJoin("create", { rulesetId, mapId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  const connectAndJoin = async (action: "create" | "join", payload: { rulesetId?: string; code?: string; mapId?: string }) => {
    const n = requireName();
    if (!n) return;
    setBusy(action);
    try {
      await ensureSession(n);
      const s = getState();
      const ok = await connection.connect(defaultGameServerUrl(), { token: s.token ?? undefined, name: n, loadout: s.loadout });
      if (!ok) throw new Error(connection.handshakeError ?? "Não foi possível conectar ao servidor de jogo.");
      const unsub = connection.on("error", (_c, m) => showError(m));
      if (action === "create") connection.sendJson({ t: "create", rulesetId: payload.rulesetId!, mapId: payload.mapId });
      else connection.sendJson({ t: "join", code: payload.code!.trim().toUpperCase() });
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

      <div className="absolute inset-0 z-10 overflow-y-auto overscroll-contain">
        <div
          className="relative flex min-h-full flex-col"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
            paddingLeft: "env(safe-area-inset-left)",
            paddingRight: "env(safe-area-inset-right)",
          }}
        >
        <header className="flex flex-col gap-4 px-4 pb-5 pt-4 md:flex-row md:items-end md:justify-between md:gap-6 md:px-6 md:pb-6 md:pt-5">
          <Logo small />
          <label className="flex w-full flex-col gap-1.5 md:max-w-sm md:flex-1">
            <span className="px-0.5 text-[11px] font-semibold uppercase tracking-widest text-white/55">Nome</span>
            <input
              className="w-full rounded-lg border border-white/35 bg-black/70 px-3.5 py-2.5 text-base text-white shadow-[0_8px_24px_rgba(0,0,0,0.4)] outline-none placeholder:text-white/35 focus:border-[#9fe3ff] focus:bg-black/80"
              value={name}
              maxLength={16}
              placeholder="Como quer ser chamado?"
              aria-label="Nome"
              onChange={(e) => setState({ name: e.target.value })}
            />
          </label>
          <div className="flex items-center gap-3">
            <span className={`rounded-lg px-3 py-1.5 text-[11px] ${apiOnline ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/60"}`}>
              {apiOnline ? (user ? (user.guest ? "convidado" : user.name) : "conta…") : "offline"}
            </span>
            <button className="btn btn-ghost rounded-lg px-3 py-1.5 text-xs" onClick={() => setSettings((v) => !v)} title="Ajustes da câmera">
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
          <div className="glass relative z-20 mx-4 mb-3 w-auto max-w-[calc(100%-2rem)] rounded-2xl p-4 shadow-2xl md:absolute md:right-6 md:top-16 md:mx-0 md:mb-0 md:w-80">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold">Câmera</h3>
              <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => setSettings(false)}>
                fechar
              </button>
            </div>
            <CameraSettings compact />
          </div>
        )}

        <div className="grid flex-1 grid-cols-1 gap-3 px-4 pb-4 md:min-h-0 md:grid-cols-[280px_1fr_300px] md:px-6 md:pb-6">
          <nav className="flex flex-col gap-2 md:self-center">
            <ModeTile id="treino" open={open} setOpen={setOpen} title="Treino" hint="Arena no seu navegador. Sem rede." accent="#38d9a9">
              <button
                type="button"
                role="checkbox"
                aria-checked={localTwo}
                className="mb-2 flex items-center gap-2 text-left text-xs text-white/70"
                onClick={() => setState({ localTwoPlayers: !localTwo })}
              >
                <span className="check" data-on={localTwo}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M2.2 6.1 4.7 8.6 9.8 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                2 jogadores no mesmo teclado (IJKL)
              </button>
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
                <select className="input min-w-0 flex-1 py-1.5 text-sm" value={rulesetId} onChange={(e) => setRulesetId(e.target.value)}>
                  <option value="duel">1v1</option>
                  <option value="doubles">2v2</option>
                  <option value="trios">3v3</option>
                  <option value="squads">4v4</option>
                </select>
                <button className="btn btn-secondary shrink-0 px-3 py-1.5 text-sm" disabled={busy !== null} onClick={() => void connectAndJoin("create", { rulesetId, mapId })}>
                  {busy === "create" ? "…" : "Criar"}
                </button>
              </div>
              <MapSelect value={mapId} onChange={setMapId} apiOnline={apiOnline} />
              <button className="btn btn-ghost mt-2 w-full py-1.5 text-xs" onClick={() => navigate("maps")}>
                Criar mapa da comunidade
              </button>
              <div className="mt-2 flex gap-2">
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

          <div className="pointer-events-none hidden flex-col items-center justify-end pb-2 md:flex">
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

          <aside className="self-stretch md:self-center">
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
    </div>
  );
}

function ModeTile(props: { id: ModeId; open: ModeId; setOpen: (id: ModeId) => void; title: string; hint: string; accent: string; children: ReactNode }) {
  const expanded = props.open === props.id;
  return (
    <div className="overflow-hidden rounded-2xl border bg-black/45 shadow-xl backdrop-blur-md transition-[border-color,box-shadow] duration-300" style={{ borderColor: `${props.accent}${expanded ? "88" : "55"}`, boxShadow: expanded ? `0 12px 40px ${props.accent}22` : undefined }}>
      <button type="button" aria-expanded={expanded} className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => props.setOpen(props.id)}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full transition-transform duration-300" style={{ background: props.accent, boxShadow: `0 0 10px ${props.accent}`, transform: expanded ? "scale(1.25)" : undefined }} />
        <span className="min-w-0 flex-1">
          <span className="font-display block text-base font-bold">{props.title}</span>
          <span className={`block overflow-hidden text-xs text-white/45 transition-all duration-300 ${expanded ? "mt-0 max-h-0 opacity-0" : "mt-0.5 max-h-8 opacity-100"}`}>{props.hint}</span>
        </span>
        <svg className={`shrink-0 text-white/40 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 6.2 8 10.2 12 6.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="mode-collapse" data-open={expanded}>
        <div className="mode-clip">
          <div className="mode-body px-4 pb-4" inert={expanded ? undefined : true}>
            {props.children}
          </div>
        </div>
      </div>
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
