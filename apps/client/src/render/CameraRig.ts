import type { ArenaConfig } from "@arena/sim";
import * as THREE from "three";
import type { CameraMode, CameraPrefs } from "../app/cameraPrefs";

const ARENA_PITCH = THREE.MathUtils.degToRad(56);
const ARENA_FOV = 40;
/** Folga entre a camera e qualquer parede/teto. */
const WALL_MARGIN = 0.45;

export interface CameraFocus {
  x: number;
  z: number;
  /** Yaw visual ja suavizado do personagem (convencao atan2(z, x)). */
  yaw: number;
}

/**
 * Dois modos, trocaveis em qualquer frame:
 * - arena: perspectiva elevada que enquadra o campo inteiro (padrao competitivo);
 * - thirdPerson: atras do jogador local, seguindo o yaw dele com amortecimento.
 * Os parametros vem das preferencias; nada aqui e constante de design fixa.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Yaw horizontal efetivo da camera (para onde ela aponta). */
  viewYaw = -Math.PI / 2;
  private mode: CameraMode = "arena";
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private arenaDistance = 40;
  private shake = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private followYaw: number | null = null;
  private snap = false;
  private aspect = 16 / 9;
  private currentFov = ARENA_FOV;

  constructor(
    private readonly arena: ArenaConfig,
    aspect: number,
  ) {
    this.camera = new THREE.PerspectiveCamera(ARENA_FOV, aspect, 0.3, 300);
    this.fit(aspect);
    this.target.set(0, 0, 0);
    this.applyArena();
  }

  fit(aspect: number): void {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const vfov = THREE.MathUtils.degToRad(ARENA_FOV);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const L = this.arena.halfLength + this.arena.goalDepth + 1.5;
    const W = this.arena.halfWidth + 1.5;
    const byWidth = L / Math.tan(hfov / 2);
    const byDepth = (W * Math.sin(ARENA_PITCH) * 2.0 + 2) / (2 * Math.tan(vfov / 2));
    this.arenaDistance = Math.max(byWidth, byDepth) * 1.02 + 1;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  get currentMode(): CameraMode {
    return this.mode;
  }

  update(dtSec: number, focus: CameraFocus | null, ball: { x: number; z: number }, prefs: CameraPrefs, effectiveMode: CameraMode): void {
    this.shake = Math.max(0, this.shake - dtSec * 3);
    if (effectiveMode !== this.mode) {
      this.mode = effectiveMode;
      // Sem transicao: a troca precisa valer ja neste frame, inclusive para o input.
      // `target` muda de papel entre os modos (alvo vs posicao), entao reinicia.
      this.followYaw = null;
      this.snap = true;
    }
    if (this.mode === "thirdPerson" && focus) {
      this.setFov(prefs.fov);
      this.updateThirdPerson(dtSec, focus, prefs);
    } else {
      this.setFov(ARENA_FOV);
      this.updateArena(dtSec, focus, ball);
    }
  }

  private setFov(fov: number): void {
    if (Math.abs(this.currentFov - fov) < 0.01) return;
    this.currentFov = fov;
    this.camera.fov = fov;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------- arena

  private updateArena(dtSec: number, focus: { x: number; z: number } | null, ball: { x: number; z: number }): void {
    const maxX = Math.max(0, this.arena.halfLength * 0.18);
    const maxZ = Math.max(0, this.arena.halfWidth * 0.16);
    if (focus) this.desired.set((focus.x + ball.x) * 0.5, 0, (focus.z + ball.z) * 0.5);
    else this.desired.set(ball.x * 0.5, 0, ball.z * 0.5);
    this.desired.x = THREE.MathUtils.clamp(this.desired.x * 0.6, -maxX, maxX);
    this.desired.z = THREE.MathUtils.clamp(this.desired.z * 0.6, -maxZ, maxZ);
    const k = this.snap ? 1 : 1 - Math.exp(-dtSec * 3.5);
    this.snap = false;
    this.target.lerp(this.desired, k);
    this.applyArena();
  }

  private applyArena(): void {
    const y = this.arenaDistance * Math.sin(ARENA_PITCH);
    const z = this.arenaDistance * Math.cos(ARENA_PITCH);
    this.tmp.set(this.target.x, this.target.y + y, this.target.z + z);
    this.applyShake(0.25);
    this.camera.position.copy(this.tmp);
    this.camera.lookAt(this.target.x, 0.6, this.target.z + this.arena.halfWidth * 0.14);
    // Camera olha para -Z: tela para cima = -Z no mundo.
    this.viewYaw = -Math.PI / 2;
  }

  // ------------------------------------------------------- terceira pessoa

  private updateThirdPerson(dtSec: number, focus: CameraFocus, prefs: CameraPrefs): void {
    // Amortecimento angular: giros de 180 graus nao chicoteiam a camera.
    if (this.followYaw === null) this.followYaw = focus.yaw;
    let d = focus.yaw - this.followYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.followYaw += d * (1 - Math.exp(-dtSec * prefs.smoothing));
    const yaw = this.followYaw;
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);

    // Posicao desejada atras do jogador; encurta a distancia ate caber dentro da arena.
    let t = 1;
    for (let i = 0; i < 12; i++) {
      const dist = prefs.distance * t;
      this.tmp.set(focus.x - fx * dist, prefs.height, focus.z - fz * dist);
      if (this.insideArena(this.tmp)) break;
      t -= 0.07;
      if (t < 0.25) {
        t = 0.25;
        this.tmp.set(focus.x - fx * prefs.distance * t, prefs.height, focus.z - fz * prefs.distance * t);
        this.clampInsideArena(this.tmp);
        break;
      }
    }
    this.tmp.y = Math.min(this.tmp.y, this.arena.ceilingHeight - WALL_MARGIN);

    // Posicao suavizada: a camera "boia" atras em vez de grudar no corpo.
    const kPos = this.snap ? 1 : 1 - Math.exp(-dtSec * Math.max(prefs.smoothing * 1.6, 8));
    this.snap = false;
    this.target.lerp(this.tmp, kPos);
    this.tmp.copy(this.target);
    this.applyShake(0.12);
    this.camera.position.copy(this.tmp);

    this.look.set(focus.x + fx * prefs.lookAhead, 0.9, focus.z + fz * prefs.lookAhead);
    this.camera.lookAt(this.look);
    this.viewYaw = Math.atan2(this.look.z - this.camera.position.z, this.look.x - this.camera.position.x);
  }

  private insideArena(p: THREE.Vector3): boolean {
    const L = this.arena.halfLength - WALL_MARGIN;
    const W = this.arena.halfWidth - WALL_MARGIN;
    if (Math.abs(p.z) > W) return false;
    if (Math.abs(p.x) <= L) return true;
    // Dentro da boca do gol a camera pode entrar ate o fundo da rede.
    const inGoalMouth = Math.abs(p.z) < this.arena.goalHalfWidth - WALL_MARGIN && p.y < this.arena.goalHeight - WALL_MARGIN;
    return inGoalMouth && Math.abs(p.x) <= this.arena.halfLength + this.arena.goalDepth - WALL_MARGIN;
  }

  private clampInsideArena(p: THREE.Vector3): void {
    const W = this.arena.halfWidth - WALL_MARGIN;
    p.z = THREE.MathUtils.clamp(p.z, -W, W);
    const inGoalMouth = Math.abs(p.z) < this.arena.goalHalfWidth - WALL_MARGIN && p.y < this.arena.goalHeight - WALL_MARGIN;
    const L = (inGoalMouth ? this.arena.halfLength + this.arena.goalDepth : this.arena.halfLength) - WALL_MARGIN;
    p.x = THREE.MathUtils.clamp(p.x, -L, L);
  }

  private applyShake(scale: number): void {
    if (this.shake <= 0) return;
    const s = this.shake * scale;
    this.tmp.x += (Math.random() - 0.5) * s;
    this.tmp.y += (Math.random() - 0.5) * s;
  }
}
