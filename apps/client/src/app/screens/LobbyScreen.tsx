import { ARENAS, getAbility, hasAbility } from "@arena/sim";
import { useEffect, useState } from "react";
import { connection } from "../../net/GameConnection";
import { CameraSettings } from "../../ui/CameraSettings";
import { Card, ErrorBanner, Logo, Shell } from "../../ui/common";
import { navigate, setState, useAppState } from "../store";

export function LobbyScreen() {
  const room = useAppState((s) => s.room);
  const mySlot = useAppState((s) => s.mySlot);
  const error = useAppState((s) => s.error);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!room) {
      navigate("home");
      return;
    }
    if (room.phase !== "lobby" && room.phase !== "finished") navigate("match");
  }, [room]);

  useEffect(() => connection.on("left", () => navigate("home")), []);
  useEffect(() => connection.on("error", (_c, m) => setState({ error: m })), []);

  if (!room) return null;
  const me = room.players.find((p) => p.slot === mySlot);
  const arena = ARENAS[room.ruleset.arenaId];
  const left = room.players.filter((p) => p.team === "left");
  const right = room.players.filter((p) => p.team === "right");
  const everyoneReady = room.players.length >= 2 && room.players.every((p) => p.ready || p.isHost);
  const teamSize = room.ruleset.teamSize;

  const copy = () => {
    void navigator.clipboard?.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const leave = () => {
    connection.leaveRoom();
    connection.disconnect();
    navigate("home");
  };

  return (
    <Shell wide>
      <div className="mb-6 flex items-center justify-between">
        <Logo small />
        <button className="btn btn-ghost" onClick={leave}>
          Sair da sala
        </button>
      </div>
      <ErrorBanner message={error} onClose={() => setState({ error: null })} />
      <Card>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/40">Código da sala</div>
            <button className="font-display mt-1 flex items-center gap-3 text-4xl font-bold tracking-[0.25em]" onClick={copy} title="Copiar">
              {room.code}
              <span className="text-sm font-normal tracking-normal text-white/40">{copied ? "copiado!" : "copiar"}</span>
            </button>
          </div>
          <div className="text-right text-sm text-white/60">
            <div className="font-semibold text-white">{arena?.name ?? room.ruleset.arenaId}</div>
            <div>
              {teamSize}v{teamSize} · {room.ruleset.durationSeconds / 60} min
            </div>
            {room.automatic && <div className="text-[#ffb3ec]">partida automática</div>}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TeamColumn title="Vermelho" color={arena?.theme.left ?? "#ff5f6d"} players={left} capacity={teamSize} mySlot={mySlot} onJoin={() => connection.sendJson({ t: "team", team: "left" })} />
          <TeamColumn title="Azul" color={arena?.theme.right ?? "#4fc3ff"} players={right} capacity={teamSize} mySlot={mySlot} onJoin={() => connection.sendJson({ t: "team", team: "right" })} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-white/50">{room.players.length} / {room.ruleset.maxPlayers} jogadores · precisa de pelo menos 2</div>
          <div className="flex gap-2">
            {me && !me.isHost && !room.automatic && (
              <button className={`btn ${me.ready ? "btn-secondary" : "btn-primary"}`} onClick={() => connection.sendJson({ t: "ready", ready: !me.ready })}>
                {me.ready ? "Pronto ✓" : "Estou pronto"}
              </button>
            )}
            {me?.isHost && !room.automatic && (
              <button className="btn btn-primary" disabled={!everyoneReady} onClick={() => connection.sendJson({ t: "start" })} title={everyoneReady ? "" : "Todos precisam estar prontos"}>
                Começar partida
              </button>
            )}
            {room.automatic && <span className="text-sm text-white/60">A partida começa quando a sala encher.</span>}
          </div>
        </div>
      </Card>
      <Card className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">Sua câmera</h3>
          <span className="text-xs text-white/40">só você vê · troque com C na partida</span>
        </div>
        <CameraSettings compact />
      </Card>
    </Shell>
  );
}

function TeamColumn(props: { title: string; color: string; players: { slot: number; name: string; ready: boolean; isHost: boolean; connected: boolean; abilityId: string | null; archetypeId?: string }[]; capacity: number; mySlot: number | null; onJoin: () => void; }) {
  const slots = Array.from({ length: props.capacity }, (_, i) => props.players[i] ?? null);
  const iAmHere = props.players.some((p) => p.slot === props.mySlot);
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: `${props.color}55`, background: `${props.color}0f` }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="font-display flex items-center gap-2 text-lg font-bold">
          <span className="h-3 w-3 rounded-full" style={{ background: props.color, boxShadow: `0 0 10px ${props.color}` }} />
          {props.title}
        </div>
        {!iAmHere && props.players.length < props.capacity && (
          <button className="btn btn-ghost px-3 py-1 text-xs" onClick={props.onJoin}>
            entrar neste time
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {slots.map((p, i) => (
          <li key={i} className={`flex items-center justify-between rounded-xl px-3 py-2 ${p ? "bg-black/30" : "border border-dashed border-white/10 text-white/25"}`}>
            {p ? (
              <>
                <span className="flex items-center gap-2">
                  <span className={`font-semibold ${p.slot === props.mySlot ? "text-white" : "text-white/80"}`}>{p.name}</span>
                  {p.isHost && <span className="rounded bg-white/10 px-1.5 text-[10px] uppercase tracking-wider text-white/60">host</span>}
                  {!p.connected && <span className="text-xs text-red-300">desconectado</span>}
                </span>
                <span className="flex items-center gap-2 text-xs text-white/50">
                  {p.abilityId && hasAbility(p.abilityId) && <span>{getAbility(p.abilityId).name}</span>}
                  {p.ready || p.isHost ? <span className="text-emerald-300">pronto</span> : <span>aguardando</span>}
                </span>
              </>
            ) : (
              <span className="text-sm">vaga livre</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
