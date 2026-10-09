import type { ReactNode } from "react";
import { CloseIcon } from "./icons";

export function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b1020]">
      <Backdrop />
      <div className="relative z-10 h-full overflow-y-auto">
        <div className="flex min-h-full items-center justify-center px-4 py-8">
          <div className={`w-full ${wide ? "max-w-5xl" : "max-w-xl"}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#ff4fd8]/20 blur-[120px]" />
      <div className="absolute -bottom-48 -right-32 h-[36rem] w-[36rem] rounded-full bg-[#4fc3ff]/20 blur-[140px]" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "48px 48px" }}
      />
    </div>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`font-display font-bold tracking-tight ${small ? "text-2xl" : "text-6xl"}`}>
      <span className="text-white">AREN</span>
      <span className="text-[#ff4fd8]">A</span>
      {!small && <div className="mt-1 text-base font-semibold tracking-[0.3em] text-white/50">FUTEBOL ARCADE 3D</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-3xl p-6 shadow-2xl ${className}`}>{children}</div>;
}

export function ErrorBanner({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-100">
      <span>{message}</span>
      <button className="text-red-200/70 hover:text-white" onClick={onClose}>
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
