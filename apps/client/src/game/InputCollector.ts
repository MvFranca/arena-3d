import type { PlayerInput } from "@arena/sim";
import { cameraState } from "../render/cameraState";

export interface KeyBinding {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  kick: string[];
  ability: string[];
}

export const BINDING_P1: KeyBinding = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  kick: ["Space", "KeyJ"],
  ability: ["ShiftLeft", "ShiftRight", "KeyK"],
};

/** Segundo jogador local: setas + Enter/ponto. Usado so no treino. */
export const BINDING_P2: KeyBinding = {
  up: ["KeyI"],
  down: ["KeyK"],
  left: ["KeyJ"],
  right: ["KeyL"],
  kick: ["Enter", "KeyN"],
  ability: ["KeyM"],
};

/**
 * Le teclado (e o primeiro gamepad) e devolve um PlayerInput por amostra.
 * Direcao e relativa a camera. No modo arena: direita da tela = +X, cima = -Z.
 * No modo terceira pessoa a base gira junto com o yaw da camera (ver cameraState).
 */
export class InputCollector {
  private readonly pressed = new Set<string>();
  private seq = 0;
  private enabled = true;
  readonly binding: KeyBinding;
  private readonly useGamepad: boolean;

  constructor(binding: KeyBinding, useGamepad = true) {
    this.binding = binding;
    this.useGamepad = useGamepad;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.pressed.clear();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.pressed.add(e.code);
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.pressed.delete(e.code);
  };

  private onBlur = () => this.pressed.clear();

  private any(codes: string[]): boolean {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  sample(): PlayerInput {
    const b = this.binding;
    let dirX = (this.any(b.right) ? 1 : 0) - (this.any(b.left) ? 1 : 0);
    let dirZ = (this.any(b.down) ? 1 : 0) - (this.any(b.up) ? 1 : 0);
    let kick = this.any(b.kick);
    let ability = this.any(b.ability);

    if (this.useGamepad && this.enabled && typeof navigator.getGamepads === "function") {
      const gp = navigator.getGamepads()[0];
      if (gp) {
        const ax = gp.axes[0] ?? 0;
        const az = gp.axes[1] ?? 0;
        if (Math.hypot(ax, az) > 0.2) {
          dirX = ax;
          dirZ = az;
        }
        kick = kick || !!gp.buttons[0]?.pressed;
        ability = ability || !!gp.buttons[1]?.pressed || !!gp.buttons[5]?.pressed;
      }
    }

    const len = Math.hypot(dirX, dirZ);
    if (len > 1) {
      dirX /= len;
      dirZ /= len;
    }

    // Terceira pessoa: "cima" na tela vira a frente da camera, "direita" vira o strafe.
    // Usa o yaw que a camera ja aplicou neste frame, entao a troca de modo nao atrasa.
    if (cameraState.effectiveMode === "thirdPerson" && (dirX !== 0 || dirZ !== 0)) {
      const fx = Math.cos(cameraState.yaw);
      const fz = Math.sin(cameraState.yaw);
      const screenX = dirX;
      const screenUp = -dirZ;
      // right = forward x up = (-fz, fx)
      dirX = -fz * screenX + fx * screenUp;
      dirZ = fx * screenX + fz * screenUp;
    }
    return { seq: ++this.seq, dirX, dirZ, kick, ability };
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }
}
