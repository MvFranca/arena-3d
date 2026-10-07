import type { CameraMode } from "../app/cameraPrefs";

/**
 * Estado da camera compartilhado entre renderer e input, atualizado pelo
 * GameView a cada frame. O InputCollector le daqui para girar o WASD junto
 * com a camera no mesmo frame em que o modo muda.
 */
export const cameraState = {
  /** Modo realmente em uso (depois de forcar arena no 2P local). */
  effectiveMode: "arena" as CameraMode,
  /** Yaw horizontal para onde a camera aponta (radianos, convencao atan2(z, x)). */
  yaw: -Math.PI / 2,
  /** True quando as preferencias pedem terceira pessoa mas o 2P local obriga arena. */
  forcedArena: false,
};
