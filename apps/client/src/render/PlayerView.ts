import { PLAYER, PLAYER_FLAG_CHARGED, PLAYER_FLAG_DASH, PLAYER_FLAG_KICKING, PLAYER_FLAG_SHIELD, type Team } from "@arena/sim";
import * as THREE from "three";
import type { RenderPlayer } from "../game/types";

const bodyGeo = new THREE.CapsuleGeometry(PLAYER.radius * 0.78, PLAYER.halfHeight * 1.4, 6, 14);
const headGeo = new THREE.SphereGeometry(PLAYER.radius * 0.42, 14, 10);
const visorGeo = new THREE.BoxGeometry(0.28, 0.16, 0.5);
const ringGeo = new THREE.RingGeometry(PLAYER.radius * 0.95, PLAYER.radius * 1.15, 32);
const shieldGeo = new THREE.SphereGeometry(PLAYER.radius * 1.35, 18, 12);
const shadowGeo = new THREE.CircleGeometry(PLAYER.radius * 1.05, 24);
const footGeo = new THREE.BoxGeometry(0.42, 0.22, 0.36);

const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });

/** Personagem low poly: capsula + cabeca + visor indicando a direcao. */
export class PlayerView {
  readonly group = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly head: THREE.Mesh;
  private readonly visor: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly shield: THREE.Mesh;
  private readonly shieldMat: THREE.MeshStandardMaterial;
  private readonly foot: THREE.Mesh;
  private readonly inner = new THREE.Group();
  private readonly label: THREE.Sprite;
  private kickAnim = 0;
  private bob = 0;
  private lastYaw = 0;
  private visualX = 0;
  private visualZ = 0;
  private initialized = false;
  readonly team: Team;
  readonly id: string;

  constructor(player: RenderPlayer, teamColor: string, accent: string) {
    this.id = player.id;
    this.team = player.team;
    const color = new THREE.Color(teamColor);
    this.bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, flatShading: true });
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.castShadow = true;
    this.body.position.y = PLAYER.halfHeight + PLAYER.radius * 0.9;
    this.inner.add(this.body);

    const headMat = new THREE.MeshStandardMaterial({ color: "#f4f1ea", roughness: 0.5, flatShading: true });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.castShadow = true;
    this.head.position.y = PLAYER.halfHeight * 2 + PLAYER.radius * 1.55;
    this.inner.add(this.head);

    const visorMat = new THREE.MeshStandardMaterial({ color: "#101522", roughness: 0.2, metalness: 0.6 });
    this.visor = new THREE.Mesh(visorGeo, visorMat);
    this.visor.position.set(PLAYER.radius * 0.36, this.head.position.y, 0);
    this.inner.add(this.visor);

    this.foot = new THREE.Mesh(footGeo, new THREE.MeshStandardMaterial({ color: "#1b1f2e", roughness: 0.7 }));
    this.foot.position.set(PLAYER.radius * 0.55, 0.12, 0.2);
    this.inner.add(this.foot);

    this.ringMat = new THREE.MeshBasicMaterial({ color: player.isLocal ? accent : teamColor, transparent: true, opacity: player.isLocal ? 0.9 : 0.35, depthWrite: false });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.group.add(this.ring);

    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.011;
    this.group.add(shadow);

    this.shieldMat = new THREE.MeshStandardMaterial({ color: "#9fe3ff", emissive: "#9fe3ff", emissiveIntensity: 0.8, transparent: true, opacity: 0.0, roughness: 0.1, depthWrite: false });
    this.shield = new THREE.Mesh(shieldGeo, this.shieldMat);
    this.shield.position.y = PLAYER.halfHeight + PLAYER.radius;
    this.shield.visible = false;
    this.group.add(this.shield);

    this.label = makeLabel(player.name, teamColor);
    this.label.position.y = PLAYER.halfHeight * 2 + PLAYER.radius * 2.6;
    this.group.add(this.label);

    this.group.add(this.inner);
  }

  triggerKick(): void {
    this.kickAnim = 1;
  }

  /** Yaw ja suavizado que o corpo esta mostrando. A camera segue este, nao o cru. */
  get visualYaw(): number {
    return this.lastYaw;
  }

  update(p: RenderPlayer, dt: number, smoothLocal: boolean): void {
    if (!this.initialized) {
      this.visualX = p.x;
      this.visualZ = p.z;
      this.initialized = true;
    }
    if (smoothLocal) {
      // Esconde pequenas correcoes de reconciliacao sem atrasar o controle.
      const k = 1 - Math.exp(-dt * 30);
      this.visualX += (p.x - this.visualX) * k;
      this.visualZ += (p.z - this.visualZ) * k;
      if (Math.hypot(p.x - this.visualX, p.z - this.visualZ) > 1.5) {
        this.visualX = p.x;
        this.visualZ = p.z;
      }
    } else {
      this.visualX = p.x;
      this.visualZ = p.z;
    }
    this.group.position.set(this.visualX, 0, this.visualZ);

    // Yaw suave; o visor aponta para onde o jogador olha.
    let d = p.yaw - this.lastYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.lastYaw += d * Math.min(1, dt * 18);
    this.inner.rotation.y = -this.lastYaw;

    const moving = (p.flags & PLAYER_FLAG_DASH) !== 0 ? 2 : 1;
    this.bob += dt * 9 * moving;
    const bobY = Math.sin(this.bob) * 0.03;
    this.body.position.y = PLAYER.halfHeight + PLAYER.radius * 0.9 + bobY;
    this.head.position.y = PLAYER.halfHeight * 2 + PLAYER.radius * 1.55 + bobY * 1.4;
    this.visor.position.y = this.head.position.y;

    // Dash: alonga o corpo na direcao do movimento.
    const dashing = (p.flags & PLAYER_FLAG_DASH) !== 0;
    const stretch = dashing ? 1.18 : 1;
    this.inner.scale.set(stretch, 1 / Math.sqrt(stretch), 1 / Math.sqrt(stretch));

    // Chute: pe avanca e volta.
    if (((p.flags & PLAYER_FLAG_KICKING) !== 0) && this.kickAnim <= 0) this.kickAnim = 1;
    if (this.kickAnim > 0) {
      this.kickAnim = Math.max(0, this.kickAnim - dt * 6);
      const s = Math.sin(this.kickAnim * Math.PI);
      this.foot.position.x = PLAYER.radius * 0.55 + s * 0.55;
      this.foot.position.y = 0.12 + s * 0.25;
    } else {
      this.foot.position.x = PLAYER.radius * 0.55;
      this.foot.position.y = 0.12;
    }

    // Escudo
    const shielded = (p.flags & PLAYER_FLAG_SHIELD) !== 0;
    this.shield.visible = shielded || this.shieldMat.opacity > 0.01;
    const targetOp = shielded ? 0.35 : 0;
    this.shieldMat.opacity += (targetOp - this.shieldMat.opacity) * Math.min(1, dt * 10);
    if (shielded) this.shield.rotation.y += dt * 1.5;

    // Carga de chute: corpo pulsa em emissivo.
    const charged = (p.flags & PLAYER_FLAG_CHARGED) !== 0;
    if (charged) {
      const pulse = 0.5 + Math.sin(performance.now() * 0.015) * 0.3;
      this.bodyMat.emissive.setHex(0xffb347);
      this.bodyMat.emissiveIntensity = pulse;
    } else if (this.bodyMat.emissiveIntensity > 0) {
      this.bodyMat.emissiveIntensity = Math.max(0, this.bodyMat.emissiveIntensity - dt * 4);
    }

    this.bodyMat.opacity = p.connected ? 1 : 0.4;
    this.bodyMat.transparent = !p.connected;
    this.label.visible = true;
  }

  dispose(): void {
    this.bodyMat.dispose();
    this.ringMat.dispose();
    this.shieldMat.dispose();
    (this.label.material as THREE.SpriteMaterial).map?.dispose();
    (this.label.material as THREE.SpriteMaterial).dispose();
  }
}

function makeLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "700 34px 'Space Grotesk', 'Inter', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  const w = Math.min(240, ctx.measureText(text).width + 28);
  roundRect(ctx, 128 - w / 2, 10, w, 44, 12);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text.slice(0, 14), 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.6, 0.65, 1);
  return sprite;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
