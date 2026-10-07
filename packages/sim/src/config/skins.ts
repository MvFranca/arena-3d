export type SkinId = "default" | "striker" | "neon" | "shadow" | "gold" | "retro";

export interface SkinDef {
  id: SkinId;
  name: string;
  description: string;
  /** Swatch no picker do perfil. */
  swatch: string;
}

export const SKIN_IDS: readonly SkinId[] = ["default", "striker", "neon", "shadow", "gold", "retro"];

export const SKINS: Record<SkinId, SkinDef> = {
  default: { id: "default", name: "Padrão", description: "Kit clássico da quadra.", swatch: "#e8e4dc" },
  striker: { id: "striker", name: "Finalizador", description: "Ombros marcados e visor agressivo.", swatch: "#ff5f6d" },
  neon: { id: "neon", name: "Neon", description: "Bordas luminosas.", swatch: "#4fc3ff" },
  shadow: { id: "shadow", name: "Sombra", description: "Escuro, anel discreto.", swatch: "#2a2e3a" },
  gold: { id: "gold", name: "Ouro", description: "Metal e accent dourado.", swatch: "#e6b84a" },
  retro: { id: "retro", name: "Retrô", description: "Blocos e cores chapadas.", swatch: "#f4a261" },
};

export const DEFAULT_SKIN_ID: SkinId = "default";

export function isSkinId(id: string | null | undefined): id is SkinId {
  return typeof id === "string" && id in SKINS;
}

/** Skin desconhecida vira default. Nunca confia no cliente. */
export function sanitizeSkinId(input: string | null | undefined): SkinId {
  return isSkinId(input) ? input : DEFAULT_SKIN_ID;
}

export function listSkins(): SkinDef[] {
  return SKIN_IDS.map((id) => SKINS[id]);
}
