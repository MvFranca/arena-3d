import { useEffect, useRef, useState } from "react";
import { connection } from "../../net/GameConnection";
import { api } from "../../session/api";
import { Card, Logo, Shell } from "../../ui/common";
import { blurFieldOnEscape } from "../../ui/keys";
import { getState, navigate, setState, showError, useAppState } from "../store";

export function QueueScreen() {
  const queue = useAppState((s) => s.queue);
  const [elapsed, setElapsed] = useState(0);
  const joining = useRef(false);

  useEffect(() => {
    const start = performance.now();
    const t = setInterval(() => setElapsed(Math.floor((performance.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const st = await api.queueStatus();
        if (!alive) return;
        if (st.status === "found" && st.match && !joining.current) {
          joining.current = true;
          const s = getState();
          const ok = await connection.connect(st.match.serverUrl, { token: s.token ?? undefined, name: s.name, loadout: s.loadout });
          if (!ok) throw new Error("Não foi possível conectar ao servidor da partida.");
          connection.sendJson({ t: "join", code: st.match.roomCode, ticket: st.match.ticket });
          const unsub = connection.on("room", () => {
            unsub();
            setState({ queue: null, mode: "online" });
            navigate("lobby");
          });
          return;
        }
        if (st.status === "idle" && !joining.current) {
          setState({ queue: null });
          navigate("home");
        }
      } catch (e) {
        if (!alive) return;
        showError((e as Error).message);
        setState({ queue: null });
        navigate("home");
      }
    };
    void poll();
    const t = setInterval(() => void poll(), 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (blurFieldOnEscape(e.target)) return;
      void cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cancel = async () => {
    try {
      await api.queueLeave();
    } catch {
      /* ignore */
    }
    setState({ queue: null });
    navigate("home");
  };

  return (
    <Shell>
      <div className="mb-6">
        <Logo small />
      </div>
      <Card className="text-center">
        <div className="mx-auto mb-5 h-16 w-16 animate-spin rounded-full border-4 border-white/10 border-t-[#ff4fd8]" />
        <h2 className="font-display text-2xl font-bold">Procurando partida…</h2>
        <p className="mt-1 text-sm text-white/50">
          modo {queue?.rulesetId ?? "duel"} · {elapsed}s · a faixa de MMR aumenta com o tempo
        </p>
        <button className="btn btn-secondary mt-6" onClick={() => void cancel()}>
          Cancelar
        </button>
      </Card>
    </Shell>
  );
}
