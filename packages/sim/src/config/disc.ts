/** Listras pintadas na face do botão. */
export const DISC_STRIPES = ["none", "band", "double", "ring"] as const;
export type DiscStripe = (typeof DISC_STRIPES)[number];

export interface DiscStyle {
  /** Cor da face. */
  color: string;
  stripe: DiscStripe;
  stripeColor: string;
  /** null esconde o número. 0..99, como no Haxball. */
  number: number | null;
  numberColor: string;
}

export const DEFAULT_DISC: DiscStyle = {
  color: "#ff5f6d",
  stripe: "none",
  stripeColor: "#f4f7fb",
  number: null,
  numberColor: "#141820",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function sanitizeHexColor(input: unknown, fallback: string): string {
  return typeof input === "string" && HEX.test(input) ? input.toLowerCase() : fallback;
}

export function isDiscStripe(value: unknown): value is DiscStripe {
  return typeof value === "string" && (DISC_STRIPES as readonly string[]).includes(value);
}

/** Visual do botão vindo do cliente. Cor inválida cai no padrão; número fora de 0..99 some. */
export function sanitizeDisc(input: Partial<DiscStyle> | null | undefined): DiscStyle {
  let number: number | null = null;
  if (input?.number !== null && input?.number !== undefined) {
    const n = Number(input.number);
    if (Number.isInteger(n) && n >= 0 && n <= 99) number = n;
  }
  return {
    color: sanitizeHexColor(input?.color, DEFAULT_DISC.color),
    stripe: isDiscStripe(input?.stripe) ? input.stripe : "none",
    stripeColor: sanitizeHexColor(input?.stripeColor, DEFAULT_DISC.stripeColor),
    number,
    numberColor: sanitizeHexColor(input?.numberColor, DEFAULT_DISC.numberColor),
  };
}
