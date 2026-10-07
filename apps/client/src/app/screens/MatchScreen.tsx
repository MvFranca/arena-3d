import { getAbility, getArena, getRuleset, secondsToTicks, type MatchEvent, type Team } from "@arena/sim";
import { useEffect, useRef, useState } from "react";
import { BINDING_P1, BINDING_P2 } from "../../game/InputCollector";
import { LocalHost } from "../../game/LocalHost";
import { RemoteHost } from "../../game/RemoteHost";
import type { RenderState, SimulationHost } from "../../game/types";
import { connection } from "../../net/GameConnection";
import { gameAudio } from "../../render/Audio";
import { GameView } from "../../render/GameView";
import { CameraSettings } from "../../ui/CameraSettings";
import { Hud } from "../../ui/Hud";
import { getState, initialHud, navigate, setHud, setState, toggleCameraMode, useAppState, type MatchResult } from "../store";

export function MatchScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const mode = useAppState((s) => s.mode);
  const room = useAppState((s) => s.room);
  const connected = useAppState((s) => s.hud.connected);
  const localTwo = useAppState((s) => s.localTwoPlayers);
  const [cameraPanel, setCameraPanel] = useState(false);
  const cameraLocked = mode === "local" && localTwo;

  // Atalhos da camera: C alterna o modo, V abre o painel rapido. Fora dos inputs de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return;
      if (e.code === "KeyC") toggleCameraMode();
      else if (e.code === "KeyV") setCameraPanel((v) => !v);
      else if (e.code === "Escape") setCameraPanel(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const arena = mode === "online" ? (room?.arena ?? getArena(room?.ruleset.arenaId ?? "classic")) : getArena(getRuleset(getState().localRulesetId).arenaId);
  const theme = arena.theme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = getState();
    gameAudio.unlock();

    let host: SimulationHost;
    if (s.mode === "online") {
      if (!connection.room || !connection.playerId) {
        navigate("home");
        return;
      }
      host = new RemoteHost(connection, connection.room, connection.playerId);
    } else {
      const name = s.name.trim() || "Você";
      host = new LocalHost(s.localRulesetId, [
        { id: "p1", name, team: "left", loadout: s.loadout, binding: BINDING_P1 },
        ...(s.localTwoPlayers ? [{ id: "p2", name: "Jogador 2", team: "right" as Team, loadout: { ...s.loadout, attributes: { ...s.loadout.attributes } }, binding: BINDING_P2 }] : []),
      ]);
    }

    const goals: MatchResult["goals"] = [];
    const myId = host.localPlayerIds[0] ?? null;
    let ended = false;
    let lastHudMs = 0;
    let navTimer: number | null = null;

    const onEvent = (ev: MatchEvent, state: RenderState) => {
      if (ev.type === "goal") {
        const scorer = state.players.find((p) => p.id === ev.scorerId);
        goals.push({ team: ev.team, scorerName: scorer?.name ?? "—", ownGoal: ev.ownGoal, clockTicks: state.clockTicksRemaining });
      }
      if (ev.type === "match_ended" && !ended) {
        ended = true;
        const myTeam = state.players.find((p) => p.id === myId)?.team ?? null;
        const result: MatchResult = {
          scoreLeft: ev.scoreLeft,
          scoreRight: ev.scoreRight,
          winner: ev.winner,
          myTeam,
          goals: goals.slice(),
          players: state.players.map((p) => ({
            id: p.id,
            name: p.name,
            team: p.team,
            goals: goals.filter((g) => g.scorerName === p.name && !g.ownGoal).length,
            ownGoals: goals.filter((g) => g.scorerName === p.name && g.ownGoal).length,
          })),
          durationTicks: secondsToTicks(s.mode === "online" ? (connection.room?.ruleset.durationSeconds ?? 180) : getRuleset(s.localRulesetId).durationSeconds),
          mode: s.mode,
        };
        setState({ result });
        navTimer = window.setTimeout(() => navigate("result"), 3500);
      }
    };

    const onFrame = (state: RenderState, now: number) => {
      if (now - lastHudMs < 100) return; // HUD a 10 Hz: React fora do caminho quente
      lastHudMs = now;
      const me = state.players.find((p) => p.id === myId);
      const ability = me?.abilityId ?? null;
      setHud({
        scoreLeft: state.scoreLeft,
        scoreRight: state.scoreRight,
        clockTicks: state.clockTicksRemaining,
        phase: state.phase,
        phaseTicks: state.phaseTicksRemaining,
        cooldownTicks: me?.cooldownTicks ?? 0,
        cooldownTotal: ability ? getAbility(ability).cooldownTicks : 1,
        abilityId: ability,
        charged: !!me && (me.flags & 8) !== 0,
        shielded: !!me && (me.flags & 2) !== 0,
        pingMs: host.pingMs,
        team: me?.team ?? null,
        connected: s.mode === "online" ? connection.status === "connected" : true,
      });
    };

    const view = new GameView(canvas, host, arena, { onEvent, onFrame, ballIndicator: indicatorRef.current });
    view.start();
    setHud({ ...initialHud });

    const unsubLeft = s.mode === "online" ? connection.on("left", () => navigate("home")) : () => undefined;

    return () => {
      if (navTimer !== null) clearTimeout(navTimer);
      unsubLeft();
      view.dispose();
      host.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = () => {
    if (getState().mode === "online") {
      connection.leaveRoom();
      connection.disconnect();
    }
    navigate("home");
  };

  return (
    <div className="relative h-full w-full bg-[#0b1020]">
      <canvas ref={canvasRef} className="h-full w-full" />
      {/* Seta para a bola fora do enquadramento (so em terceira pessoa); posicionada pelo GameView. */}
      <div ref={indicatorRef} data-testid="ball-indicator" className="pointer-events-none absolute left-0 top-0 opacity-0 transition-opacity duration-150 will-change-transform">
        <div className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs font-semibold text-white shadow-lg ring-1 ring-white/20">
          <span className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_8px_#fff]" />
          <span aria-hidden>➜</span>
        </div>
      </div>
      <Hud leftColor={theme.left} rightColor={theme.right} onLeave={leave} showPing={mode === "online"} cameraLocked={cameraLocked} onToggleCameraPanel={() => setCameraPanel((v) => !v)} />
      {cameraPanel && (
        <div className="glass absolute right-5 top-24 w-80 rounded-2xl p-4 shadow-2xl" data-testid="camera-panel">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold">Câmera</h3>
            <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => setCameraPanel(false)}>
              fechar (V)
            </button>
          </div>
          <CameraSettings compact />
        </div>
      )}
      {mode === "online" && !connected && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="glass rounded-2xl px-6 py-4 text-center">
            <div className="font-display text-xl font-bold">Reconectando…</div>
            <div className="text-sm text-white/60">sua vaga fica reservada por 15 segundos</div>
          </div>
        </div>
      )}
    </div>
  );
}
