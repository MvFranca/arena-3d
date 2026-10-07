import { getAbility, getArena, getRuleset, secondsToTicks, type MatchEvent, type Team } from "@arena/sim";
import { useEffect, useRef } from "react";
import { BINDING_P1, BINDING_P2 } from "../../game/InputCollector";
import { LocalHost } from "../../game/LocalHost";
import { RemoteHost } from "../../game/RemoteHost";
import type { RenderState, SimulationHost } from "../../game/types";
import { connection } from "../../net/GameConnection";
import { gameAudio } from "../../render/Audio";
import { GameView } from "../../render/GameView";
import { Hud } from "../../ui/Hud";
import { getState, initialHud, navigate, setHud, setState, useAppState, type MatchResult } from "../store";

export function MatchScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mode = useAppState((s) => s.mode);
  const room = useAppState((s) => s.room);
  const connected = useAppState((s) => s.hud.connected);
  const arenaId = mode === "online" ? (room?.ruleset.arenaId ?? "classic") : getRuleset(getState().localRulesetId).arenaId;
  const theme = getArena(arenaId).theme;

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

    const view = new GameView(canvas, host, arenaId, { onEvent, onFrame });
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
      <Hud leftColor={theme.left} rightColor={theme.right} onLeave={leave} showPing={mode === "online"} />
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
