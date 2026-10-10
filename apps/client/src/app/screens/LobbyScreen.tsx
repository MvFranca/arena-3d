import { useEffect, useState } from "react";
import { connection } from "../../net/GameConnection";
import { CameraSettings } from "../../ui/CameraSettings";
import { Card, ErrorBanner, Logo, Shell } from "../../ui/common";
import { blurFieldOnEscape, isFormField } from "../../ui/keys";
import { RoomBoard } from "../../ui/RoomBoard";
import { roomLink, setSalaParam } from "../roomLink";
import { navigate, setState, useAppState } from "../store";

export function LobbyScreen() {
  const room = useAppState((s) => s.room);
  const mySlot = useAppState((s) => s.mySlot);
  const error = useAppState((s) => s.error);
  const apiOnline = useAppState((s) => s.apiOnline);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!room) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (blurFieldOnEscape(e.target)) return;
        leave();
        return;
      }
      if (e.key !== "Enter" || isFormField(e.target) || e.target instanceof HTMLButtonElement) return;
      const player = room.players.find((p) => p.slot === mySlot);
      if (!player || room.automatic || room.phase !== "lobby") return;
      e.preventDefault();
      if (player.isHost) {
        const field = room.players.filter((p) => p.team !== "spec");
        const ready = field.some((p) => p.team === "left") && field.some((p) => p.team === "right") && field.every((p) => p.ready || p.isHost);
        if (ready) connection.sendJson({ t: "start" });
      } else if (player.team !== "spec") {
        connection.sendJson({ t: "ready", ready: !player.ready });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!room) return null;

  const copy = () => {
    void navigator.clipboard?.writeText(roomLink(room.code));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const leave = () => {
    connection.leaveRoom();
    connection.disconnect();
    setSalaParam(null);
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
            <button className="font-display mt-1 flex items-center gap-3 text-4xl font-bold tracking-[0.25em]" onClick={copy} title="Copiar o link da sala">
              {room.code}
              <span className="text-sm font-normal tracking-normal text-white/40">{copied ? "link copiado!" : "copiar link"}</span>
            </button>
            <div className="mt-1 max-w-md truncate text-xs text-white/40">{roomLink(room.code)}</div>
          </div>
          <div className="text-right text-sm text-white/60">
            <div className="font-semibold text-white">{room.arena.name}</div>
            {room.automatic && <div className="text-[#ffb3ec]">partida automática</div>}
          </div>
        </div>
        <RoomBoard room={room} mySlot={mySlot} apiOnline={apiOnline} mode="lobby" onLeave={leave} />
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
