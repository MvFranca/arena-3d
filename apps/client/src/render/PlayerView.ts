import { PLAYER, PLAYER_FLAG_CHARGED, PLAYER_FLAG_DASH, PLAYER_FLAG_KICKING, PLAYER_FLAG_SHIELD, sanitizeDisc, sanitizeSkinId, type DiscStyle, type SkinId, type Team } from "@arena/sim";
import * as THREE from "three";
import type { RenderPlayer } from "../game/types";

/** Disco baixo: lê como o círculo do Haxball, com espessura de botão. */
const DISC_H = 0.28;
const R = PLAYER.radius;
const SEG = 48;

const sideGeo = new THREE.CylinderGeometry(R * 0.97, R, DISC_H * 0.78, SEG, 1, true);
const topGeo = new THREE.CircleGeometry(R * 0.955, SEG);
const strokeGeo = new THREE.TorusGeometry(R * 0.99, 0.038, 8, SEG);
const shieldGeo = new THREE.SphereGeometry(R * 1.18, 20, 12);
const shadowGeo = new THREE.CircleGeometry(R * 1.05, 28);
const ringGeo = new THREE.RingGeometry(R * 1.02, R * 1.2, 40);
const trailGeo = new THREE.CylinderGeometry(R * 0.7, R * 0.76, 0.06, 24);

const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false });

interface SkinLook {
  darken: number;
  metalness: number;
  roughness: number;
  flat: boolean;
  /** Quanto o centro do botão clareia. */
  highlight: number;
  rim: string;
  emissive: number;
  neon: boolean;
  gold: boolean;
  ringOpacity: number;
}

const LOOKS: Record<SkinId, SkinLook> = {
  default: { darken: 0, metalness: 0.06, roughness: 0.42, flat: false, highlight: 0.2, rim: "#12141c", emissive: 0, neon: false, gold: false, ringOpacity: 0.85 },
  striker: { darken: 0.02, metalness: 0.1, roughness: 0.36, flat: false, highlight: 0.26, rim: "#1a0a10", emissive: 0.08, neon: false, gold: false, ringOpacity: 0.8 },
  neon: { darken: 0, metalness: 0.22, roughness: 0.28, flat: false, highlight: 0.18, rim: "#9fe3ff", emissive: 0.55, neon: true, gold: false, ringOpacity: 1 },
  shadow: { darken: 0.32, metalness: 0.18, roughness: 0.62, flat: false, highlight: 0.06, rim: "#07080c", emissive: 0, neon: false, gold: false, ringOpacity: 0.22 },
  gold: { darken: 0, metalness: 0.78, roughness: 0.22, flat: false, highlight: 0.12, rim: "#e6b84a", emissive: 0.12, neon: false, gold: true, ringOpacity: 0.7 },
  retro: { darken: 0, metalness: 0, roughness: 1, flat: true, highlight: 0.08, rim: "#111111", emissive: 0, neon: false, gold: false, ringOpacity: 0.5 },
};

/** Botão circular 3D: disco do time, aro e face com o gradiente do Haxball. */
export class PlayerView {
  readonly group = new THREE.Group();
  private readonly disc: THREE.Group;
  private readonly top: THREE.Mesh;
  private readonly sideMat: THREE.MeshStandardMaterial;
  private readonly topMat: THREE.MeshStandardMaterial;
  private readonly strokeMat: THREE.MeshStandardMaterial;
  private topMap: THREE.CanvasTexture;
  private readonly restEmissive: THREE.Color;
  private restEmissiveIntensity: number;
  private readonly teamColor: string;
  private readonly accent: string;
  private readonly showLabel: boolean;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly shield: THREE.Mesh;
  private readonly shieldMat: THREE.MeshStandardMaterial;
  private readonly trails: THREE.Mesh[] = [];
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
  private sampleX = 0;
  private sampleZ = 0;
  private initialized = false;
  readonly team: Team;
  readonly id: string;
  skinId: SkinId;

  constructor(player: RenderPlayer, teamColor: string, accent: string) {
    this.id = player.id;
    this.team = player.team;
    this.skinId = sanitizeSkinId(player.skinId);
    this.teamColor = teamColor;
    this.accent = accent;
    this.showLabel = player.name.trim().length > 0;
    const painted = paintDisc(player.skinId, player.disc, teamColor, accent);

    this.restEmissive = painted.emissive;
    this.restEmissiveIntensity = painted.look.emissive;

    this.sideMat = new THREE.MeshStandardMaterial({
      color: painted.side,
      roughness: painted.look.roughness,
      metalness: painted.look.metalness,
      flatShading: painted.look.flat,
      emissive: this.restEmissive,
      emissiveIntensity: painted.look.emissive * 0.35,
      side: THREE.DoubleSide,
    });
    this.topMap = painted.map;
    this.topMat = new THREE.MeshStandardMaterial({
      map: this.topMap,
      roughness: painted.look.roughness,
      metalness: painted.look.metalness,
      flatShading: painted.look.flat,
      emissive: this.restEmissive,
      emissiveIntensity: painted.look.emissive,
    });
    this.strokeMat = new THREE.MeshStandardMaterial({
      color: painted.look.rim,
      roughness: painted.look.neon ? 0.25 : 0.45,
      metalness: painted.look.gold ? 0.7 : 0.15,
      emissive: painted.look.neon || painted.look.gold ? painted.look.rim : "#000000",
      emissiveIntensity: painted.look.neon ? 0.85 : painted.look.gold ? 0.25 : 0,
    });

    this.disc = new THREE.Group();
    const side = new THREE.Mesh(sideGeo, this.sideMat);
    side.castShadow = true;
    side.position.y = DISC_H * 0.42;
    this.top = new THREE.Mesh(topGeo, this.topMat);
    this.top.castShadow = true;
    this.top.receiveShadow = true;
    // Y antes de X: cancela o giro do disco e deixa o brilho parado no mundo.
    this.top.rotation.order = "YXZ";
    this.top.rotation.x = -Math.PI / 2;
    this.top.position.y = DISC_H * 0.8;
    const stroke = new THREE.Mesh(strokeGeo, this.strokeMat);
    stroke.rotation.x = Math.PI / 2;
    stroke.position.y = DISC_H * 0.72;
    this.disc.add(side, this.top, stroke);
    this.group.add(this.disc);

    this.ringRestOpacity = player.isLocal ? painted.look.ringOpacity : painted.look.ringOpacity * 0.4;
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
    this.shield.scale.set(1, 0.45, 1);
    this.shield.position.y = DISC_H * 0.55;
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
    this.label.position.y = DISC_H + 0.95;
    this.label.visible = this.showLabel;
    this.group.add(this.label);
  }

  /** Atualiza cor, listras, número e acabamento sem reconstruir a malha. */
  setStyle(skinId: string | undefined, disc: DiscStyle | null | undefined): void {
    const painted = paintDisc(skinId, disc, this.teamColor, this.accent);
    this.skinId = sanitizeSkinId(skinId);
    this.restEmissive.copy(painted.emissive);
    this.restEmissiveIntensity = painted.look.emissive;
    this.sideMat.color.copy(painted.side);
    this.sideMat.roughness = painted.look.roughness;
    this.sideMat.metalness = painted.look.metalness;
    this.sideMat.flatShading = painted.look.flat;
    this.topMat.roughness = painted.look.roughness;
    this.topMat.metalness = painted.look.metalness;
    this.topMat.flatShading = painted.look.flat;
    this.topMap.dispose();
    this.topMap = painted.map;
    this.topMat.map = painted.map;
    this.topMat.needsUpdate = true;
    this.strokeMat.color.set(painted.look.rim);
    this.strokeMat.roughness = painted.look.neon ? 0.25 : 0.45;
    this.strokeMat.metalness = painted.look.gold ? 0.7 : 0.15;
    this.strokeMat.emissive.set(painted.look.neon || painted.look.gold ? painted.look.rim : "#000000");
    this.strokeMat.emissiveIntensity = painted.look.neon ? 0.85 : painted.look.gold ? 0.25 : 0;
    if (this.topMat.emissiveIntensity <= this.restEmissiveIntensity + 0.05) {
      this.topMat.emissive.copy(this.restEmissive);
      this.sideMat.emissive.copy(this.restEmissive);
      this.topMat.emissiveIntensity = painted.look.emissive;
      this.sideMat.emissiveIntensity = painted.look.emissive * 0.35;
    }
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
      this.sampleX = p.x;
      this.sampleZ = p.z;
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

    const dashing = (p.flags & PLAYER_FLAG_DASH) !== 0;
    const step = Math.hypot(p.x - this.sampleX, p.z - this.sampleZ);
    this.sampleX = p.x;
    this.sampleZ = p.z;
    const moving = dashing || step > 0.004;
    this.bob += dt * (dashing ? 14 : 8);
    const bobY = moving ? Math.sin(this.bob) * (dashing ? 0.03 : 0.012) : 0;

    if (((p.flags & PLAYER_FLAG_KICKING) !== 0) && this.kickAnim <= 0) {
      this.kickAnim = 1;
      this.ringFlash = 1;
    }
    let kick = 0;
    if (this.kickAnim > 0) {
      this.kickAnim = Math.max(0, this.kickAnim - dt * 5.2);
      const s = Math.sin(this.kickAnim * Math.PI);
      kick = s * s;
    }
    if (this.ringFlash > 0) {
      this.ringFlash = Math.max(0, this.ringFlash - dt * 2.4);
      this.ringMat.color.setHex(0xffffff);
      this.ringMat.opacity = 1;
    } else {
      this.ringMat.color.copy(this.ringRest);
      this.ringMat.opacity = this.ringRestOpacity;
    }

    const stretch = dashing ? 1.16 : 1;
    const squash = 1 - kick * 0.22;
    this.disc.rotation.y = -this.lastYaw;
    this.top.rotation.y = this.lastYaw;
    this.disc.scale.set(stretch * (1 + kick * 0.08), squash, 1 / Math.sqrt(stretch));
    const lunge = kick * 0.14;
    this.disc.position.set(Math.cos(this.lastYaw) * lunge, bobY + kick * 0.04, Math.sin(this.lastYaw) * lunge);

    if (dashing) {
      for (let i = 0; i < this.trails.length; i++) {
        const t = this.trails[i]!;
        t.visible = true;
        const dist = 0.42 + i * 0.32;
        t.position.set(-Math.cos(this.lastYaw) * dist, 0.05, -Math.sin(this.lastYaw) * dist);
        (t.material as THREE.MeshBasicMaterial).opacity = 0.28 - i * 0.08;
        t.scale.setScalar(0.92 - i * 0.14);
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
      const pulse = 0.45 + Math.sin(performance.now() * 0.015) * 0.35;
      this.topMat.emissive.setHex(0xffb347);
      this.sideMat.emissive.setHex(0xffb347);
      this.topMat.emissiveIntensity = pulse;
      this.sideMat.emissiveIntensity = pulse * 0.65;
    } else {
      this.topMat.emissive.copy(this.restEmissive);
      this.sideMat.emissive.copy(this.restEmissive);
      this.topMat.emissiveIntensity += (this.restEmissiveIntensity - this.topMat.emissiveIntensity) * Math.min(1, dt * 8);
      this.sideMat.emissiveIntensity += (this.restEmissiveIntensity * 0.35 - this.sideMat.emissiveIntensity) * Math.min(1, dt * 8);
    }

    const visible = p.connected ? 1 : 0.4;
    this.topMat.opacity = visible;
    this.sideMat.opacity = visible;
    this.strokeMat.opacity = visible;
    this.topMat.transparent = !p.connected;
    this.sideMat.transparent = !p.connected;
    this.strokeMat.transparent = !p.connected;
    this.label.visible = this.showLabel;
  }

  dispose(): void {
    this.sideMat.dispose();
    this.topMat.dispose();
    this.topMap.dispose();
    this.strokeMat.dispose();
    this.ringMat.dispose();
    this.shieldMat.dispose();
    for (const t of this.trails) (t.material as THREE.MeshBasicMaterial).dispose();
    (this.label.material as THREE.SpriteMaterial).map?.dispose();
    (this.label.material as THREE.SpriteMaterial).dispose();
  }
}

function paintDisc(skinId: string | undefined, disc: DiscStyle | null | undefined, teamColor: string, accent: string): {
  look: SkinLook;
  side: THREE.Color;
  emissive: THREE.Color;
  map: THREE.CanvasTexture;
} {
  const look = LOOKS[sanitizeSkinId(skinId)];
  const style = disc ? sanitizeDisc(disc) : null;
  const color = new THREE.Color(style?.color ?? teamColor);
  if (look.darken) color.offsetHSL(0, 0, -look.darken);
  return {
    look,
    side: color.clone().offsetHSL(0, 0.04, -0.12),
    emissive: new THREE.Color(look.neon ? accent : look.gold ? "#e6b84a" : color),
    map: makeButtonFace(color, accent, look, style),
  };
}

function makeButtonFace(color: THREE.Color, accent: string, look: SkinLook, style: DiscStyle | null): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const rad = size / 2 - 1;

  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.clip();

  const mid = color.clone();
  const light = color.clone().offsetHSL(0, -0.06, look.highlight);
  const dark = color.clone().offsetHSL(0, 0.06, -0.2);
  if (look.flat) {
    ctx.fillStyle = `#${mid.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = `#${dark.getHexString()}`;
    ctx.beginPath();
    ctx.arc(cx, cy + rad * 0.15, rad * 0.92, 0.15, Math.PI - 0.15);
    ctx.lineTo(cx, cy);
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(cx, cy - rad * 0.08, rad * 0.08, cx, cy, rad);
    g.addColorStop(0, `#${light.getHexString()}`);
    g.addColorStop(0.62, `#${mid.getHexString()}`);
    g.addColorStop(1, `#${dark.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.beginPath();
  ctx.arc(cx, cy, rad * 0.78, 0, Math.PI * 2);
  ctx.strokeStyle = look.neon ? accent : "rgba(0,0,0,0.28)";
  ctx.lineWidth = look.neon ? 7 : 5;
  ctx.stroke();

  if (style && style.stripe !== "none") {
    ctx.fillStyle = style.stripeColor;
    ctx.strokeStyle = style.stripeColor;
    if (style.stripe === "band") {
      ctx.fillRect(0, cy - rad * 0.16, size, rad * 0.32);
    } else if (style.stripe === "double") {
      ctx.fillRect(0, cy - rad * 0.46, size, rad * 0.14);
      ctx.fillRect(0, cy + rad * 0.32, size, rad * 0.14);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 0.58, 0, Math.PI * 2);
      ctx.lineWidth = rad * 0.14;
      ctx.stroke();
    }
  }

  ctx.beginPath();
  ctx.arc(cx, cy - rad * 0.22, rad * 0.42, Math.PI * 1.05, Math.PI * 1.95);
  ctx.strokeStyle = `rgba(255,255,255,${look.gold ? 0.28 : look.highlight > 0.15 ? 0.38 : 0.16})`;
  ctx.lineWidth = 10;
  ctx.stroke();

  if (style?.number !== null && style?.number !== undefined) {
    ctx.fillStyle = style.numberColor;
    ctx.font = `800 ${Math.round(rad * (style.number > 9 ? 0.62 : 0.78))}px 'Space Grotesk', 'Inter', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(style.number), cx, cy + rad * 0.04);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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
