import { useState } from "react";
import { usePortrait, useShowTouchControls } from "./TouchControls";

const LS_PORTRAIT = "arena.playPortrait";

export function RotatePrompt() {
  const touch = useShowTouchControls();
  const portrait = usePortrait();
  const [allowPortrait, setAllowPortrait] = useState(() => {
    try {
      return sessionStorage.getItem(LS_PORTRAIT) === "1";
    } catch {
      return false;
    }
  });

  if (!touch || !portrait || allowPortrait) return null;

  const stayPortrait = () => {
    try {
      sessionStorage.setItem(LS_PORTRAIT, "1");
    } catch {
      /* ignore */
    }
    setAllowPortrait(true);
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6" data-testid="rotate-prompt">
      <div className="glass w-full max-w-sm rounded-3xl px-6 py-7 text-center shadow-2xl">
        <div className="rotate-phone mx-auto mb-5 h-16 w-10 rounded-[0.65rem] border-[3px] border-white/80" aria-hidden />
        <h2 className="font-display text-2xl font-bold">Gire o telefone</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/65">A câmera de cima enquadra o campo inteiro na horizontal. Depois você pode voltar para a vertical se quiser.</p>
        <button type="button" className="btn btn-ghost mt-5 w-full py-2 text-sm" onClick={stayPortrait}>
          Jogar na vertical
        </button>
      </div>
    </div>
  );
}
