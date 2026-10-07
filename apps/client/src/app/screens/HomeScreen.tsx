import { ARENAS, RULESETS } from "@arena/sim";
import { useEffect, useState } from "react";
import { connection, defaultGameServerUrl } from "../../net/GameConnection";
import { api, ensureSession } from "../../session/api";
import { Card, ErrorBanner, Logo, Shell } from "../../ui/common";
import { getState, navigate, setState, showError, useAppState } from "../store";

export function HomeScreen() {
  const name = useAppState((s) => s.name);
  const error = useAppState((s) => s.error);
  const apiOnline = useAppState((s) => s.apiOnline);
  const user = useAppState((s) => s.user);
  const localTwo = useAppState((s) => s.localTwoPlayers);
  const localRuleset = useAppState((s) => s.localRulesetId);
  const [code, setCode] = useState("");
  const [rulesetId, setRulesetId] = useState("duel");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void ensureSession(getState().name);
  }, []);

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

  return (
    <Shell wide>
      <div className="mb-8 flex items-end justify-between">
        <Logo />
        <div className="text-right text-sm text-white/50">
          <div>{apiOnline ? (user ? `conta: ${user.name}${user.guest ? " (convidado)" : ""}` : "conectando à conta…") : "modo offline — sem conta"}</div>
          <button className="btn btn-ghost mt-1 px-3 py-1 text-xs" onClick={() => navigate("profile")}>
            Perfil e atributos →
          </button>
        </div>
      </div>

      <ErrorBanner message={error} onClose={() => setState({ error: null })} />

      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <Card>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">Seu nome</label>
          <input className="input mb-5" value={name} maxLength={16} placeholder="Como quer ser chamado?" onChange={(e) => setState({ name: e.target.value })} />

          <h2 className="font-display mb-2 text-lg font-bold">Treino local</h2>
          <p className="mb-3 text-sm text-white/50">Arena carregada no seu navegador. Sem rede, sem espera.</p>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={localTwo} onChange={(e) => setState({ localTwoPlayers: e.target.checked })} />
              2 jogadores no mesmo teclado (IJKL + N/M)
            </label>
            <select className="input w-auto py-1.5" value={localRuleset} onChange={(e) => setState({ localRulesetId: e.target.value })}>
              {Object.values(RULESETS)
                .filter((r) => r.id !== "squads" && r.id !== "trios")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {ARENAS[r.arenaId]?.name ?? r.arenaId} · {r.durationSeconds / 60} min
                  </option>
                ))}
            </select>
          </div>
          <button className="btn btn-primary w-full" onClick={startLocal}>
            Entrar na arena
          </button>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-display mb-2 text-lg font-bold">Jogar online</h2>
            <div className="mb-3 flex gap-2">
              <select className="input" value={rulesetId} onChange={(e) => setRulesetId(e.target.value)}>
                <option value="duel">1v1 · Quadra Neon</option>
                <option value="doubles">2v2 · Quadra Neon</option>
                <option value="trios">3v3 · Terraço Solar</option>
                <option value="squads">4v4 · Terraço Solar</option>
              </select>
              <button className="btn btn-secondary shrink-0" disabled={busy !== null} onClick={() => void connectAndJoin("create", { rulesetId })}>
                {busy === "create" ? "…" : "Criar sala"}
              </button>
            </div>
            <div className="flex gap-2">
              <input className="input uppercase tracking-widest" value={code} maxLength={6} placeholder="CÓDIGO" onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <button className="btn btn-secondary shrink-0" disabled={busy !== null || code.length < 4} onClick={() => void connectAndJoin("join", { code })}>
                {busy === "join" ? "…" : "Entrar"}
              </button>
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">Partida rápida</h2>
                <p className="text-sm text-white/50">{apiOnline ? "Fila por habilidade. Começa sozinha quando completar." : "Precisa da API online."}</p>
              </div>
              <button className="btn btn-primary shrink-0" disabled={!apiOnline || busy !== null} onClick={() => void quickMatch()}>
                {busy === "queue" ? "…" : "Buscar"}
              </button>
            </div>
          </Card>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-white/30">WASD mover · Espaço chutar · Shift habilidade · controle também funciona</p>
    </Shell>
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
