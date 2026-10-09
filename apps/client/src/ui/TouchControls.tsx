import { getAbility, TICK_RATE } from "@arena/sim";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { resetTouchInput, touchInput } from "../game/touchInput";
import { useAppState } from "../app/store";
import { AbilityIcon, BallIcon } from "./icons";

const TOUCH_MQ = "(max-width: 767px), (pointer: coarse)";
const BASE_PORTRAIT = 132;
const BASE_LANDSCAPE = 104;
const KNOB_PORTRAIT = 56;
const KNOB_LANDSCAPE = 44;

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function useShowTouchControls(): boolean {
  return useMedia(TOUCH_MQ);
}

export function usePortrait(): boolean {
  return useMedia("(orientation: portrait)");
}

export function TouchControls() {
  const show = useShowTouchControls();
  const portrait = usePortrait();
  const hud = useAppState((s) => s.hud);
  const baseRef = useRef<HTMLDivElement>(null);
  const stickId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [kickHeld, setKickHeld] = useState(false);
  const [abilityHeld, setAbilityHeld] = useState(false);
  const base = portrait ? BASE_PORTRAIT : BASE_LANDSCAPE;
  const knobSize = portrait ? KNOB_PORTRAIT : KNOB_LANDSCAPE;
  const maxTravel = (base - knobSize) / 2;

  useEffect(() => {
    return () => resetTouchInput();
  }, []);

  useEffect(() => {
    if (!show) resetTouchInput();
  }, [show]);

  if (!show) return null;

  const ability = hud.abilityId ? getAbility(hud.abilityId) : null;
  const cdFrac = ability && hud.cooldownTotal > 0 ? Math.min(1, hud.cooldownTicks / hud.cooldownTotal) : 0;
  const cdSeconds = Math.ceil(hud.cooldownTicks / TICK_RATE);

  const moveStick = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    const scale = len > maxTravel ? maxTravel / len : 1;
    const kx = dx * scale;
    const ky = dy * scale;
    setKnob({ x: kx, y: ky });
    touchInput.dirX = kx / maxTravel;
    touchInput.dirZ = ky / maxTravel;
  };

  const endStick = () => {
    stickId.current = null;
    setKnob({ x: 0, y: 0 });
    touchInput.dirX = 0;
    touchInput.dirZ = 0;
  };

  const onStickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    stickId.current = e.pointerId;
    moveStick(e.clientX, e.clientY);
  };

  const onStickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickId.current !== e.pointerId) return;
    e.preventDefault();
    moveStick(e.clientX, e.clientY);
  };

  const onStickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickId.current !== e.pointerId) return;
    endStick();
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 select-none" data-testid="touch-controls">
      <div
        className="flex items-end justify-between px-4 pb-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))", paddingLeft: "max(1rem, env(safe-area-inset-left))", paddingRight: "max(1rem, env(safe-area-inset-right))" }}
      >
        <div
          ref={baseRef}
          role="slider"
          aria-label="Analógico"
          aria-valuemin={-1}
          aria-valuemax={1}
          aria-valuenow={0}
          className="pointer-events-auto relative touch-none rounded-full border border-white/20 bg-black/35 shadow-2xl backdrop-blur-sm"
          style={{ width: base, height: base }}
          onPointerDown={onStickDown}
          onPointerMove={onStickMove}
          onPointerUp={onStickUp}
          onPointerCancel={onStickUp}
          onLostPointerCapture={onStickUp}
          onContextMenu={(e) => e.preventDefault()}
          data-testid="touch-stick"
        >
          <div
            className="absolute left-1/2 top-1/2 rounded-full border border-white/40 bg-white/35 shadow-lg"
            style={{
              width: knobSize,
              height: knobSize,
              transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
            }}
          />
        </div>

        <div className="pointer-events-auto flex items-end gap-3">
          <HoldButton
            label={ability ? (cdFrac > 0 ? cdSeconds : <AbilityIcon id={hud.abilityId!} size={22} />) : "—"}
            hint="Hab."
            held={abilityHeld}
            disabled={!ability}
            size={portrait ? 64 : 56}
            onHeld={(v) => {
              setAbilityHeld(v);
              touchInput.ability = v;
            }}
            testId="touch-ability"
          />
          <HoldButton
            label={<BallIcon size={26} />}
            hint="Chute"
            held={kickHeld}
            size={portrait ? 76 : 64}
            accent
            onHeld={(v) => {
              setKickHeld(v);
              touchInput.kick = v;
            }}
            testId="touch-kick"
          />
        </div>
      </div>
    </div>
  );
}

function HoldButton(props: {
  label: ReactNode;
  hint: string;
  held: boolean;
  size: number;
  accent?: boolean;
  disabled?: boolean;
  onHeld: (v: boolean) => void;
  testId: string;
}) {
  const activeId = useRef<number | null>(null);

  const release = (pointerId: number) => {
    if (activeId.current !== pointerId) return;
    activeId.current = null;
    props.onHeld(false);
  };

  return (
    <button
      type="button"
      disabled={props.disabled}
      data-testid={props.testId}
      className={`touch-none rounded-full border font-display font-bold shadow-2xl backdrop-blur-sm ${
        props.accent ? "border-[#ff4fd8]/60 bg-[#ff4fd8]/85 text-[#1a0a1f]" : "border-white/25 bg-black/45 text-white"
      } ${props.held ? "scale-95" : ""} ${props.disabled ? "opacity-40" : ""}`}
      style={{ width: props.size, height: props.size }}
      onPointerDown={(e) => {
        if (props.disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        activeId.current = e.pointerId;
        props.onHeld(true);
      }}
      onPointerUp={(e) => release(e.pointerId)}
      onPointerCancel={(e) => release(e.pointerId)}
      onLostPointerCapture={(e) => release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="flex items-center justify-center leading-none">{props.label}</span>
      {props.hint ? <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wider opacity-70">{props.hint}</span> : null}
    </button>
  );
}
