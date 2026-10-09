import { PLAYER, PLAYER_FLAG_CHARGED, PLAYER_FLAG_DASH, PLAYER_FLAG_KICKING, PLAYER_FLAG_SHIELD, sanitizeSkinId, type SkinId, type Team } from "@arena/sim";
import * as THREE from "three";
import type { RenderPlayer } from "../game/types";

const bodyGeo = new THREE.CapsuleGeometry(PLAYER.radius * 0.72, PLAYER.halfHeight * 1.55, 5, 12);
const headGeo = new THREE.SphereGeometry(PLAYER.radius * 0.4, 12, 9);
const visorGeo = new THREE.BoxGeometry(0.3, 0.14, 0.48);
const visorWideGeo = new THREE.BoxGeometry(0.36, 0.12, 0.52);
const ringGeo = new THREE.RingGeometry(PLAYER.radius * 0.95, PLAYER.radius * 1.18, 28);
const shieldGeo = new THREE.SphereGeometry(PLAYER.radius * 1.35, 16, 10);
const shadowGeo = new THREE.CircleGeometry(PLAYER.radius * 1.08, 20);
const footGeo = new THREE.BoxGeometry(0.34, 0.16, 0.28);
const armGeo = new THREE.CapsuleGeometry(0.09, 0.28, 3, 6);
const stripeGeo = new THREE.BoxGeometry(0.08, 0.55, 0.58);
const shoulderGeo = new THREE.SphereGeometry(0.16, 8, 6);
const trailGeo = new THREE.CapsuleGeometry(PLAYER.radius * 0.55, PLAYER.halfHeight, 3, 8);

const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

interface SkinLook {
  bodyDarken: number;
  metalness: number;
  roughness: number;
  flat: boolean;
  head: string;
  visor: string;
  visorEmissive: number;
  stripe: boolean;
  shoulders: boolean;
  wideVisor: boolean;
  neon: boolean;
  goldTrim: boolean;
  ringOpacity: number;
}

const LOOKS: Record<SkinId, SkinLook> = {
  default: { bodyDarken: 0, metalness: 0.08, roughness: 0.55, flat: true, head: "#f0ebe3", visor: "#101522", visorEmissive: 0, stripe: true, shoulders: false, wideVisor: false, neon: false, goldTrim: false, ringOpacity: 0.85 },
  striker: { bodyDarken: 0.04, metalness: 0.12, roughness: 0.45, flat: true, head: "#efe6dc", visor: "#1a0a10", visorEmissive: 0.15, stripe: true, shoulders: true, wideVisor: true, neon: false, goldTrim: false, ringOpacity: 0.75 },
  neon: { bodyDarken: 0, metalness: 0.25, roughness: 0.35, flat: true, head: "#dce8f4", visor: "#9fe3ff", visorEmissive: 0.9, stripe: true, shoulders: false, wideVisor: false, neon: true, goldTrim: false, ringOpacity: 1 },
  shadow: { bodyDarken: 0.28, metalness: 0.2, roughness: 0.7, flat: true, head: "#3a3f4c", visor: "#0a0c12", visorEmissive: 0, stripe: false, shoulders: false, wideVisor: false, neon: false, goldTrim: false, ringOpacity: 0.25 },
  gold: { bodyDarken: 0, metalness: 0.72, roughness: 0.22, flat: false, head: "#f3e6c4", visor: "#2a1c08", visorEmissive: 0.2, stripe: true, shoulders: true, wideVisor: false, neon: false, goldTrim: true, ringOpacity: 0.7 },
  retro: { bodyDarken: 0.02, metalness: 0, roughness: 1, flat: true, head: "#ffe8c8", visor: "#111111", visorEmissive: 0, stripe: true, shoulders: false, wideVisor: true, neon: false, goldTrim: false, ringOpacity: 0.55 },
};

/** Personagem low poly: torso, cabeca, bracos, pés e faixa de time. */
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
  private readonly leftFoot: THREE.Mesh;
  private readonly rightFoot: THREE.Mesh;
  private readonly leftArm: THREE.Mesh;
  private readonly rightArm: THREE.Mesh;
  private readonly stripe: THREE.Mesh;
  private readonly leftShoulder: THREE.Mesh;
  private readonly rightShoulder: THREE.Mesh;
  private readonly neonEdge: THREE.Mesh;
  private readonly trails: THREE.Mesh[] = [];
  private readonly inner = new THREE.Group();
  private readonly label: THREE.Sprite;
  private kickAnim = 0;
  /** 1 no clique do chute, decai até 0. Independente de ter acertado a bola. */
  private ringFlash = 0;
  private readonly ringRest: THREE.Color;
  private readonly ringRestOpacity: number;
  private bob = 0;
  private lastYaw = 0;
  private visualX = 0;
  private visualZ = 0;
  private initialized = false;
  readonly team: Team;
  readonly id: string;
  readonly skinId: SkinId;

  constructor(player: RenderPlayer, teamColor: string, accent: string) {
    this.id = player.id;
    this.team = player.team;
    this.skinId = sanitizeSkinId(player.skinId);
    const look = LOOKS[this.skinId];
    const color = new THREE.Color(teamColor);
    if (look.bodyDarken) color.offsetHSL(0, 0, -look.bodyDarken);
    if (look.goldTrim) color.lerp(new THREE.Color("#e6b84a"), 0.28);

    this.bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: look.roughness,
      metalness: look.metalness,
      flatShading: look.flat,
    });
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.castShadow = true;
    this.body.position.y = PLAYER.halfHeight + PLAYER.radius * 0.85;
    this.inner.add(this.body);

    const headMat = new THREE.MeshStandardMaterial({ color: look.head, roughness: 0.5, metalness: look.goldTrim ? 0.35 : 0.02, flatShading: look.flat });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.castShadow = true;
    this.head.position.y = PLAYER.halfHeight * 2 + PLAYER.radius * 1.48;
    this.inner.add(this.head);

    const visorMat = new THREE.MeshStandardMaterial({
      color: look.visor,
      roughness: 0.2,
      metalness: 0.65,
      emissive: look.visor,
      emissiveIntensity: look.visorEmissive,
    });
    this.visor = new THREE.Mesh(look.wideVisor ? visorWideGeo : visorGeo, visorMat);
    this.visor.position.set(PLAYER.radius * 0.34, this.head.position.y, 0);
    this.inner.add(this.visor);

    const trimColor = look.goldTrim ? "#e6b84a" : accent;
    const stripeMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.4, metalness: look.metalness, emissive: look.neon ? trimColor : "#000000", emissiveIntensity: look.neon ? 0.55 : 0, flatShading: look.flat });
    this.stripe = new THREE.Mesh(stripeGeo, stripeMat);
    this.stripe.position.set(PLAYER.radius * 0.55, this.body.position.y + 0.05, 0);
    this.stripe.visible = look.stripe;
    this.inner.add(this.stripe);

    const armMat = new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, -0.08), roughness: look.roughness, metalness: look.metalness, flatShading: look.flat });
    this.leftArm = new THREE.Mesh(armGeo, armMat);
    this.rightArm = new THREE.Mesh(armGeo, armMat);
    this.leftArm.position.set(0.02, this.body.position.y + 0.12, PLAYER.radius * 0.72);
    this.rightArm.position.set(0.02, this.body.position.y + 0.12, -PLAYER.radius * 0.72);
    this.leftArm.rotation.x = 0.35;
    this.rightArm.rotation.x = -0.35;
    this.inner.add(this.leftArm, this.rightArm);

    const shoulderMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.35, metalness: look.goldTrim ? 0.8 : 0.15, flatShading: look.flat });
    this.leftShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    this.rightShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    this.leftShoulder.position.set(0.05, this.body.position.y + 0.38, PLAYER.radius * 0.7);
    this.rightShoulder.position.set(0.05, this.body.position.y + 0.38, -PLAYER.radius * 0.7);
    this.leftShoulder.visible = look.shoulders;
    this.rightShoulder.visible = look.shoulders;
    this.inner.add(this.leftShoulder, this.rightShoulder);

    const footMat = new THREE.MeshStandardMaterial({ color: look.goldTrim ? "#3a2a10" : "#1b1f2e", roughness: 0.7, flatShading: look.flat });
    this.leftFoot = new THREE.Mesh(footGeo, footMat);
    this.rightFoot = new THREE.Mesh(footGeo, footMat);
    this.leftFoot.position.set(PLAYER.radius * 0.42, 0.1, 0.18);
    this.rightFoot.position.set(PLAYER.radius * 0.42, 0.1, -0.18);
    this.inner.add(this.leftFoot, this.rightFoot);

    const neonMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: look.neon ? 0.55 : 0 });
    this.neonEdge = new THREE.Mesh(new THREE.TorusGeometry(PLAYER.radius * 0.82, 0.03, 6, 16), neonMat);
    this.neonEdge.rotation.x = Math.PI / 2;
    this.neonEdge.position.y = this.body.position.y;
    this.neonEdge.visible = look.neon;
    this.inner.add(this.neonEdge);

    this.ringRestOpacity = player.isLocal ? look.ringOpacity : look.ringOpacity * 0.4;
    this.ringMat = new THREE.MeshBasicMaterial({ color: player.isLocal ? accent : teamColor, transparent: true, opacity: this.ringRestOpacity, depthWrite: false });
    this.ringRest = this.ringMat.color.clone();
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

    const trailMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(trailGeo, trailMat.clone());
      t.visible = false;
      this.group.add(t);
      this.trails.push(t);
    }

    this.label = makeLabel(player.name, teamColor);
    this.label.position.y = PLAYER.halfHeight * 2 + PLAYER.radius * 2.55;
    this.group.add(this.label);

    this.group.add(this.inner);
  }

  triggerKick(): void {
    this.kickAnim = 1;
    this.ringFlash = 1;
  }

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

    let d = p.yaw - this.lastYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.lastYaw += d * Math.min(1, dt * 18);
    this.inner.rotation.y = -this.lastYaw;

    const dashing = (p.flags & PLAYER_FLAG_DASH) !== 0;
    const moving = dashing ? 2.2 : 1;
    this.bob += dt * 10 * moving;
    const bobY = Math.sin(this.bob) * (dashing ? 0.05 : 0.035);
    const swing = Math.sin(this.bob) * (dashing ? 0.45 : 0.28);
    this.body.position.y = PLAYER.halfHeight + PLAYER.radius * 0.85 + bobY;
    this.head.position.y = PLAYER.halfHeight * 2 + PLAYER.radius * 1.48 + bobY * 1.35;
    this.visor.position.y = this.head.position.y;
    this.stripe.position.y = this.body.position.y + 0.05;
    this.neonEdge.position.y = this.body.position.y;
    this.leftArm.rotation.z = swing;
    this.rightArm.rotation.z = -swing;
    this.leftArm.position.y = this.body.position.y + 0.12;
    this.rightArm.position.y = this.body.position.y + 0.12;

    const stretch = dashing ? 1.16 : 1;
    this.inner.scale.set(stretch, 1 / Math.sqrt(stretch), 1 / Math.sqrt(stretch));

    if (((p.flags & PLAYER_FLAG_KICKING) !== 0) && this.kickAnim <= 0) {
      this.kickAnim = 1;
      this.ringFlash = 1;
    }
    if (this.kickAnim > 0) {
      this.kickAnim = Math.max(0, this.kickAnim - dt * 5.2);
      const s = Math.sin(this.kickAnim * Math.PI);
      const ease = s * s;
      this.rightFoot.position.x = PLAYER.radius * 0.42 + ease * 0.62;
      this.rightFoot.position.y = 0.1 + ease * 0.28;
    } else {
      this.rightFoot.position.x = PLAYER.radius * 0.42;
      this.rightFoot.position.y = 0.1;
    }
    if (this.ringFlash > 0) {
      this.ringFlash = Math.max(0, this.ringFlash - dt * 2.4);
      this.ringMat.color.setHex(0xffffff);
      this.ringMat.opacity = 1;
    } else {
      this.ringMat.color.copy(this.ringRest);
      this.ringMat.opacity = this.ringRestOpacity;
    }
    this.leftFoot.position.x = PLAYER.radius * 0.42;
    this.leftFoot.position.y = 0.1 + Math.max(0, -swing) * 0.04;

    if (dashing) {
      for (let i = 0; i < this.trails.length; i++) {
        const t = this.trails[i]!;
        t.visible = true;
        t.position.set(-Math.cos(this.lastYaw) * (0.35 + i * 0.28), PLAYER.halfHeight, Math.sin(this.lastYaw) * (0.35 + i * 0.28));
        (t.material as THREE.MeshBasicMaterial).opacity = 0.22 - i * 0.06;
        t.scale.setScalar(0.85 - i * 0.12);
      }
    } else {
      for (const t of this.trails) {
        const mat = t.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - dt * 4);
        if (mat.opacity <= 0.01) t.visible = false;
      }
    }

    const shielded = (p.flags & PLAYER_FLAG_SHIELD) !== 0;
    this.shield.visible = shielded || this.shieldMat.opacity > 0.01;
    const targetOp = shielded ? 0.35 : 0;
    this.shieldMat.opacity += (targetOp - this.shieldMat.opacity) * Math.min(1, dt * 10);
    if (shielded) this.shield.rotation.y += dt * 1.5;

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
    for (const t of this.trails) (t.material as THREE.MeshBasicMaterial).dispose();
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
