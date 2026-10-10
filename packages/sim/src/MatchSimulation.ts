import { getAbility } from "./abilities";
import type { AbilityContext } from "./abilities/types";
import { getArena, spawnPosition, type ArenaConfig } from "./config/arenas";
import { resolveStats } from "./config/attributes";
import { BALL, KICK, PLAYER_CENTER_Y } from "./config/tuning";
import { SimPlayer } from "./internal/SimPlayer";
import { RAPIER, type RapierWorld } from "./physics/rapier";
import { clampSpeed3, createArenaWorld, createBallBody, createPlayerBody, type BallBody } from "./physics/world";
import { secondsToTicks } from "./rules/clock";
import { detectGoal } from "./rules/goal";
import { applyBallControl, tryKick } from "./rules/kick";
import { applyMovement, freezePlayer, postStepMovement } from "./rules/movement";
import {
  PLAYER_FLAG_CHARGED,
  PLAYER_FLAG_CONNECTED,
  PLAYER_FLAG_DASH,
  PLAYER_FLAG_KICKING,
  PLAYER_FLAG_SHIELD,
  type MatchConfig,
  type MatchEvent,
  type MatchPhase,
  type MatchState,
  type PlayerInput,
  type PlayerSlotConfig,
  type PlayerState,
  type Ruleset,
  type Team,
} from "./types";

/**
 * Autoridade das regras. Recebe inputs por tick e devolve estado e eventos.
 * Nao sabe se roda no servidor, no cliente (previsao) ou em um teste.
 */
export class MatchSimulation {
  readonly ruleset: Ruleset;
  readonly arena: ArenaConfig;

  tick = 0;
  phase: MatchPhase = "lobby";
  phaseTicksRemaining = 0;
  clockTicksRemaining: number;
  paused = false;
  scoreLeft = 0;
  scoreRight = 0;

  private readonly world: RapierWorld;
  private readonly ball: BallBody;
  private readonly eventQueue: RAPIER.EventQueue;
  private readonly players = new Map<string, SimPlayer>();
  private readonly colliderOwners = new Map<number, SimPlayer | "ball">();
  private readonly events: MatchEvent[] = [];
  private started = false;
  private prevBallVel = { x: 0, y: 0, z: 0 };

  constructor(config: MatchConfig) {
    this.ruleset = config.ruleset;
    this.arena = config.arena ?? getArena(config.ruleset.arenaId);
    this.clockTicksRemaining = secondsToTicks(config.ruleset.durationSeconds);
    this.world = createArenaWorld(this.arena);
    this.eventQueue = new RAPIER.EventQueue(true);
    this.ball = createBallBody(this.world);
    this.ball.collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.colliderOwners.set(this.ball.collider.handle, "ball");
    for (const p of config.players) this.addPlayer(p);
    if (config.autoStart) this.start();
  }

  // ---------------------------------------------------------------- jogadores

  get playerCount(): number {
    return this.players.size;
  }

  getPlayerIds(): string[] {
    return [...this.players.keys()];
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  getPlayerTeam(id: string): Team | undefined {
    return this.players.get(id)?.team;
  }

  addPlayer(cfg: PlayerSlotConfig): void {
    if (this.players.has(cfg.id)) throw new Error(`Jogador duplicado: ${cfg.id}`);
    if (this.players.size >= this.ruleset.maxPlayers) throw new Error("Partida cheia");
    const stats = resolveStats(cfg.loadout.attributes);
    const idx = this.teamIndex(cfg.team, cfg.id);
    const spawn = spawnPosition(this.arena, cfg.team, idx, idx + 1);
    const { body, collider } = createPlayerBody(this.world, stats, spawn.x, spawn.z);
    collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const player = new SimPlayer({ ...cfg, stats, body, collider });
    this.players.set(cfg.id, player);
    this.colliderOwners.set(collider.handle, player);
  }

  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.colliderOwners.delete(p.collider.handle);
    this.world.removeRigidBody(p.body);
    this.players.delete(id);
  }

  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (p) p.connected = connected;
  }

  setInput(id: string, input: PlayerInput): void {
    const p = this.players.get(id);
    if (!p) return;
    p.input = input;
    if (input.seq > p.lastSeq) p.lastSeq = input.seq;
  }

  /** Lobby -> countdown. Reposiciona todo mundo. */
  start(): void {
    if (this.phase !== "lobby") return;
    this.paused = false;
    this.resetPositions();
    this.enterPhase("countdown", secondsToTicks(this.ruleset.countdownSeconds));
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) return;
    for (const p of this.players.values()) freezePlayer(p);
    this.ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  /**
   * Tempo em segundos (0 = sem limite, ate 30 min) e gols (0 = sem limite).
   * No lobby o relogio vira a duracao nova. No meio da partida, o restante
   * acompanha o que ja passou.
   */
  setLimits(durationSeconds: number, scoreLimit: number): void {
    const prev = this.ruleset.durationSeconds;
    this.ruleset.durationSeconds = durationSeconds;
    this.ruleset.scoreLimit = scoreLimit;
    if (!this.started || this.phase === "lobby") {
      this.clockTicksRemaining = secondsToTicks(durationSeconds);
      return;
    }
    if (durationSeconds <= 0) return;
    if (prev <= 0) this.clockTicksRemaining = secondsToTicks(durationSeconds);
    else {
      const elapsed = Math.max(0, secondsToTicks(prev) - this.clockTicksRemaining);
      this.clockTicksRemaining = Math.max(0, secondsToTicks(durationSeconds) - elapsed);
    }
  }

  captureProgress(): {
    phase: MatchPhase;
    phaseTicksRemaining: number;
    clockTicksRemaining: number;
    scoreLeft: number;
    scoreRight: number;
    paused: boolean;
    started: boolean;
  } {
    return {
      phase: this.phase,
      phaseTicksRemaining: this.phaseTicksRemaining,
      clockTicksRemaining: this.clockTicksRemaining,
      scoreLeft: this.scoreLeft,
      scoreRight: this.scoreRight,
      paused: this.paused,
      started: this.started,
    };
  }

  restoreProgress(p: ReturnType<MatchSimulation["captureProgress"]>): void {
    this.phase = p.phase;
    this.phaseTicksRemaining = p.phaseTicksRemaining;
    this.clockTicksRemaining = p.clockTicksRemaining;
    this.scoreLeft = p.scoreLeft;
    this.scoreRight = p.scoreRight;
    this.paused = p.paused;
    this.started = p.started;
  }

  // ---------------------------------------------------------------- loop

  /** Avanca um tick fixo. Os eventos devolvidos sao validos ate o proximo step. */
  step(): MatchEvent[] {
    this.events.length = 0;
    if (!this.paused) this.advancePhase();

    const frozen = this.paused || this.phase === "countdown" || this.phase === "finished";
    const ballBody = this.ball.body;
    const pbv = ballBody.linvel();
    this.prevBallVel.x = pbv.x;
    this.prevBallVel.y = pbv.y;
    this.prevBallVel.z = pbv.z;

    for (const p of this.players.values()) {
      p.kickedThisTick = false;
      if (frozen) {
        freezePlayer(p);
        p.prevKick = p.input.kick;
        p.prevAbility = p.input.ability;
        continue;
      }
      this.tickTimers(p);
      this.handleAbility(p);
      applyMovement(p);
      if (p.input.kick && !p.prevKick) p.kickBufferTicks = KICK.bufferTicks;
      p.prevKick = p.input.kick;
      p.prevAbility = p.input.ability;
      const kick = tryKick(p, ballBody, this.tick);
      if (kick.kicked) this.events.push({ type: "kick", tick: this.tick, playerId: p.id, power: kick.power });
      else applyBallControl(p, ballBody, this.tick);
    }

    if (frozen) ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);

    this.world.step(this.eventQueue);

    for (const p of this.players.values()) postStepMovement(p);
    clampSpeed3(ballBody, BALL.maxSpeed);
    this.drainCollisionEvents();

    if (this.phase === "playing") {
      const t = ballBody.translation();
      const scoring = detectGoal(this.arena, t.x, t.y, t.z);
      if (scoring) this.onGoal(scoring);
    }

    this.tick++;
    return this.events;
  }

  private advancePhase(): void {
    switch (this.phase) {
      case "countdown":
        if (--this.phaseTicksRemaining <= 0) {
          this.phaseTicksRemaining = 0;
          this.phase = "playing";
          if (!this.started) {
            this.started = true;
            this.events.push({ type: "match_started", tick: this.tick });
          } else {
            this.events.push({ type: "kickoff", tick: this.tick });
          }
        }
        break;
      case "playing":
        if (this.scoreLimitReached()) {
          this.finish();
          break;
        }
        if (this.ruleset.durationSeconds <= 0) break;
        if (--this.clockTicksRemaining <= 0) {
          this.clockTicksRemaining = 0;
          this.finish();
        }
        break;
      case "goal":
        if (--this.phaseTicksRemaining <= 0) {
          const timeUp = this.ruleset.durationSeconds > 0 && this.clockTicksRemaining <= 0;
          if (timeUp || this.scoreLimitReached()) {
            this.finish();
          } else {
            this.resetPositions();
            this.enterPhase("countdown", secondsToTicks(this.ruleset.kickoffSeconds));
          }
        }
        break;
      default:
        break;
    }
  }

  private enterPhase(phase: MatchPhase, ticks: number): void {
    this.phase = phase;
    this.phaseTicksRemaining = ticks;
  }

  private finish(): void {
    this.phase = "finished";
    this.phaseTicksRemaining = 0;
    const winner: Team | "draw" =
      this.scoreLeft === this.scoreRight ? "draw" : this.scoreLeft > this.scoreRight ? "left" : "right";
    this.events.push({ type: "match_ended", tick: this.tick, scoreLeft: this.scoreLeft, scoreRight: this.scoreRight, winner });
  }

  private scoreLimitReached(): boolean {
    const lim = this.ruleset.scoreLimit;
    return lim > 0 && (this.scoreLeft >= lim || this.scoreRight >= lim);
  }

  private onGoal(team: Team): void {
    if (team === "left") this.scoreLeft++;
    else this.scoreRight++;
    let scorer: SimPlayer | null = null;
    for (const p of this.players.values()) {
      if (p.lastBallTouchTick >= 0 && (!scorer || p.lastBallTouchTick > scorer.lastBallTouchTick)) scorer = p;
    }
    this.events.push({
      type: "goal",
      tick: this.tick,
      team,
      scorerId: scorer?.id ?? null,
      ownGoal: scorer ? scorer.team !== team : false,
    });
    this.enterPhase("goal", secondsToTicks(this.ruleset.goalPauseSeconds));
  }

  private tickTimers(p: SimPlayer): void {
    if (p.cooldownTicks > 0) p.cooldownTicks--;
    if (p.kickBufferTicks > 0) p.kickBufferTicks--;
    if (p.kickRefractoryTicks > 0) p.kickRefractoryTicks--;
    if (p.kickChargeTicks > 0 && --p.kickChargeTicks === 0) p.kickChargeMultiplier = 1;
    if (p.shieldTicks > 0) p.shieldTicks--;
    if (p.activeTicks > 0 && p.abilityId) {
      const def = getAbility(p.abilityId);
      const ctx = this.abilityContext(p);
      def.onTick?.(ctx);
      if (--p.activeTicks === 0) def.onEnd?.(ctx);
    }
  }

  private handleAbility(p: SimPlayer): void {
    const pressed = p.input.ability && !p.prevAbility;
    if (!pressed) return;
    if (!p.abilityId) {
      this.events.push({ type: "ability_rejected", tick: this.tick, playerId: p.id, reason: "no_ability" });
      return;
    }
    const def = getAbility(p.abilityId);
    const ctx = this.abilityContext(p);
    if (p.cooldownTicks > 0) {
      ctx.reject("cooldown");
      return;
    }
    const reason = def.canActivate(ctx);
    if (reason) {
      ctx.reject(reason);
      return;
    }
    def.onActivate(ctx);
    p.cooldownTicks = Math.round(def.cooldownTicks * p.stats.cooldownMultiplier);
  }

  private abilityContext(p: SimPlayer): AbilityContext {
    return {
      tick: this.tick,
      player: p,
      input: p.input,
      emitUsed: () => {
        if (p.abilityId) this.events.push({ type: "ability_used", tick: this.tick, playerId: p.id, abilityId: p.abilityId });
      },
      reject: (reason) => this.events.push({ type: "ability_rejected", tick: this.tick, playerId: p.id, reason }),
    };
  }

  private drainCollisionEvents(): void {
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.colliderOwners.get(h1);
      const b = this.colliderOwners.get(h2);
      if (a instanceof SimPlayer && b instanceof SimPlayer) {
        const va = a.body.linvel();
        const vb = b.body.linvel();
        const rel = Math.hypot(va.x - vb.x, va.z - vb.z);
        this.events.push({ type: "player_contact", tick: this.tick, a: a.id, b: b.id, speed: rel });
        return;
      }
      if (a === "ball" || b === "ball") {
        const other = a === "ball" ? b : a;
        if (other instanceof SimPlayer) other.lastBallTouchTick = this.tick;
        const v = this.ball.body.linvel();
        const dv = Math.hypot(v.x - this.prevBallVel.x, v.y - this.prevBallVel.y, v.z - this.prevBallVel.z);
        if (dv >= BALL.bounceEventSpeed) {
          const t = this.ball.body.translation();
          this.events.push({ type: "ball_bounce", tick: this.tick, x: t.x, y: t.y, z: t.z, speed: dv });
        }
      }
    });
  }

  // ---------------------------------------------------------------- posicoes

  private teamIndex(team: Team, excludeId: string): number {
    let i = 0;
    for (const p of this.players.values()) if (p.team === team && p.id !== excludeId) i++;
    return i;
  }

  resetPositions(): void {
    const totals: Record<Team, number> = { left: 0, right: 0 };
    for (const p of this.players.values()) totals[p.team]++;
    const counts: Record<Team, number> = { left: 0, right: 0 };
    for (const p of this.players.values()) {
      const idx = counts[p.team]++;
      const s = spawnPosition(this.arena, p.team, idx, Math.max(1, totals[p.team]));
      p.body.setTranslation({ x: s.x, y: PLAYER_CENTER_Y, z: s.z }, true);
      p.resetTransient();
      p.yaw = p.team === "left" ? 0 : Math.PI;
      p.lastBallTouchTick = -1;
    }
    const b = this.ball.body;
    b.setTranslation({ x: 0, y: BALL.radius, z: 0 }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  // ---------------------------------------------------------------- estado

  /** Escreve o estado atual em um objeto reutilizavel (sem alocar quando possivel). */
  readState(out: MatchState): MatchState {
    out.tick = this.tick;
    out.phase = this.phase;
    out.phaseTicksRemaining = this.phaseTicksRemaining;
    out.clockTicksRemaining = this.clockTicksRemaining;
    out.paused = this.paused;
    out.scoreLeft = this.scoreLeft;
    out.scoreRight = this.scoreRight;
    const bt = this.ball.body.translation();
    const bv = this.ball.body.linvel();
    out.ball.x = bt.x;
    out.ball.y = bt.y;
    out.ball.z = bt.z;
    out.ball.vx = bv.x;
    out.ball.vy = bv.y;
    out.ball.vz = bv.z;

    let i = 0;
    for (const p of this.players.values()) {
      let ps = out.players[i];
      if (!ps) {
        ps = {
          id: p.id, slot: p.slot, team: p.team, name: p.name, x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0,
          cooldownTicks: 0, flags: 0, lastSeq: 0, abilityId: p.abilityId, dirX: 0, dirZ: 0,
        };
        out.players[i] = ps;
      }
      this.writePlayerState(p, ps);
      i++;
    }
    out.players.length = i;
    return out;
  }

  private writePlayerState(p: SimPlayer, ps: PlayerState): void {
    const t = p.body.translation();
    const v = p.body.linvel();
    ps.id = p.id;
    ps.slot = p.slot;
    ps.team = p.team;
    ps.name = p.name;
    ps.abilityId = p.abilityId;
    ps.x = t.x;
    ps.y = t.y;
    ps.z = t.z;
    ps.vx = v.x;
    ps.vz = v.z;
    ps.yaw = p.yaw;
    ps.cooldownTicks = p.cooldownTicks;
    ps.lastSeq = p.lastSeq;
    ps.dirX = p.input.dirX;
    ps.dirZ = p.input.dirZ;
    let flags = 0;
    if (p.connected) flags |= PLAYER_FLAG_CONNECTED;
    if (p.shieldTicks > 0) flags |= PLAYER_FLAG_SHIELD;
    if (p.activeTicks > 0 && p.speedCapMultiplier > 1) flags |= PLAYER_FLAG_DASH;
    if (p.kickChargeTicks > 0) flags |= PLAYER_FLAG_CHARGED;
    if (p.kickedThisTick || p.kickRefractoryTicks > KICK.refractoryTicks - 4) flags |= PLAYER_FLAG_KICKING;
    ps.flags = flags;
  }

  /**
   * Sobrescreve a simulacao com um estado autoritativo (reconciliacao no cliente).
   * Jogadores que nao existem localmente sao ignorados; o chamador cuida de add/remove.
   */
  applyState(state: MatchState): void {
    this.tick = state.tick;
    this.phase = state.phase;
    this.phaseTicksRemaining = state.phaseTicksRemaining;
    this.clockTicksRemaining = state.clockTicksRemaining;
    this.paused = !!state.paused;
    this.scoreLeft = state.scoreLeft;
    this.scoreRight = state.scoreRight;
    if (state.phase !== "lobby") this.started = true;
    this.setBallTransform(state.ball.x, state.ball.y, state.ball.z, state.ball.vx, state.ball.vy, state.ball.vz);
    for (const ps of state.players) {
      const p = this.players.get(ps.id);
      if (!p) continue;
      p.body.setTranslation({ x: ps.x, y: PLAYER_CENTER_Y, z: ps.z }, true);
      p.body.setLinvel({ x: ps.vx, y: 0, z: ps.vz }, true);
      p.yaw = ps.yaw;
      p.cooldownTicks = ps.cooldownTicks;
      p.connected = (ps.flags & PLAYER_FLAG_CONNECTED) !== 0;
      const shielded = (ps.flags & PLAYER_FLAG_SHIELD) !== 0;
      if (shielded && p.shieldTicks <= 0) p.shieldTicks = 1;
      if (!shielded && p.shieldTicks > 0) {
        p.shieldTicks = 0;
        p.activeTicks = 0;
        p.collider.setMass(p.baseMass);
      }
      const charged = (ps.flags & PLAYER_FLAG_CHARGED) !== 0;
      if (!charged) {
        p.kickChargeTicks = 0;
        p.kickChargeMultiplier = 1;
      }
      const kicking = (ps.flags & PLAYER_FLAG_KICKING) !== 0;
      p.kickedThisTick = false;
      p.kickBufferTicks = 0;
      if (kicking) {
        p.prevKick = true;
        p.kickRefractoryTicks = Math.max(p.kickRefractoryTicks, 1);
      } else {
        p.prevKick = false;
        p.kickRefractoryTicks = 0;
      }
    }
  }

  setBallTransform(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    this.ball.body.setTranslation({ x, y, z }, true);
    this.ball.body.setLinvel({ x: vx, y: vy, z: vz }, true);
  }

  getPlayerPosition(id: string): { x: number; z: number; vx: number; vz: number } | null {
    const p = this.players.get(id);
    if (!p) return null;
    const t = p.body.translation();
    const v = p.body.linvel();
    return { x: t.x, z: t.z, vx: v.x, vz: v.z };
  }

  setPlayerTransform(id: string, x: number, z: number, vx = 0, vz = 0): void {
    const p = this.players.get(id);
    if (!p) return;
    p.body.setTranslation({ x, y: PLAYER_CENTER_Y, z }, true);
    p.body.setLinvel({ x: vx, y: 0, z: vz }, true);
  }

  getBallPosition(): { x: number; y: number; z: number } {
    const t = this.ball.body.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  dispose(): void {
    this.eventQueue.free();
    this.world.free();
    this.players.clear();
    this.colliderOwners.clear();
  }
}
