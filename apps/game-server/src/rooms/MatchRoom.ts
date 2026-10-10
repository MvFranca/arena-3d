import { BufferWriter, encodeSnapshot, type RoomInfo, type RosterPlayer, type RosterTeam, type TimedInput } from "@arena/protocol";
import {
  EMPTY_INPUT,
  MatchSimulation,
  SNAPSHOT_EVERY_TICKS,
  createEmptyMatchState,
  sanitizeArena,
  type ArenaConfig,
  type MatchEvent,
  type MatchState,
  type PlayerInput,
  type Ruleset,
  type Team,
} from "@arena/sim";
import { config } from "../config";
import { log } from "../log";
import { metrics } from "../metrics";
import type { Session } from "../net/Session";

/** Quantos ticks repetimos o ultimo input quando o pacote nao chegou. */
const INPUT_HOLD_TICKS = 6;
/** Input atrasado em ate N ticks ainda vale para o tick atual. */
const LATE_TOLERANCE_TICKS = 3;
/** Input adiantado demais e descartado. */
const FUTURE_LIMIT_TICKS = 45;

interface Slot {
  session: Session;
  slot: number;
  team: RosterTeam;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  inputs: Map<number, TimedInput>;
  lastInput: PlayerInput;
  lastInputTick: number;
  lastSeq: number;
  joinedAt: number;
}

export interface MatchResultReport {
  roomCode: string;
  rulesetId: string;
  arenaId: string;
  startedAt: number;
  endedAt: number;
  scoreLeft: number;
  scoreRight: number;
  winner: Team | "draw";
  ranked: boolean;
  players: { id: string; name: string; guest: boolean; team: RosterTeam; goals: number; ownGoals: number }[];
}

export interface MatchRoomOptions {
  code: string;
  ruleset: Ruleset;
  arena: ArenaConfig;
  mapId: string;
  automatic: boolean;
  reserved?: string[];
  ticket?: string;
  ranked?: boolean;
  /** Tick atual do processo; a sim da sala nasce alinhada a ele. */
  nowTick(): number;
  onEmpty(room: MatchRoom): void;
  onResult(report: MatchResultReport): void;
}

/**
 * Uma partida hospedada. Dona do MatchSimulation daquela sala, dos slots
 * e do que vai para a rede. O tick e chamado pelo loop global do processo.
 */
export class MatchRoom {
  readonly code: string;
  readonly ruleset: Ruleset;
  arena: ArenaConfig;
  mapId: string;
  automatic: boolean;
  readonly ranked: boolean;
  private readonly reserved: Set<string> | null;
  private readonly ticket: string | null;
  private sim: MatchSimulation;
  private readonly slots = new Map<string, Slot>();
  private hostId: string | null = null;
  private readonly state: MatchState = createEmptyMatchState();
  private readonly writer = new BufferWriter(512);
  private readonly goalsByPlayer = new Map<string, { goals: number; ownGoals: number }>();
  private startedAt = 0;
  private finishedAt: number | null = null;
  private autoStartAt: number | null = null;
  readonly createdAt = Date.now();
  private readonly onEmpty: (room: MatchRoom) => void;
  private readonly onResult: (report: MatchResultReport) => void;
  private readonly nowTick: () => number;
  private destroyed = false;

  constructor(opts: MatchRoomOptions) {
    this.code = opts.code;
    this.ruleset = opts.ruleset;
    this.arena = opts.arena;
    this.mapId = opts.mapId;
    this.automatic = opts.automatic;
    this.ranked = opts.ranked ?? false;
    this.reserved = opts.reserved ? new Set(opts.reserved) : null;
    this.ticket = opts.ticket ?? null;
    this.onEmpty = opts.onEmpty;
    this.onResult = opts.onResult;
    this.nowTick = opts.nowTick;
    this.sim = this.spawnSim();
  }

  get playerCount(): number {
    return this.slots.size;
  }

  get phase() {
    return this.sim.phase;
  }

  /** Tick da partida; o cliente usa no PONG para numerar inputs. */
  get simTick(): number {
    return this.sim.tick;
  }

  // ------------------------------------------------------------- jogadores

  canJoin(session: Session, ticket?: string): string | null {
    if (this.destroyed) return "room_closed";
    if (this.slots.has(session.playerId)) return null; // reconexao
    if (this.slots.size >= this.ruleset.maxPlayers) return "room_full";
    if (this.reserved && !this.reserved.has(session.playerId)) return "not_invited";
    if (this.ticket && ticket !== this.ticket) return "bad_ticket";
    if (this.sim.phase !== "lobby" && this.sim.phase !== "finished" && !this.reserved) return "match_in_progress";
    return null;
  }

  join(session: Session): void {
    const existing = this.slots.get(session.playerId);
    if (existing) {
      this.reconnect(existing, session);
      return;
    }
    const slotIndex = this.freeSlotIndex();
    const team = this.pickTeam();
    const slot: Slot = {
      session,
      slot: slotIndex,
      team,
      ready: false,
      connected: true,
      disconnectedAt: null,
      inputs: new Map(),
      lastInput: { ...EMPTY_INPUT },
      lastInputTick: -1,
      lastSeq: 0,
      joinedAt: Date.now(),
    };
    this.slots.set(session.playerId, slot);
    session.room = this;
    this.spawnSlot(slot);
    if (!this.hostId) this.hostId = session.playerId;
    log.info({ room: this.code, player: session.playerId, team }, "player joined");
    this.broadcastRoom();
    if (this.automatic && this.slots.size >= this.ruleset.maxPlayers && this.sim.phase === "lobby") {
      this.autoStartAt = Date.now() + 3000;
    }
    this.sendFullSnapshot(session);
  }

  private reconnect(slot: Slot, session: Session): void {
    slot.session = session;
    slot.connected = true;
    slot.disconnectedAt = null;
    session.room = this;
    this.sim.setConnected(session.playerId, true);
    log.info({ room: this.code, player: session.playerId }, "player reconnected");
    this.broadcastRoom();
    this.sendFullSnapshot(session);
  }

  markDisconnected(playerId: string): void {
    const slot = this.slots.get(playerId);
    if (!slot) return;
    slot.connected = false;
    slot.disconnectedAt = Date.now();
    slot.inputs.clear();
    slot.lastInput = { ...EMPTY_INPUT };
    this.sim.setConnected(playerId, false);
    this.sim.setInput(playerId, { ...EMPTY_INPUT, seq: slot.lastSeq });
    this.broadcastRoom();
  }

  leave(playerId: string): void {
    const slot = this.slots.get(playerId);
    if (!slot) return;
    this.slots.delete(playerId);
    slot.session.room = null;
    slot.session.send({ t: "left" });
    this.sim.removePlayer(playerId);
    if (this.hostId === playerId) this.hostId = this.slots.keys().next().value ?? null;
    log.info({ room: this.code, player: playerId }, "player left");
    if (this.slots.size === 0) {
      this.destroy();
      return;
    }
    this.broadcastRoom();
  }

  assign(actorId: string, playerId: string, team: RosterTeam): string | null {
    if (this.automatic || this.ranked) return "automatic_room";
    if (this.sim.phase === "finished") return "already_started";
    if (team !== "left" && team !== "right" && team !== "spec") return "bad_team";
    const actor = this.slots.get(actorId);
    const slot = this.slots.get(playerId);
    if (!actor || !slot) return "not_found";
    if (actorId !== this.hostId && actorId !== playerId) return "not_host";
    if (slot.team === team) return null;
    if (team !== "spec") {
      let count = 0;
      for (const s of this.slots.values()) if (s.team === team) count++;
      if (count >= this.ruleset.teamSize) return "team_full";
    }
    slot.team = team;
    this.sim.removePlayer(playerId);
    this.spawnSlot(slot);
    this.broadcastRoom();
    return null;
  }

  setReady(playerId: string, ready: boolean): void {
    const slot = this.slots.get(playerId);
    if (!slot) return;
    slot.ready = ready;
    this.broadcastRoom();
  }

  restart(playerId: string): string | null {
    if (this.automatic || this.ranked) return "automatic_room";
    if (playerId !== this.hostId) return "not_host";
    if (this.sim.phase === "lobby") return null;
    this.finishedAt = null;
    this.resetToLobby();
    return null;
  }

  setPaused(playerId: string, paused: boolean): string | null {
    if (this.automatic || this.ranked) return "automatic_room";
    if (playerId !== this.hostId) return "not_host";
    if (this.sim.phase === "lobby" || this.sim.phase === "finished") return "not_playing";
    this.sim.setPaused(paused);
    this.broadcastRoom();
    return null;
  }

  setLimits(playerId: string, durationSeconds: number, scoreLimit: number): string | null {
    if (this.automatic || this.ranked) return "automatic_room";
    if (playerId !== this.hostId) return "not_host";
    if (this.sim.phase === "finished") return "already_started";
    if (typeof durationSeconds !== "number" || typeof scoreLimit !== "number" || !Number.isFinite(durationSeconds) || !Number.isFinite(scoreLimit)) {
      return "bad_limits";
    }
    const duration = Math.round(durationSeconds);
    const score = Math.round(scoreLimit);
    if (duration < 0 || duration > 30 * 60 || score < 0 || score > 20) return "bad_limits";
    this.sim.setLimits(duration, score);
    this.broadcastRoom();
    return null;
  }

  setMap(playerId: string, mapId: string, arena: ArenaConfig): string | null {
    const reason = this.canEditArena(playerId);
    if (reason) return reason;
    this.applyArena(mapId, arena);
    this.broadcastRoom();
    return null;
  }

  setArena(playerId: string, arena: ArenaConfig): string | null {
    const reason = this.canEditArena(playerId);
    if (reason) return reason;
    const clean = sanitizeArena(arena);
    this.applyArena(clean.id || "custom", clean);
    this.broadcastRoom();
    return null;
  }

  private canEditArena(playerId: string): string | null {
    if (this.automatic || this.ranked) return "automatic_room";
    if (playerId !== this.hostId) return "not_host";
    if (this.sim.phase === "finished") return "already_started";
    if (this.sim.phase !== "lobby" && !this.sim.paused) return "pause_first";
    return null;
  }

  private applyArena(mapId: string, arena: ArenaConfig): void {
    const progress = this.sim.phase === "lobby" ? null : this.sim.captureProgress();
    this.mapId = mapId;
    this.arena = arena;
    const old = this.sim;
    this.sim = this.spawnSim();
    for (const s of this.slots.values()) this.spawnSlot(s);
    if (progress && progress.phase !== "finished") {
      this.sim.restoreProgress(progress);
      this.sim.resetPositions();
    }
    old.dispose();
  }

  private spawnSlot(slot: Slot): void {
    if (slot.team === "spec") return;
    this.sim.addPlayer({
      id: slot.session.playerId,
      slot: slot.slot,
      team: slot.team,
      name: slot.session.name,
      loadout: slot.session.loadout,
    });
    this.sim.setConnected(slot.session.playerId, slot.connected);
  }

  requestStart(playerId: string): string | null {
    if (this.automatic) return "automatic_room";
    if (playerId !== this.hostId) return "not_host";
    if (this.sim.phase !== "lobby") return "already_started";
    let left = 0;
    let right = 0;
    for (const s of this.slots.values()) {
      if (s.team === "spec") continue;
      if (s.team === "left") left++;
      else right++;
      if (!s.ready && s.session.playerId !== this.hostId) return "not_everyone_ready";
    }
    if (left < 1 || right < 1) return "need_both_teams";
    this.start();
    return null;
  }

  private start(): void {
    this.autoStartAt = null;
    this.startedAt = Date.now();
    this.goalsByPlayer.clear();
    this.sim.start();
    this.broadcastRoom();
    log.info({ room: this.code, players: this.slots.size }, "match started");
  }

  // ---------------------------------------------------------------- input

  handleInput(playerId: string, inputs: TimedInput[]): void {
    const slot = this.slots.get(playerId);
    if (!slot) return;
    const now = this.sim.tick;
    for (const inp of inputs) {
      if (inp.seq <= slot.lastSeq && inp.tick < now) continue;
      if (inp.tick > now + FUTURE_LIMIT_TICKS) {
        metrics.inputsDropped++;
        continue;
      }
      if (inp.tick < now - LATE_TOLERANCE_TICKS) {
        metrics.inputsDropped++;
        continue;
      }
      // Sanitiza: so intencao, modulo <= 1.
      const len = Math.hypot(inp.dirX, inp.dirZ);
      if (!Number.isFinite(len)) continue;
      if (len > 1) {
        inp.dirX /= len;
        inp.dirZ /= len;
      }
      const tick = inp.tick < now ? now : inp.tick;
      if (inp.tick < now) metrics.inputsLate++;
      const prev = slot.inputs.get(tick);
      if (!prev || inp.seq > prev.seq) slot.inputs.set(tick, inp);
    }
  }

  // ----------------------------------------------------------------- tick

  tick(): void {
    if (this.destroyed) return;
    const now = Date.now();

    if (this.autoStartAt !== null && now >= this.autoStartAt && this.sim.phase === "lobby") this.start();

    // Expira vagas de quem caiu ha muito tempo.
    for (const [id, slot] of this.slots) {
      if (!slot.connected && slot.disconnectedAt !== null && now - slot.disconnectedAt > config.reconnectGraceMs) this.leave(id);
    }
    if (this.destroyed) return;

    const t = this.sim.tick;
    for (const slot of this.slots.values()) {
      let input = slot.inputs.get(t);
      if (input) {
        slot.lastInput = input;
        slot.lastInputTick = t;
        if (input.seq > slot.lastSeq) slot.lastSeq = input.seq;
      } else if (slot.connected && t - slot.lastInputTick <= INPUT_HOLD_TICKS) {
        input = { ...slot.lastInput, tick: t, seq: slot.lastSeq };
      } else {
        input = { ...EMPTY_INPUT, tick: t, seq: slot.lastSeq };
      }
      this.sim.setInput(slot.session.playerId, input);
      for (const k of slot.inputs.keys()) if (k < t) slot.inputs.delete(k);
    }

    const events = this.sim.step();
    for (const ev of events) this.onEvent(ev);

    if (this.sim.tick % SNAPSHOT_EVERY_TICKS === 0) this.broadcastSnapshot();

    if (this.finishedAt !== null && now - this.finishedAt > config.postMatchResetMs) this.resetToLobby();
  }

  private onEvent(ev: MatchEvent): void {
    if (ev.type === "goal" && ev.scorerId) {
      const g = this.goalsByPlayer.get(ev.scorerId) ?? { goals: 0, ownGoals: 0 };
      if (ev.ownGoal) g.ownGoals++;
      else g.goals++;
      this.goalsByPlayer.set(ev.scorerId, g);
    }
    if (ev.type === "match_ended") {
      this.finishedAt = Date.now();
      const report: MatchResultReport = {
        roomCode: this.code,
        rulesetId: this.ruleset.id,
        arenaId: this.mapId,
        startedAt: this.startedAt,
        endedAt: this.finishedAt,
        scoreLeft: ev.scoreLeft,
        scoreRight: ev.scoreRight,
        winner: ev.winner,
        ranked: this.ranked,
        players: [...this.slots.values()].map((s) => ({
          id: s.session.playerId,
          name: s.session.name,
          guest: s.session.guest,
          team: s.team,
          goals: this.goalsByPlayer.get(s.session.playerId)?.goals ?? 0,
          ownGoals: this.goalsByPlayer.get(s.session.playerId)?.ownGoals ?? 0,
        })),
      };
      this.onResult(report);
      log.info({ room: this.code, score: `${ev.scoreLeft}-${ev.scoreRight}` }, "match ended");
    }
    const msg = JSON.stringify({ t: "event", ev });
    for (const s of this.slots.values()) if (s.connected) s.session.ws!.send(msg);
  }

  private resetToLobby(): void {
    this.finishedAt = null;
    const old = this.sim;
    this.sim = this.spawnSim();
    for (const s of this.slots.values()) {
      s.ready = false;
      s.inputs.clear();
      s.lastInputTick = -1;
      this.spawnSlot(s);
    }
    old.dispose();
    this.automatic = false; // revanche fica na mao do host
    this.broadcastRoom();
    for (const s of this.slots.values()) this.sendFullSnapshot(s.session);
  }

  private spawnSim(): MatchSimulation {
    const sim = new MatchSimulation({ ruleset: this.ruleset, arena: this.arena, players: [] });
    sim.tick = this.nowTick();
    return sim;
  }

  // -------------------------------------------------------------- rede

  private broadcastSnapshot(): void {
    this.sim.readState(this.state);
    const bytes = encodeSnapshot(this.writer, this.state);
    metrics.snapshotBytes.record(bytes.length);
    for (const s of this.slots.values()) if (s.connected) s.session.ws!.send(bytes, { binary: true });
  }

  private sendFullSnapshot(session: Session): void {
    this.sim.readState(this.state);
    session.sendBinary(encodeSnapshot(this.writer, this.state));
  }

  roomInfo(): RoomInfo {
    const players: RosterPlayer[] = [...this.slots.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((s) => ({
        id: s.session.playerId,
        slot: s.slot,
        name: s.session.name,
        team: s.team,
        connected: s.connected,
        ready: s.ready,
        isHost: s.session.playerId === this.hostId,
        abilityId: s.session.loadout.abilityId,
        attributes: s.session.loadout.attributes,
        archetypeId: s.session.loadout.archetypeId,
        skinId: s.session.loadout.skinId,
      }));
    return { code: this.code, ruleset: this.ruleset, arena: this.arena, mapId: this.mapId, phase: this.sim.phase, players, automatic: this.automatic, paused: this.sim.paused };
  }

  broadcastRoom(): void {
    const room = this.roomInfo();
    for (const s of this.slots.values()) s.session.send({ t: "room", room, you: { slot: s.slot } });
  }

  // ------------------------------------------------------------ helpers

  private freeSlotIndex(): number {
    const used = new Set([...this.slots.values()].map((s) => s.slot));
    for (let i = 0; i < this.ruleset.maxPlayers; i++) if (!used.has(i)) return i;
    throw new Error("sem vaga");
  }

  private pickTeam(): RosterTeam {
    let left = 0;
    let right = 0;
    for (const s of this.slots.values()) {
      if (s.team === "left") left++;
      else if (s.team === "right") right++;
    }
    if (left < this.ruleset.teamSize && left <= right) return "left";
    if (right < this.ruleset.teamSize) return "right";
    return "spec";
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const s of this.slots.values()) {
      s.session.room = null;
      s.session.send({ t: "left" });
    }
    this.slots.clear();
    this.sim.dispose();
    this.onEmpty(this);
    log.info({ room: this.code }, "room destroyed");
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }
}
