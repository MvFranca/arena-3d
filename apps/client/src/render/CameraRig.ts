import type { ArenaConfig } from "@arena/sim";
import * as THREE from "three";

const PITCH = THREE.MathUtils.degToRad(56);
const FOV = 40;

/**
 * Camera elevada em tres quartos. Enquadra a arena inteira e acompanha
 * suavemente o ponto entre o jogador local e a bola, sem cortar o campo.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private distance = 40;
  private shake = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly arena: ArenaConfig, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(FOV, aspect, 0.5, 300);
    this.fit(aspect);
    this.target.set(0, 0, 0);
    this.apply();
  }

  fit(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const vfov = THREE.MathUtils.degToRad(FOV);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const L = this.arena.halfLength + this.arena.goalDepth + 1.5;
    const W = this.arena.halfWidth + 1.5;
    const byWidth = L / Math.tan(hfov / 2);
    // A profundidade do campo aparece encurtada pelo pitch; o fator 1.15 cobre a parede do fundo.
    const byDepth = (W * Math.sin(PITCH) * 2.0 + 2) / (2 * Math.tan(vfov / 2));
    this.distance = Math.max(byWidth, byDepth) * 1.02 + 1;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  update(dtSec: number, focus: { x: number; z: number } | null, ball: { x: number; z: number }): void {
    const maxX = Math.max(0, this.arena.halfLength * 0.18);
    const maxZ = Math.max(0, this.arena.halfWidth * 0.16);
    if (focus) {
      this.desired.set((focus.x + ball.x) * 0.5, 0, (focus.z + ball.z) * 0.5);
    } else {
      this.desired.set(ball.x * 0.5, 0, ball.z * 0.5);
    }
    this.desired.x = THREE.MathUtils.clamp(this.desired.x * 0.6, -maxX, maxX);
    this.desired.z = THREE.MathUtils.clamp(this.desired.z * 0.6, -maxZ, maxZ);
    const k = 1 - Math.exp(-dtSec * 3.5);
    this.target.lerp(this.desired, k);
    this.shake = Math.max(0, this.shake - dtSec * 3);
    this.apply();
  }

  private apply(): void {
    const y = this.distance * Math.sin(PITCH);
    const z = this.distance * Math.cos(PITCH);
    this.tmp.set(this.target.x, this.target.y + y, this.target.z + z);
    if (this.shake > 0) {
      const s = this.shake * 0.25;
      this.tmp.x += (Math.random() - 0.5) * s;
      this.tmp.y += (Math.random() - 0.5) * s;
    }
    this.camera.position.copy(this.tmp);
    // Mira um pouco a frente do centro: a borda proxima fica visivel sem cortar o fundo.
    this.camera.lookAt(this.target.x, 0.6, this.target.z + this.arena.halfWidth * 0.14);
  }
}
