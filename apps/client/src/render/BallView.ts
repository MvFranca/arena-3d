import { BALL } from "@arena/sim";
import * as THREE from "three";
import type { RenderBall } from "../game/types";

export class BallView {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly trail: THREE.Mesh;
  private readonly trailMat: THREE.MeshBasicMaterial;
  private readonly axis = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly q = new THREE.Quaternion();

  constructor(accent: string) {
    const geo = new THREE.IcosahedronGeometry(BALL.radius, 1);
    const mat = new THREE.MeshStandardMaterial({ map: makeBallTexture(accent), roughness: 0.45, metalness: 0.05, flatShading: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL.radius * 0.95, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.shadow);

    this.trailMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false });
    this.trail = new THREE.Mesh(new THREE.ConeGeometry(BALL.radius * 0.9, 2.4, 10, 1, true), this.trailMat);
    this.group.add(this.trail);
  }

  update(b: RenderBall, dt: number): void {
    this.group.position.set(b.x, 0, b.z);
    this.mesh.position.y = b.y;
    this.shadow.position.y = 0.012;
    const h = Math.max(0, b.y - BALL.radius);
    const s = Math.max(0.5, 1 - h * 0.12);
    this.shadow.scale.set(s, s, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.35 * s;

    // Rolagem visual a partir da velocidade.
    const speed = Math.hypot(b.vx, b.vz);
    if (speed > 0.05) {
      this.axis.set(b.vx, 0, b.vz).normalize();
      this.axis.cross(this.up).negate();
      const angle = (speed * dt) / BALL.radius;
      this.q.setFromAxisAngle(this.axis, angle);
      this.mesh.quaternion.premultiply(this.q);
    }

    // Rastro so em velocidade alta.
    const fast = THREE.MathUtils.clamp((speed - 14) / 16, 0, 1);
    this.trailMat.opacity += (fast * 0.35 - this.trailMat.opacity) * Math.min(1, dt * 8);
    this.trail.visible = this.trailMat.opacity > 0.02;
    if (this.trail.visible) {
      this.trail.position.set(-b.vx / Math.max(speed, 1e-3) * 1.3, b.y, -b.vz / Math.max(speed, 1e-3) * 1.3);
      this.trail.quaternion.setFromUnitVectors(this.up, this.axis.set(b.vx, 0, b.vz).normalize());
    }
  }
}

function makeBallTexture(accent: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f6f7fb";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = accent;
  for (let i = 0; i < 8; i++) {
    const x = (i % 4) * 64 + (i >= 4 ? 32 : 0);
    const y = i >= 4 ? 96 : 32;
    ctx.beginPath();
    ctx.arc(x + 32, y, 17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1a1f33";
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(i * 44 + 12, 64, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
