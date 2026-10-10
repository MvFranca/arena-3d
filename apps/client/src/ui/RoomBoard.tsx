import type { RoomInfo, RosterPlayer, RosterTeam } from "@arena/protocol";
import { useState } from "react";
import { roomLink } from "../app/roomLink";
import { navigate } from "../app/store";
import { connection } from "../net/GameConnection";
import { MapPreview } from "./MapPreview";
import { MapSelect } from "./MapSelect";

const COLUMNS: { team: RosterTeam; title: string }[] = [
  { team: "left", title: "Vermelho" },
  { team: "spec", title: "Espectadores" },
  { team: "right", title: "Azul" },
];

export function RoomBoard(props: {
  room: RoomInfo;
  mySlot: number | null;
  apiOnline: boolean;
  mode: "lobby" | "match";
  onLeave: () => void;
}) {
  const { room, mySlot } = props;
  const me = room.players.find((p) => p.slot === mySlot);
  const host = !!me?.isHost && !room.automatic;
  const canEditMap = host && (room.phase === "lobby" || room.phase === "finished" || room.paused);
  const canEditLimits = host && room.phase !== "finished";
  const field = room.players.filter((p) => p.team !== "spec");
  const bothSides = field.some((p) => p.team === "left") && field.some((p) => p.team === "right");
  const everyoneReady = bothSides && field.every((p) => p.ready || p.isHost);
  const [copied, setCopied] = useState(false);
  const [over, setOver] = useState<RosterTeam | null>(null);
  const [timeFocus, setTimeFocus] = useState(false);
  const [scoreFocus, setScoreFocus] = useState(false);
  const [timeDraft, setTimeDraft] = useState("");
  const [scoreDraft, setScoreDraft] = useState("");
  const minutes = Math.round(room.ruleset.durationSeconds / 60);

  const copy = () => {
    void navigator.clipboard?.writeText(roomLink(room.code));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sendLimits = (durationMinutes: number, scoreLimit: number) => {
    connection.sendJson({
      t: "set_limits",
      durationSeconds: durationMinutes * 60,
      scoreLimit,
    });
  };

  const parseLimit = (raw: string, max: number): number | null => {
    const text = raw.trim();
    if (text === "") return null;
    const n = Number(text);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(max, Math.round(n)));
  };

  const onTime = (raw: string) => {
    setTimeDraft(raw);
    const next = parseLimit(raw, 30);
    if (next === null) return;
    const score = scoreFocus ? parseLimit(scoreDraft, 20) : room.ruleset.scoreLimit;
    if (score === null) return;
    sendLimits(next, score);
  };

  const onScore = (raw: string) => {
    setScoreDraft(raw);
    const next = parseLimit(raw, 20);
    if (next === null) return;
    const time = timeFocus ? parseLimit(timeDraft, 30) : minutes;
    if (time === null) return;
    sendLimits(time, next);
  };

  const canDrag = (p: RosterPlayer) => host || p.slot === mySlot;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#12161c]" data-testid="room-board">
      {props.mode === "match" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ff4fd8]/70 px-4 py-3">
          <div className="font-display flex items-center gap-2 text-lg font-bold">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
            {room.arena.name}
            <span className="text-sm font-normal tracking-[0.2em] text-white/40">{room.code}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {host && room.phase !== "lobby" && room.phase !== "finished" && (
              <button className="btn btn-primary px-3 py-1.5 text-sm" data-testid="pause-match" onClick={() => connection.sendJson({ t: "pause", paused: !room.paused })}>
                {room.paused ? "Retomar" : "Pausar"}
              </button>
            )}
            {host && room.phase !== "lobby" && (
              <button className="btn btn-secondary px-3 py-1.5 text-sm" data-testid="restart-match" onClick={() => connection.sendJson({ t: "restart" })}>
                Reiniciar
              </button>
            )}
            <button className="btn btn-secondary px-3 py-1.5 text-sm" onClick={copy}>
              {copied ? "Copiado" : "Link"}
            </button>
            <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={props.onLeave}>
              Sair
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 p-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const players = room.players.filter((p) => p.team === col.team);
          const color = col.team === "left" ? room.arena.theme.left : col.team === "right" ? room.arena.theme.right : "#9aa4b2";
          return (
            <section
              key={col.team}
              className={`min-h-48 rounded-xl border p-3 ${over === col.team ? "border-white/50 bg-white/10" : "border-white/10 bg-black/30"}`}
              onDragOver={(e) => {
                if (!host && me?.team === col.team) return;
                e.preventDefault();
                setOver(col.team);
              }}
              onDragLeave={() => setOver((v) => (v === col.team ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (!id || room.automatic) return;
                connection.sendJson({ t: "assign", playerId: id, team: col.team });
              }}
            >
              <h3 className="font-display mb-3 text-center text-sm font-bold uppercase tracking-widest" style={{ color }}>
                {col.title}
              </h3>
              <ul className="space-y-1.5">
                {players.map((p) => (
                  <li
                    key={p.id}
                    draggable={canDrag(p) && !room.automatic}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", p.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={`flex items-center justify-between rounded-lg bg-black/40 px-2.5 py-1.5 text-sm ${canDrag(p) && !room.automatic ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <span className={`truncate font-semibold ${p.slot === mySlot ? "text-amber-200" : "text-white/85"}`}>
                      {p.name}
                      {p.isHost && <span className="ml-2 text-[10px] uppercase tracking-wider text-white/40">host</span>}
                    </span>
                    <span className="shrink-0 text-xs text-white/45">
                      {!p.connected ? "off" : props.mode === "lobby" ? (p.team !== "spec" && (p.ready || p.isHost) ? "pronto" : p.team === "spec" ? "" : "…") : ""}
                    </span>
                  </li>
                ))}
                {players.length === 0 && <li className="py-6 text-center text-xs text-white/25">solte aqui</li>}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="grid gap-2 px-4 pb-4 text-sm sm:grid-cols-[auto_1fr] sm:items-center">
        <label className="text-white/50" htmlFor="room-time">
          Tempo (min)
        </label>
        <input
          id="room-time"
          className="input w-24 py-1.5"
          type="number"
          min={0}
          max={30}
          inputMode="numeric"
          disabled={!canEditLimits}
          value={timeFocus ? timeDraft : String(minutes)}
          onFocus={() => {
            setTimeDraft(String(minutes));
            setTimeFocus(true);
          }}
          onBlur={() => setTimeFocus(false)}
          onChange={(e) => onTime(e.target.value)}
        />
        <label className="text-white/50" htmlFor="room-score">
          Gols
        </label>
        <input
          id="room-score"
          className="input w-24 py-1.5"
          type="number"
          min={0}
          max={20}
          inputMode="numeric"
          disabled={!canEditLimits}
          value={scoreFocus ? scoreDraft : String(room.ruleset.scoreLimit)}
          onFocus={() => {
            setScoreDraft(String(room.ruleset.scoreLimit));
            setScoreFocus(true);
          }}
          onBlur={() => setScoreFocus(false)}
          onChange={(e) => onScore(e.target.value)}
        />
        <span className="text-white/50">Estádio</span>
        <div className="flex flex-wrap items-center gap-2">
          <MapSelect value={room.mapId} fallbackName={room.arena.name} apiOnline={props.apiOnline} disabled={!canEditMap} onChange={(id) => connection.sendJson({ t: "set_map", mapId: id })} />
          {host && props.mode === "lobby" && (
            <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => navigate("maps")}>
              Editar mapa
            </button>
          )}
          {host && props.mode === "match" && !canEditMap && <span className="text-xs text-white/40">pause para trocar o mapa</span>}
        </div>
        <div className="h-36 overflow-hidden rounded-xl bg-black/40 sm:col-span-2">
          <MapPreview arena={room.arena} />
        </div>
      </div>

      {props.mode === "lobby" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <div className="text-sm text-white/50">
            {room.players.length} / {room.ruleset.maxPlayers} na sala · {room.ruleset.teamSize}v{room.ruleset.teamSize}
            {room.paused && <span className="ml-2 text-amber-200">pausado</span>}
          </div>
          <div className="flex gap-2">
            {me && !me.isHost && me.team !== "spec" && !room.automatic && (
              <button className={`btn ${me.ready ? "btn-secondary" : "btn-primary"}`} onClick={() => connection.sendJson({ t: "ready", ready: !me.ready })}>
                {me.ready ? "Pronto ✓" : "Estou pronto"}
              </button>
            )}
            {me?.isHost && !room.automatic && (
              <button className="btn btn-primary" disabled={!everyoneReady} onClick={() => connection.sendJson({ t: "start" })} title={everyoneReady ? "" : "Um em cada time, e todos em campo prontos"}>
                Começar partida
              </button>
            )}
            {room.automatic && <span className="text-sm text-white/60">A partida começa quando a sala encher.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
