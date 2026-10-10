import type { ArenaConfig, MatchEvent } from "@arena/sim";
import * as THREE from "three";
import type { CameraMode } from "../app/cameraPrefs";
import { getState } from "../app/store";
import { createRenderState, type RenderState, type SimulationHost } from "../game/types";
import { ArenaView } from "./ArenaView";
import { EnvironmentView } from "./EnvironmentView";
import { gameAudio } from "./Audio";
import { BallView } from "./BallView";
import { CameraRig, type CameraFocus } from "./CameraRig";
import { cameraState } from "./cameraState";
import { PlayerView } from "./PlayerView";
import { ImpactRings, ParticleSystem } from "./Vfx";

export interface GameViewCallbacks {
  onFrame?(state: RenderState, nowMs: number): void;
  onEvent?(ev: MatchEvent, state: RenderState): void;
  /** Elemento DOM da seta "bola fora da tela". Manipulado direto, sem React no frame. */
  ballIndicator?: HTMLElement | null;
}

/**
 * Dono do canvas e do loop de frames. Pede ao host o tempo decorrido,
 * recebe o estado interpolado e desenha. Nao decide regra nenhuma.
 */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly arena: ArenaConfig;
  private readonly rig: CameraRig;
  private readonly arenaView: ArenaView;
  private readonly environment: EnvironmentView;
  private readonly ballView: BallView;
  private readonly players = new Map<string, PlayerView>();
  private readonly particles = new ParticleSystem();
  private readonly rings = new ImpactRings();
  private readonly state = createRenderState();
  private readonly flash: THREE.Mesh;
  private readonly flashMat: THREE.MeshBasicMaterial;
  private raf = 0;
  private last = 0;
  private running = false;
  private readonly resizeObserver: ResizeObserver;
  private lastGoalPhase = false;
  private readonly focus: CameraFocus = { x: 0, z: 0, yaw: 0 };
  private readonly ndc = new THREE.Vector3();
  private indicatorVisible = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: SimulationHost,
    arena: ArenaConfig,
    private readonly callbacks: GameViewCallbacks = {},
  ) {
    this.arena = arena;
    const t = this.arena.theme;
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
    const L = this.arena.halfLength + this.arena.goalDepth + 2;
    const W = this.arena.halfWidth + 2;
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

    this.environment = new EnvironmentView(this.arena);
    this.scene.add(this.environment.group);
    this.arenaView = new ArenaView(this.arena);
    this.scene.add(this.arenaView.group);
    this.ballView = new BallView(t.accent);
    this.scene.add(this.ballView.group);
    this.scene.add(this.particles.mesh);
    this.scene.add(this.rings.group);

    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.flashMat);
    this.flash.renderOrder = 999;
    this.flash.frustumCulled = false;

    const rect = canvas.getBoundingClientRect();
    this.rig = new CameraRig(this.arena, Math.max(0.5, rect.width / Math.max(1, rect.height)));
    this.rig.camera.add(this.flash);
    this.flash.position.z = -1;
    this.scene.add(this.rig.camera);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.rig.fit(w / h);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const delta = Math.min(250, now - this.last);
      this.last = now;
      this.frame(delta, now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame(deltaMs: number, now: number): void {
    const dt = deltaMs / 1000;
    this.host.update(deltaMs);
    this.host.render(this.state);
    const s = this.state;

    for (const ev of this.host.drainEvents()) {
      this.handleEvent(ev);
      this.callbacks.onEvent?.(ev, s);
    }

    // Sincroniza views de jogadores com o estado.
    const seen = new Set<string>();
    const kickPresses = new Set(this.host.consumeKickPresses());
    for (const p of s.players) {
      seen.add(p.id);
      let view = this.players.get(p.id);
      if (!view) {
        const color = p.team === "left" ? this.arena.theme.left : this.arena.theme.right;
        const roster = getState().room?.players.find((r) => r.id === p.id);
        const skinId = roster?.skinId ?? (p.isLocal ? getState().loadout.skinId : undefined);
        view = new PlayerView({ ...p, skinId }, color, this.arena.theme.accent);
        this.players.set(p.id, view);
        this.scene.add(view.group);
      }
      if (kickPresses.has(p.id)) view.triggerKick();
      view.update(p, dt, p.isLocal);
    }
    for (const [id, view] of this.players) {
      if (!seen.has(id)) {
        this.scene.remove(view.group);
        view.dispose();
        this.players.delete(id);
      }
    }

    this.ballView.update(s.ball, dt);
    this.arenaView.update(dt);
    this.environment.update(dt);
    this.particles.update(dt);
    this.rings.update(dt);
    if (this.flashMat.opacity > 0) this.flashMat.opacity = Math.max(0, this.flashMat.opacity - dt * 2.5);

    // Camera: preferencias lidas a cada frame, entao sliders e tecla C valem na hora.
    const prefs = getState().camera;
    const twoLocal = this.host.localPlayerIds.length > 1;
    const onField = s.players.some((p) => p.isLocal);
    const effective: CameraMode = prefs.mode === "thirdPerson" && !twoLocal && onField ? "thirdPerson" : "arena";
    cameraState.forcedArena = prefs.mode === "thirdPerson" && twoLocal;
    const focusPlayer = s.players.find((p) => p.id === s.focusPlayerId) ?? null;
    let focus: CameraFocus | null = null;
    if (focusPlayer) {
      this.focus.x = focusPlayer.x;
      this.focus.z = focusPlayer.z;
      this.focus.yaw = this.players.get(focusPlayer.id)?.visualYaw ?? focusPlayer.yaw;
      focus = this.focus;
    }
    this.rig.update(dt, focus, s.ball, prefs, effective);
    cameraState.effectiveMode = this.rig.currentMode;
    cameraState.yaw = this.rig.viewYaw;

    this.lastGoalPhase = s.phase === "goal";

    this.callbacks.onFrame?.(s, now);
    this.renderer.render(this.scene, this.rig.camera);
    this.updateBallIndicator(s);
  }

  /** Seta na borda da tela apontando para a bola quando ela sai do enquadramento. */
  private updateBallIndicator(s: RenderState): void {
    const el = this.callbacks.ballIndicator;
    if (!el) return;
    if (this.rig.currentMode !== "thirdPerson") {
      if (this.indicatorVisible) {
        el.style.opacity = "0";
        this.indicatorVisible = false;
      }
      return;
    }
    this.ndc.set(s.ball.x, s.ball.y, s.ball.z).project(this.rig.camera);
    const behind = this.ndc.z > 1;
    let nx = this.ndc.x;
    let ny = this.ndc.y;
    if (behind) {
      nx = -nx;
      ny = -ny;
    }
    const inside = !behind && Math.abs(nx) <= 0.95 && Math.abs(ny) <= 0.9;
    if (inside) {
      if (this.indicatorVisible) {
        el.style.opacity = "0";
        this.indicatorVisible = false;
      }
      return;
    }
    // Projeta a direcao na borda do retangulo [-0.92, 0.92] x [-0.86, 0.86].
    const len = Math.hypot(nx, ny) || 1;
    let dx = nx / len;
    let dy = ny / len;
    if (behind && len < 1e-3) {
      dx = 0;
      dy = -1;
    }
    const sx = 0.92 / Math.max(Math.abs(dx), 1e-6);
    const sy = 0.86 / Math.max(Math.abs(dy), 1e-6);
    const sc = Math.min(sx, sy);
    const ex = dx * sc;
    const ey = dy * sc;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const px = ((ex + 1) / 2) * w;
    const py = ((1 - ey) / 2) * h;
    const angle = Math.atan2(-dy, dx);
    el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%) rotate(${angle.toFixed(3)}rad)`;
    if (!this.indicatorVisible) {
      el.style.opacity = "1";
      this.indicatorVisible = true;
    }
  }

  private handleEvent(ev: MatchEvent): void {
    const t = this.arena.theme;
    switch (ev.type) {
      case "kick": {
        const p = this.state.players.find((x) => x.id === ev.playerId);
        this.players.get(ev.playerId)?.triggerKick();
        const b = this.state.ball;
        this.particles.burst(b.x, b.y, b.z, Math.min(30, 8 + ev.power * 0.6), 0xffffff, 4 + ev.power * 0.15, 0.4, 0.7, 0.4);
        this.rings.spawn(b.x, b.z, p?.team === "left" ? t.left : t.right, 0.6);
        gameAudio.kick(ev.power);
        this.rig.addShake(Math.min(0.5, ev.power / 80) * (this.rig.currentMode === "thirdPerson" ? 0.5 : 1));
        break;
      }
      case "ball_bounce":
        this.particles.burst(ev.x, ev.y, ev.z, Math.min(16, Math.round(ev.speed * 0.6)), t.lines, 2 + ev.speed * 0.1, 0.35, 0.5);
        gameAudio.bounce(ev.speed);
        break;
      case "player_contact":
        if (ev.speed > 4) {
          const a = this.state.players.find((x) => x.id === ev.a);
          const b = this.state.players.find((x) => x.id === ev.b);
          if (a && b) {
            const mx = (a.x + b.x) / 2;
            const mz = (a.z + b.z) / 2;
            this.particles.burst(mx, 1, mz, Math.round(ev.speed), 0xfff2a8, ev.speed * 0.5, 0.35, 0.6);
            this.rings.spawn(mx, mz, 0xffffff, 0.5);
            gameAudio.contact();
          }
        }
        break;
      case "goal": {
        const side = ev.team === "left" ? 1 : -1;
        const color = ev.team === "left" ? t.left : t.right;
        const gx = side * this.arena.halfLength;
        this.particles.burst(gx, 1.5, 0, 160, color, 16, 1.6, 1.4, 0.9);
        this.particles.burst(gx, 1.5, 0, 90, 0xffffff, 12, 1.4, 1.0, 1.0);
        this.rings.spawn(gx, 0, color, 2.5);
        this.flashMat.color.set(color);
        this.flashMat.opacity = 0.55;
        this.rig.addShake(1.0);
        gameAudio.goal();
        break;
      }
      case "ability_used": {
        const p = this.state.players.find((x) => x.id === ev.playerId);
        if (p) {
          const color = ev.abilityId === "shield" ? 0x9fe3ff : ev.abilityId === "power_shot" ? 0xffb347 : t.accent;
          this.particles.burst(p.x, 0.8, p.z, 36, color, 7, 0.6, 0.9, 0.3);
          this.rings.spawn(p.x, p.z, color, 1.2);
        }
        gameAudio.ability();
        break;
      }
      case "ability_rejected":
        if (this.host.localPlayerIds.includes(ev.playerId)) gameAudio.deny();
        break;
      case "match_started":
      case "kickoff":
        gameAudio.whistle(false);
        break;
      case "match_ended":
        gameAudio.whistle(true);
        this.particles.burst(0, 2, 0, 200, 0xffffff, 14, 2.0, 1.2, 1.0);
        break;
      default:
        break;
    }
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    cameraState.effectiveMode = "arena";
    cameraState.forcedArena = false;
    cameraState.yaw = -Math.PI / 2;
    for (const v of this.players.values()) v.dispose();
    this.players.clear();
    this.environment.dispose();
    this.renderer.dispose();
  }
}
