import { formatClock, getAbility, TICK_RATE } from "@arena/sim";
import { useEffect, useState } from "react";
import { toggleCameraMode, useAppState } from "../app/store";
import { CAMERA_MODE_LABEL } from "./CameraSettings";
import { AbilityIcon, CameraIcon } from "./icons";
import { usePortrait, useShowTouchControls } from "./TouchControls";

const ABILITY_LABEL: Record<string, string> = { dash: "Impulso", power_shot: "Carga", shield: "Escudo" };
const ABILITY_KEY = "Shift";

export function Hud(props: {
  leftColor: string;
  rightColor: string;
  leftName?: string;
  rightName?: string;
  onLeave?: () => void;
  showPing: boolean;
  /** True quando ha dois jogadores no mesmo teclado: a camera fica em arena. */
  cameraLocked?: boolean;
  onToggleCameraPanel?: () => void;
}) {
  const hud = useAppState((s) => s.hud);
  const cameraMode = useAppState((s) => s.camera.mode);
  const cameraForced = !!props.cameraLocked && cameraMode === "thirdPerson";
  const [flashKey, setFlashKey] = useState(0);
  const [lastScore, setLastScore] = useState({ l: 0, r: 0 });

  useEffect(() => {
    if (hud.scoreLeft !== lastScore.l || hud.scoreRight !== lastScore.r) {
      setLastScore({ l: hud.scoreLeft, r: hud.scoreRight });
      setFlashKey((k) => k + 1);
    }
  }, [hud.scoreLeft, hud.scoreRight, lastScore.l, lastScore.r]);

  const ability = hud.abilityId ? getAbility(hud.abilityId) : null;
  const cdFrac = ability && hud.cooldownTotal > 0 ? Math.min(1, hud.cooldownTicks / hud.cooldownTotal) : 0;
  const cdSeconds = Math.ceil(hud.cooldownTicks / TICK_RATE);
  const touch = useShowTouchControls();
  const portrait = usePortrait();
  const compactHud = touch && portrait;

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Placar e relogio */}
      <div className={`absolute left-1/2 -translate-x-1/2 ${touch ? "top-2" : "top-4"}`}>
        <div className={`glass flex items-center shadow-xl ${touch ? "gap-2 rounded-xl px-3 py-1" : "gap-4 rounded-2xl px-5 py-2"}`}>
          <TeamBadge color={props.leftColor} name={props.leftName ?? "Vermelho"} align="right" compact={touch} />
          <div key={flashKey} className={`font-display pop-in font-bold tabular-nums tracking-tight ${compactHud ? "text-2xl" : touch ? "text-3xl" : "text-4xl"}`}>
            {hud.scoreLeft}
            <span className="mx-2 text-white/30">:</span>
            {hud.scoreRight}
          </div>
          <TeamBadge color={props.rightColor} name={props.rightName ?? "Azul"} align="left" compact={touch} />
        </div>
        <div className="mt-2 text-center">
          <span className={`font-display inline-block rounded-full px-3 py-0.5 text-sm font-semibold tabular-nums ${hud.clockTicks < 30 * TICK_RATE && hud.phase === "playing" ? "bg-[#ff4fd8]/30 text-[#ffb3ec]" : "bg-black/40 text-white/80"}`}>
            {formatClock(hud.clockTicks)}
          </span>
        </div>
      </div>

      {cameraForced && (
        <div className="absolute right-2 top-14 max-w-[min(16rem,calc(100%-1rem))] rounded-xl bg-amber-400/15 px-3 py-2 text-right text-xs text-amber-100 md:right-5" data-testid="camera-forced">
          Terceira pessoa só com um jogador por tela. Com dois teclados a câmera fica em Arena; volta sozinha ao jogar com 1.
        </div>
      )}

      {/* Overlays de fase */}
      <PhaseOverlay phase={hud.phase} phaseTicks={hud.phaseTicks} scoreLeft={hud.scoreLeft} scoreRight={hud.scoreRight} leftColor={props.leftColor} rightColor={props.rightColor} team={hud.team} />

      {/* Habilidade */}
      <div className={`absolute bottom-5 left-1/2 -translate-x-1/2 ${touch ? "hidden" : ""}`}>
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
          <div className="relative h-14 w-14">
            <svg viewBox="0 0 56 56" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="28" cy="28" r="24" stroke="rgba(255,255,255,0.12)" strokeWidth="5" fill="none" />
              <circle
                cx="28"
                cy="28"
                r="24"
                stroke={ability ? (cdFrac > 0 ? "rgba(255,255,255,0.35)" : "#ff4fd8") : "rgba(255,255,255,0.1)"}
                strokeWidth="5"
                fill="none"
                strokeDasharray={`${Math.PI * 48}`}
                strokeDashoffset={`${Math.PI * 48 * cdFrac}`}
                strokeLinecap="round"
              />
            </svg>
            <div className={`absolute inset-0 flex items-center justify-center rounded-full text-xl ${hud.charged ? "animate-pulse" : ""}`}>
              {ability ? (cdFrac > 0 ? <span className="font-display text-base font-bold text-white/70">{cdSeconds}</span> : <AbilityIcon id={hud.abilityId!} size={22} />) : <span className="text-white/20">—</span>}
            </div>
          </div>
          <div className="text-left">
            <div className="font-display text-sm font-bold">{ability ? ABILITY_LABEL[ability.id] ?? ability.name : "Sem habilidade"}</div>
            <div className="text-xs text-white/50">{ability ? (cdFrac > 0 ? "recarregando" : hud.charged ? "carregado — chute!" : hud.shielded ? "escudo ativo" : `${ABILITY_KEY} para usar`) : "escolha no perfil"}</div>
          </div>
        </div>
      </div>

      {/* Controles e ping */}
      <div className={`absolute bottom-5 left-5 text-xs text-white/40 ${touch ? "hidden" : ""}`}>
        <div>
          <b className="text-white/60">WASD</b> mover · <b className="text-white/60">Espaço</b> chutar · <b className="text-white/60">Shift</b> habilidade
        </div>
        <div className="mt-1">
          <b className="text-white/60">C</b> trocar câmera · <b className="text-white/60">V</b> ajustes
        </div>
      </div>
      <div className={`absolute left-2 top-2 flex text-xs md:left-5 md:top-5 ${compactHud ? "flex-col items-start gap-1" : "items-center gap-2"}`}>
        <button
          className="btn btn-ghost pointer-events-auto rounded-full bg-black/35 px-2 py-1 text-xs md:px-3"
          data-testid="camera-toggle"
          onClick={() => toggleCameraMode()}
          title={props.cameraLocked ? "Com 2 jogadores no mesmo teclado a câmera fica em Arena" : "Trocar câmera (C)"}
        >
          <CameraIcon size={14} />
          <span data-testid="camera-mode" className={compactHud ? "hidden" : undefined}>
            {cameraForced ? "De cima (2P)" : CAMERA_MODE_LABEL[cameraMode]}
          </span>
        </button>
        {props.onToggleCameraPanel && (
          <button className="btn btn-ghost pointer-events-auto rounded-full bg-black/35 px-3 py-1 text-xs" onClick={props.onToggleCameraPanel} title="Ajustes da câmera (V)">
            Ajustes
          </button>
        )}
      </div>
      <div className={`absolute right-2 top-2 flex text-xs md:right-5 md:top-5 ${compactHud ? "flex-col items-end gap-1" : "items-center gap-2"}`}>
        {props.showPing && (
          <span className={`rounded-full px-2 py-1 ${hud.connected ? "bg-black/40 text-white/60" : "bg-red-500/40 text-red-100"}`}>
            {hud.connected ? `${Math.round(hud.pingMs)} ms` : "reconectando…"}
          </span>
        )}
        {props.showPing && hud.netHint && (
          <span className="hidden rounded-full bg-black/30 px-2 py-1 font-mono text-[10px] text-white/40 sm:inline" title="idade do snapshot, buffer, atraso e correções">
            {hud.netHint}
          </span>
        )}
        {props.onLeave && (
          <button className="btn btn-ghost pointer-events-auto rounded-full px-3 py-1 text-xs" onClick={props.onLeave}>
            Sair
          </button>
        )}
      </div>
    </div>
  );
}

function TeamBadge({ color, name, align, compact }: { color: string; name: string; align: "left" | "right"; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <span className={`${compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} rounded-full shadow`} style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
      {!compact && <span className="font-display text-sm font-semibold text-white/80">{name}</span>}
    </div>
  );
}

function PhaseOverlay(props: { phase: string; phaseTicks: number; scoreLeft: number; scoreRight: number; leftColor: string; rightColor: string; team: string | null }) {
  const { phase, phaseTicks } = props;
  if (phase === "countdown") {
    const secs = Math.ceil(phaseTicks / TICK_RATE);
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div key={secs} className="font-display pop-in text-5xl font-bold drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)] md:text-8xl">
          {secs > 0 ? secs : "VAI!"}
        </div>
      </div>
    );
  }
  if (phase === "goal") {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="font-display pop-in text-5xl font-bold italic tracking-tight drop-shadow-[0_8px_30px_rgba(0,0,0,0.7)] md:text-7xl">GOOOL!</div>
      </div>
    );
  }
  if (phase === "finished") {
    const winner = props.scoreLeft === props.scoreRight ? null : props.scoreLeft > props.scoreRight ? "left" : "right";
    const color = winner === "left" ? props.leftColor : winner === "right" ? props.rightColor : "#ffffff";
    const text = winner === null ? "EMPATE" : props.team ? (props.team === winner ? "VITÓRIA" : "DERROTA") : winner === "left" ? "VERMELHO VENCE" : "AZUL VENCE";
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="font-display pop-in text-4xl font-bold tracking-tight md:text-7xl" style={{ color, textShadow: `0 0 40px ${color}` }}>
          {text}
        </div>
      </div>
    );
  }
  if (phase === "lobby") {
    return (
      <div className="absolute left-1/2 top-28 -translate-x-1/2 rounded-full bg-black/40 px-4 py-1 text-sm text-white/70">aquecimento — aguardando início</div>
    );
  }
  return null;
}
