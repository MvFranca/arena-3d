import { BufferWriter, encodeInputPacket, type RoomInfo, type Snapshot, type TimedInput } from "@arena/protocol";
import {
  EMPTY_INPUT,
  FIXED_DT,
  MatchSimulation,
  createEmptyMatchState,
  type MatchEvent,
  type MatchState,
  type PlayerState,
} from "@arena/sim";
import type { GameConnection } from "../net/GameConnection";
import { SnapshotBuffer, type SampledBall, type SampledPlayer } from "../net/SnapshotBuffer";
import { BINDING_P1, InputCollector } from "./InputCollector";
import { decayBallOffset, isHardBallReset, localOwnsBall, nextBallOffset, nextOwnBlend, presentBall, remoteContactsBall, showPredictedBall, type BallVec } from "./ballCorrection";
import { remoteInputDecay } from "./remoteInputDecay";
import { copyMatchState, interpolateStates } from "./stateUtils";
import type { NetDebug, RenderState, SimulationHost } from "./types";

const DT_MS = FIXED_DT * 1000;
const MAX_FRAME_MS = 250;
const MAX_PENDING = 90;

/**
 * Partida online. Desenha a simulacao prevista do jogador local e da bola.
 * Remotos vem de snapshots interpolados; o servidor continua a autoridade.
 */
export class RemoteHost implements SimulationHost {
  readonly localPlayerIds: string[];
  private readonly sim: MatchSimulation;
  private readonly input: InputCollector;
  private readonly writer = new BufferWriter(64);
  private readonly pending: TimedInput[] = [];
  private readonly recent: TimedInput[] = [];
  private readonly prev: MatchState = createEmptyMatchState();
  private readonly curr: MatchState = createEmptyMatchState();
  private readonly authoritative: MatchState = createEmptyMatchState();
  private readonly events: MatchEvent[] = [];
  private readonly remoteBuffer = new SnapshotBuffer();
  private readonly sampledRemotes = new Map<number, SampledPlayer>();
  private readonly sampledBall: SampledBall = { x: 0, y: 0.5, z: 0, vx: 0, vy: 0, vz: 0 };
  private ballOffset: BallVec = { x: 0, y: 0, z: 0 };
  private ballOwn = 1;
  private frameDt = 0;
  private localKickAt = -1;
  private accumulator = 0;
  private roster: RoomInfo["players"] = [];
  private readonly slotToId = new Map<number, string>();
  private readonly unsubscribe: (() => void)[] = [];
  private lastAppliedSnapshotTick = -1;
  private lastSnapshotAt = 0;
  private lastBallCorr = 0;
  private lastVelCorr = 0;
  private lastRemoteCorr = 0;
  private prevPhase: MatchState["phase"] = "lobby";
  private readonly remoteInputs = new Map<string, { dirX: number; dirZ: number }>();
  private ticksSinceSnapshot = 0;

  constructor(
    private readonly conn: GameConnection,
    room: RoomInfo,
    private readonly localPlayerId: string,
  ) {
    this.localPlayerIds = [localPlayerId];
    this.sim = new MatchSimulation({ ruleset: room.ruleset, arena: room.arena, players: [] });
    this.input = new InputCollector(BINDING_P1, true);
    this.syncRoster(room);
    this.unsubscribe.push(conn.on("snapshot", (s) => this.onSnapshot(s)));
    this.unsubscribe.push(conn.on("event", (ev) => this.onServerEvent(ev)));
    this.unsubscribe.push(conn.on("room", (r) => this.syncRoster(r)));
    const latest = conn.room;
    if (latest) this.syncRoster(latest);
    this.sim.readState(this.curr);
    copyMatchState(this.curr, this.prev);
    this.prevPhase = this.curr.phase;
  }

  get pingMs(): number {
    return this.conn.clock.pingMs;
  }

  get netDebug(): NetDebug {
    return {
      snapshotAgeMs: this.lastSnapshotAt ? performance.now() - this.lastSnapshotAt : 0,
      delayTicks: this.remoteBuffer.delayTicks,
      bufferSize: this.remoteBuffer.size,
      ballCorr: this.lastBallCorr,
      velCorr: this.lastVelCorr,
      remoteCorr: this.lastRemoteCorr,
    };
  }

  private syncRoster(room: RoomInfo): void {
    this.roster = room.players;
    this.slotToId.clear();
    const ids = new Set<string>();
    for (const p of room.players) {
      this.slotToId.set(p.slot, p.id);
      ids.add(p.id);
      if (!this.sim.hasPlayer(p.id)) {
        this.sim.addPlayer({
          id: p.id,
          slot: p.slot,
          team: p.team,
          name: p.name,
          loadout: { attributes: p.attributes, abilityId: p.abilityId, archetypeId: p.archetypeId, skinId: p.skinId },
        });
      }
    }
    for (const id of this.sim.getPlayerIds()) if (!ids.has(id)) this.sim.removePlayer(id);
  }

  // ------------------------------------------------------------------ loop

  update(deltaMs: number): void {
    const frameMs = Math.min(deltaMs, MAX_FRAME_MS);
    this.frameDt = frameMs / 1000;
    this.accumulator += frameMs;
    const ball = this.curr.ball;
    this.ballOffset = decayBallOffset(this.ballOffset, this.frameDt, ball.vx * ball.vx + ball.vy * ball.vy + ball.vz * ball.vz);
    const now = performance.now();
    const clock = this.conn.clock;
    if (!clock.synced) {
      this.accumulator = 0;
      return;
    }
    const targetTick = Math.floor(clock.serverTickNow(now) + clock.leadTicks());
    let steps = 0;
    while (this.accumulator >= DT_MS && steps < 6) {
      this.accumulator -= DT_MS;
      const drift = this.sim.tick - targetTick;
      if (drift > 4) continue;
      this.stepLocal();
      steps++;
      if (drift < -4 && steps < 6) {
        this.stepLocal();
        steps++;
      }
    }
    if (this.accumulator > DT_MS * 4) this.accumulator = 0;
  }

  private stepLocal(): void {
    const sample = this.input.sample();
    const timed: TimedInput = { ...sample, tick: this.sim.tick };
    this.pending.push(timed);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.recent.push(timed);
    if (this.recent.length > 3) this.recent.shift();
    this.conn.sendBinary(encodeInputPacket(this.writer, this.recent));

    this.ticksSinceSnapshot++;
    this.applyDecayedRemoteInputs(remoteInputDecay(this.ticksSinceSnapshot));
    this.sim.setInput(this.localPlayerId, timed);
    copyMatchState(this.curr, this.prev);
    const ev = this.sim.step();
    for (const e of ev) {
      if (e.type === "kick" && e.playerId === this.localPlayerId) {
        this.localKickAt = performance.now();
        this.events.push(e);
      } else if (e.type === "ability_used" && e.playerId === this.localPlayerId) this.events.push(e);
    }
    this.sim.readState(this.curr);
  }

  // -------------------------------------------------------------- snapshot

  private onSnapshot(s: Snapshot): void {
    if (s.tick <= this.lastAppliedSnapshotTick) return;
    this.lastAppliedSnapshotTick = s.tick;
    this.lastSnapshotAt = performance.now();

    const now = performance.now();
    this.conn.clock.noteSnapshot(s.tick, now);

    const predictedBall = { x: this.curr.ball.x, y: this.curr.ball.y, z: this.curr.ball.z };
    const snapErr = Math.hypot(predictedBall.x - s.ball.x, predictedBall.y - s.ball.y, predictedBall.z - s.ball.z);
    this.lastBallCorr = snapErr;
    this.lastVelCorr = Math.hypot(this.curr.ball.vx - s.ball.vx, this.curr.ball.vy - s.ball.vy, this.curr.ball.vz - s.ball.vz);
    this.lastRemoteCorr = this.remoteCorrection(s);

    const a = this.authoritative;
    a.tick = s.tick;
    a.phase = s.phase;
    a.phaseTicksRemaining = s.phaseTicksRemaining;
    a.clockTicksRemaining = s.clockTicksRemaining;
    a.scoreLeft = s.scoreLeft;
    a.scoreRight = s.scoreRight;
    Object.assign(a.ball, s.ball);
    let n = 0;
    let myLastSeq = 0;
    for (const sp of s.players) {
      const id = this.slotToId.get(sp.slot);
      if (!id) continue;
      const r = this.roster.find((x) => x.id === id);
      if (!r) continue;
      let ps: PlayerState | undefined = a.players[n];
      if (!ps) {
        ps = {
          id, slot: sp.slot, team: r.team, name: r.name, x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0,
          cooldownTicks: 0, flags: 0, lastSeq: 0, abilityId: r.abilityId, dirX: 0, dirZ: 0,
        };
        a.players[n] = ps;
      }
      ps.id = id;
      ps.slot = sp.slot;
      ps.team = r.team;
      ps.name = r.name;
      ps.abilityId = r.abilityId;
      ps.x = sp.x;
      ps.y = sp.y;
      ps.z = sp.z;
      ps.vx = sp.vx;
      ps.vz = sp.vz;
      ps.yaw = sp.yaw;
      ps.cooldownTicks = sp.cooldownTicks;
      ps.flags = sp.flags;
      ps.lastSeq = sp.lastSeq;
      ps.dirX = sp.dirX;
      ps.dirZ = sp.dirZ;
      if (id === this.localPlayerId) myLastSeq = sp.lastSeq;
      n++;
    }
    a.players.length = n;

    this.sim.applyState(a);
    this.applyRemoteInputs(a);
    while (this.pending.length && this.pending[0]!.seq <= myLastSeq) this.pending.shift();
    for (let i = 0; i < this.pending.length; i++) {
      this.applyDecayedRemoteInputs(remoteInputDecay(i + 1));
      this.sim.setInput(this.localPlayerId, this.pending[i]!);
      this.sim.step();
    }
    this.ticksSinceSnapshot = this.pending.length;
    this.sim.readState(this.curr);

    const hard = isHardBallReset({ error: snapErr, prevPhase: this.prevPhase, nextPhase: s.phase });
    this.ballOffset = nextBallOffset(predictedBall, this.curr.ball, hard);
    this.prevPhase = s.phase;
    this.remoteBuffer.push(s);
  }

  /** Direcao autoritativa do ultimo snapshot, nao inferida pela velocidade. */
  private applyRemoteInputs(state: MatchState): void {
    this.remoteInputs.clear();
    this.ticksSinceSnapshot = 0;
    for (const p of state.players) {
      if (p.id === this.localPlayerId) continue;
      this.remoteInputs.set(p.id, { dirX: p.dirX, dirZ: p.dirZ });
    }
    this.applyDecayedRemoteInputs(1);
  }

  private applyDecayedRemoteInputs(decay: number): void {
    for (const [id, inp] of this.remoteInputs) {
      const dirX = inp.dirX * decay;
      const dirZ = inp.dirZ * decay;
      if (Math.hypot(dirX, dirZ) > 0.05) {
        this.sim.setInput(id, { seq: 0, dirX, dirZ, kick: false, ability: false });
      } else {
        this.sim.setInput(id, { ...EMPTY_INPUT });
      }
    }
  }

  private remoteCorrection(s: Snapshot): number {
    let max = 0;
    for (const sp of s.players) {
      const id = this.slotToId.get(sp.slot);
      if (!id || id === this.localPlayerId) continue;
      const cur = this.curr.players.find((p) => p.id === id);
      if (!cur) continue;
      max = Math.max(max, Math.hypot(cur.x - sp.x, cur.z - sp.z));
    }
    return max;
  }

  private onServerEvent(ev: MatchEvent): void {
    if ((ev.type === "kick" || ev.type === "ability_used") && ev.playerId === this.localPlayerId) return;
    this.events.push(ev);
  }

  // ---------------------------------------------------------------- render

  render(out: RenderState): void {
    const alpha = Math.min(1, this.accumulator / DT_MS);
    interpolateStates(out, this.prev, this.curr, alpha, this.localPlayerIds);
    const predictedBall = {
      x: out.ball.x + this.ballOffset.x,
      y: out.ball.y + this.ballOffset.y,
      z: out.ball.z + this.ballOffset.z,
    };

    const clock = this.conn.clock;
    let delayedBall: SampledBall | null = null;
    if (clock.synced && this.remoteBuffer.size > 0) {
      const renderTick = clock.serverTickNow(performance.now()) - this.remoteBuffer.delayTicks;
      this.remoteBuffer.tune(renderTick);
      this.remoteBuffer.sample(renderTick, this.sampledRemotes, this.sampledBall);
      delayedBall = this.sampledBall;
      for (const rp of out.players) {
        if (rp.isLocal) continue;
        const sampled = this.sampledRemotes.get(rp.slot);
        if (!sampled) continue;
        rp.x = sampled.x;
        rp.z = sampled.z;
        rp.yaw = sampled.yaw;
        rp.flags = sampled.flags;
        rp.cooldownTicks = sampled.cooldownTicks;
      }
    }

    const me = out.players.find((p) => p.isLocal);
    const sinceKick = this.localKickAt < 0 ? -1 : performance.now() - this.localKickAt;
    const owns = !!me && localOwnsBall({
      localX: me.x,
      localZ: me.z,
      ballX: predictedBall.x,
      ballZ: predictedBall.z,
      sinceLocalKickMs: sinceKick,
    });
    const remotes = out.players.filter((p) => !p.isLocal);
    const remoteContact = !!delayedBall && (
      remoteContactsBall(remotes, delayedBall.x, delayedBall.z)
      || remoteContactsBall(remotes, predictedBall.x, predictedBall.z)
    );
    this.ballOwn = nextOwnBlend(this.ballOwn, showPredictedBall(owns, remoteContact), this.frameDt);
    const shown = delayedBall ? presentBall(predictedBall, delayedBall, this.ballOwn) : predictedBall;
    out.ball.x = shown.x;
    out.ball.y = shown.y;
    out.ball.z = shown.z;
    if (delayedBall && this.ballOwn < 0.5) {
      out.ball.vx = delayedBall.vx;
      out.ball.vy = delayedBall.vy;
      out.ball.vz = delayedBall.vz;
    }
  }

  drainEvents(): MatchEvent[] {
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  dispose(): void {
    for (const u of this.unsubscribe) u();
    this.input.dispose();
    this.sim.dispose();
  }
}
