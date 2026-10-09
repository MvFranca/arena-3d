import type { ReactNode } from "react";

function Svg({ size = 18, className, children }: { size?: number; className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function CameraIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </Svg>
  );
}

export function ZapIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Svg>
  );
}

export function BurstIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.2 6.2l2.1 2.1M15.7 15.7l2.1 2.1M17.8 6.2l-2.1 2.1M8.3 15.7l-2.1 2.1" />
    </Svg>
  );
}

export function ShieldIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M12 3 5 6v5c0 5 3.2 8.4 7 9.5 3.8-1.1 7-4.5 7-9.5V6l-7-3z" />
    </Svg>
  );
}

export function SparkIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" />
    </Svg>
  );
}

export function ArrowIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function CloseIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

/** Bola em movimento: o risco atrás é o chute. Feito para o botão redondo do celular. */
export function KickIcon({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <path d="M1.6 10.5h5.4M1 16h6.6M2.2 21.5h4.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="19.2" cy="16" r="9.2" fill="currentColor" />
      <path d="M19.2 9.6 22.8 12.2 21.5 16.6 16.9 16.6 15.6 12.2 Z" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function AbilityIcon({ id, size = 18, className }: { id: string; size?: number; className?: string }) {
  if (id === "dash") return <ZapIcon size={size} className={className} />;
  if (id === "power_shot") return <BurstIcon size={size} className={className} />;
  if (id === "shield") return <ShieldIcon size={size} className={className} />;
  return <SparkIcon size={size} className={className} />;
}
