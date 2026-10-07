import { BALL, getArena, PLAYER_FLAG_CHARGED, PLAYER_FLAG_DASH, PLAYER_FLAG_KICKING, PLAYER_FLAG_SHIELD, type AbilityId } from "@arena/sim";
import * as THREE from "three";
import type { RenderBall, RenderPlayer } from "../game/types";
import { ArenaView } from "./ArenaView";
import { BallView } from "./BallView";
import { PlayerView } from "./PlayerView";

type Phase = "walk" | "idle" | "approach" | "kick" | "watch" | "ability";

const WALK_R = 3.2;
const BALL_REST = { x: 1.35, z: 0.25 };
const GRAVITY = -22;

/**
 * Cena do menu: a quadra real como fundo e um jogador em aquecimento
 * scriptado (sem fisica, sem input, sem GameView).
 */
export class HubScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly arenaView: ArenaView;
  private readonly ballView: BallView;
  private playerView: PlayerView;
  private readonly dummy: RenderPlayer;
  private readonly ball: RenderBall = { x: BALL_REST.x, y: BALL.radius, z: BALL_REST.z, vx: 0, vy: 0, vz: 0 };
  private readonly look = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private last = 0;
  private running = false;
  private time = 0;
  private phase: Phase = "walk";
  private phaseT = 0;
  private walkAngle = 0;
  private kickFlip = 1;
  private approachFrom = { x: WALK_R, z: 0 };
  private abilityId: AbilityId | null;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, name: string, abilityId: AbilityId | null) {
    this.canvas = canvas;
    this.abilityId = abilityId;
    const arena = getArena("classic");
    const t = arena.theme;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(t.sky);
    this.scene.fog = new THREE.Fog(t.fog, 70, 140);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x1a1030, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-18, 36, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const L = arena.halfLength + arena.goalDepth + 2;
    const W = arena.halfWidth + 2;
    sun.shadow.camera.left = -L;
    sun.shadow.camera.right = L;
    sun.shadow.camera.top = W + 6;
    sun.shadow.camera.bottom = -W - 6;
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    const rim = new THREE.PointLight(t.accent, 40, 60, 1.6);
    rim.position.set(0, 10, -W - 6);
    this.scene.add(rim);

    this.arenaView = new ArenaView(arena);
    this.scene.add(this.arenaView.group);
    this.ballView = new BallView(t.accent);
    this.scene.add(this.ballView.group);

    this.dummy = {
      id: "hub",
      slot: 0,
      team: "left",
      name: name.trim() || "Você",
      x: WALK_R,
      z: 0,
      yaw: Math.PI / 2,
      flags: 0,
      cooldownTicks: 0,
      abilityId,
      isLocal: true,
      connected: true,
    };
    this.playerView = new PlayerView(this.dummy, t.left, t.accent);
    this.scene.add(this.playerView.group);

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.4, 220);
    this.scene.add(this.camera);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  setIdentity(name: string, abilityId: AbilityId | null): void {
    this.abilityId = abilityId;
    this.dummy.abilityId = abilityId;
    const next = name.trim() || "Você";
    if (next === this.dummy.name) return;
    this.dummy.name = next;
    this.scene.remove(this.playerView.group);
    this.playerView.dispose();
    const theme = getArena("classic").theme;
    this.playerView = new PlayerView(this.dummy, theme.left, theme.accent);
    this.scene.add(this.playerView.group);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.playerView.dispose();
    this.renderer.dispose();
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(dt: number): void {
    this.time += dt;
    this.phaseT += dt;
    this.stepWarmup(dt);
    this.dummy.abilityId = this.abilityId;
    this.playerView.update(this.dummy, dt, false);
    this.ballView.update(this.ball, dt);
    this.arenaView.update(dt);
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  }

  private stepWarmup(dt: number): void {
    switch (this.phase) {
      case "walk": {
        this.dummy.flags = 0;
        this.walkAngle += dt * 1.15;
        this.dummy.x = Math.cos(this.walkAngle) * WALK_R;
        this.dummy.z = Math.sin(this.walkAngle) * WALK_R;
        this.dummy.yaw = this.walkAngle + Math.PI / 2;
        this.nudgeBallHome(dt);
        if (this.phaseT > 3.6) this.goto("idle");
        break;
      }
      case "idle": {
        this.dummy.flags = 0;
        if (this.phaseT > 0.85) {
          this.approachFrom = { x: this.dummy.x, z: this.dummy.z };
          this.goto("approach");
        }
        break;
      }
      case "approach": {
        const target = this.kickStand();
        const k = Math.min(1, this.phaseT / 0.75);
        const e = 1 - (1 - k) * (1 - k);
        this.dummy.x = this.approachFrom.x + (target.x - this.approachFrom.x) * e;
        this.dummy.z = this.approachFrom.z + (target.z - this.approachFrom.z) * e;
        this.dummy.yaw = Math.atan2(this.ball.z - this.dummy.z, this.ball.x - this.dummy.x);
        this.dummy.flags = 0;
        if (k >= 1) this.goto("kick");
        break;
      }
      case "kick": {
        if (this.phaseT < 0.02) {
          this.playerView.triggerKick();
          const dirX = this.kickFlip;
          this.kickFlip *= -1;
          this.ball.vx = dirX * 9.5;
          this.ball.vz = (Math.random() - 0.5) * 3.2;
          this.ball.vy = 6.4;
        }
        this.dummy.flags = PLAYER_FLAG_KICKING;
        this.dummy.yaw = Math.atan2(this.ball.vz || 0.01, this.ball.vx);
        this.integrateBall(dt);
        if (this.phaseT > 0.28) this.goto("watch");
        break;
      }
      case "watch": {
        this.dummy.flags = 0;
        this.integrateBall(dt);
        this.dummy.yaw = Math.atan2(this.ball.z - this.dummy.z, this.ball.x - this.dummy.x);
        if (this.phaseT > 2.1) this.goto(this.abilityId ? "ability" : "walk");
        break;
      }
      case "ability": {
        this.dummy.flags = abilityFlag(this.abilityId);
        if (this.abilityId === "dash" && this.phaseT < 0.55) {
          const yaw = this.dummy.yaw;
          this.dummy.x += Math.cos(yaw) * 7 * dt;
          this.dummy.z += Math.sin(yaw) * 7 * dt;
        }
        if (this.phaseT > 1.35) this.goto("walk");
        break;
      }
    }
  }

  private goto(next: Phase): void {
    this.phase = next;
    this.phaseT = 0;
  }

  private kickStand(): { x: number; z: number } {
    const dx = this.ball.x - this.dummy.x;
    const dz = this.ball.z - this.dummy.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: this.ball.x - (dx / len) * 1.45, z: this.ball.z - (dz / len) * 1.45 };
  }

  private integrateBall(dt: number): void {
    this.ball.x += this.ball.vx * dt;
    this.ball.z += this.ball.vz * dt;
    this.ball.y += this.ball.vy * dt;
    this.ball.vy += GRAVITY * dt;
    if (this.ball.y < BALL.radius) {
      this.ball.y = BALL.radius;
      this.ball.vy = Math.abs(this.ball.vy) * 0.55;
      this.ball.vx *= 0.78;
      this.ball.vz *= 0.78;
      if (this.ball.vy < 1.4) this.ball.vy = 0;
    }
    if (this.ball.y <= BALL.radius + 1e-3) {
      this.ball.vx *= 1 - Math.min(1, dt * 1.8);
      this.ball.vz *= 1 - Math.min(1, dt * 1.8);
    }
    // Nao deixa a bola sair da quadra no menu.
    this.ball.x = THREE.MathUtils.clamp(this.ball.x, -16, 16);
    this.ball.z = THREE.MathUtils.clamp(this.ball.z, -9, 9);
  }

  private nudgeBallHome(dt: number): void {
    const k = 1 - Math.exp(-dt * 1.6);
    this.ball.x += (BALL_REST.x - this.ball.x) * k;
    this.ball.z += (BALL_REST.z - this.ball.z) * k;
    this.ball.y += (BALL.radius - this.ball.y) * k;
    this.ball.vx *= 1 - k;
    this.ball.vz *= 1 - k;
    this.ball.vy = 0;
  }

  private updateCamera(): void {
    const t = this.time;
    this.look.set(this.dummy.x * 0.28 + this.ball.x * 0.22, 0.7, this.dummy.z * 0.28 + this.ball.z * 0.22);
    const yaw = 1.18 + Math.sin(t * 0.16) * 0.14;
    const dist = 19.5 + Math.sin(t * 0.11) * 1.1;
    this.camera.position.set(this.look.x + Math.cos(yaw) * dist, 8.4 + Math.sin(t * 0.13) * 0.45, this.look.z + Math.sin(yaw) * dist);
    this.camera.lookAt(this.look);
  }
}

function abilityFlag(id: AbilityId | null): number {
  if (id === "dash") return PLAYER_FLAG_DASH;
  if (id === "shield") return PLAYER_FLAG_SHIELD;
  if (id === "power_shot") return PLAYER_FLAG_CHARGED;
  return 0;
}
