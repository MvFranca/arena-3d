import { BufferWriter, encodeInputPacket, type RoomInfo, type Snapshot, type TimedInput } from "@arena/protocol";
import {
  FIXED_DT,
  MatchSimulation,
  SNAPSHOT_EVERY_TICKS,
  createEmptyMatchState,
  type MatchEvent,
  type MatchState,
  type PlayerState,
} from "@arena/sim";
import type { GameConnection } from "../net/GameConnection";
import { SnapshotBuffer, type SampledPlayer } from "../net/SnapshotBuffer";
import { BINDING_P1, InputCollector } from "./InputCollector";
import { copyMatchState, ensureRenderPlayer, lerp } from "./stateUtils";
import type { RenderState, SimulationHost } from "./types";

const DT_MS = FIXED_DT * 1000;
const MAX_FRAME_MS = 250;
const INTERP_DELAY_TICKS = SNAPSHOT_EVERY_TICKS * 2 + 1; // ~115 ms
const MAX_PENDING = 90;
const BALL_BLEND_MS = 280;

/**
 * Partida online. O servidor e a autoridade; aqui so prevemos o jogador local
 * e interpolamos o resto a partir dos snapshots.
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
  private readonly snapshots = new SnapshotBuffer();
  private readonly sampledPlayers = new Map<number, SampledPlayer>();
  private readonly sampledBall = { x: 0, y: 0.5, z: 0, vx: 0, vy: 0, vz: 0 };
  private readonly events: MatchEvent[] = [];
  private accumulator = 0;
  private roster: RoomInfo["players"] = [];
  private readonly slotToId = new Map<number, string>();
  private lastLocalKickMs = -Infinity;
  private readonly unsubscribe: (() => void)[] = [];
  private lastAppliedSnapshotTick = -1;

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
  }

  get pingMs(): number {
    return this.conn.clock.pingMs;
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
    this.accumulator += Math.min(deltaMs, MAX_FRAME_MS);
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
      if (drift > 4) continue; // adiantado demais: pula um tick
      this.stepLocal();
      steps++;
      if (drift < -4 && steps < 6) {
        this.stepLocal(); // atrasado: avanca dois por frame
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

    this.sim.setInput(this.localPlayerId, timed);
    copyMatchState(this.curr, this.prev);
    const ev = this.sim.step();
    for (const e of ev) {
      // Feedback imediato so do que e nosso; o resto vem do servidor.
      if (e.type === "kick" && e.playerId === this.localPlayerId) {
        this.lastLocalKickMs = performance.now();
        this.events.push(e);
      } else if (e.type === "ability_used" && e.playerId === this.localPlayerId) {
        this.events.push(e);
      }
    }
    this.sim.readState(this.curr);
  }

  // -------------------------------------------------------------- snapshot

  private onSnapshot(s: Snapshot): void {
    this.snapshots.push(s);
    if (s.tick <= this.lastAppliedSnapshotTick) return;
    this.lastAppliedSnapshotTick = s.tick;

    const now = performance.now();
    const estimated = this.conn.clock.serverTickNow(now);
    if (Math.abs(estimated - s.tick) > 30) this.conn.clock.resync(s.tick, now);

    // Converte para MatchState usando o roster para mapear slot -> id.
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
        ps = { id, slot: sp.slot, team: r.team, name: r.name, x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0, cooldownTicks: 0, flags: 0, lastSeq: 0, abilityId: r.abilityId };
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
      if (id === this.localPlayerId) myLastSeq = sp.lastSeq;
      n++;
    }
    a.players.length = n;

    // Reconciliacao: volta ao estado autoritativo e reaplica inputs nao confirmados.
    this.sim.applyState(a);
    while (this.pending.length && this.pending[0]!.seq <= myLastSeq) this.pending.shift();
    for (const inp of this.pending) {
      this.sim.setInput(this.localPlayerId, inp);
      this.sim.step();
    }
    this.sim.readState(this.curr);
    copyMatchState(this.curr, this.prev);
  }

  private onServerEvent(ev: MatchEvent): void {
    // Chute e habilidade do jogador local ja foram emitidos na previsao.
    if ((ev.type === "kick" || ev.type === "ability_used") && ev.playerId === this.localPlayerId) return;
    this.events.push(ev);
  }

  // ---------------------------------------------------------------- render

  render(out: RenderState): void {
    const now = performance.now();
    const clock = this.conn.clock;
    const renderTick = clock.serverTickNow(now) - INTERP_DELAY_TICKS;
    const snap = this.snapshots.sample(renderTick, this.sampledBall, this.sampledPlayers);
    const alpha = Math.min(1, this.accumulator / DT_MS);

    const src = snap ?? this.curr;
    out.tick = this.curr.tick;
    out.phase = src.phase;
    out.phaseTicksRemaining = src.phaseTicksRemaining;
    out.clockTicksRemaining = src.clockTicksRemaining;
    out.scoreLeft = src.scoreLeft;
    out.scoreRight = src.scoreRight;

    // Bola: interpolada do servidor, misturada com a previsao logo apos o proprio chute.
    const sinceKick = now - this.lastLocalKickMs;
    const w = sinceKick < BALL_BLEND_MS && snap ? 1 - sinceKick / BALL_BLEND_MS : snap ? 0 : 1;
    const pb = this.curr.ball;
    const sb = snap ? this.sampledBall : pb;
    out.ball.x = lerp(sb.x, pb.x, w);
    out.ball.y = lerp(sb.y, pb.y, w);
    out.ball.z = lerp(sb.z, pb.z, w);
    out.ball.vx = sb.vx;
    out.ball.vy = sb.vy;
    out.ball.vz = sb.vz;

    let n = 0;
    for (const c of this.curr.players) {
      const isLocal = c.id === this.localPlayerId;
      const rp = ensureRenderPlayer(out, n++, c, isLocal);
      if (isLocal || !snap) {
        const p = this.prev.players.find((q) => q.id === c.id) ?? c;
        rp.x = lerp(p.x, c.x, alpha);
        rp.z = lerp(p.z, c.z, alpha);
        rp.yaw = c.yaw;
        rp.flags = c.flags;
        rp.cooldownTicks = c.cooldownTicks;
      } else {
        const sp = this.sampledPlayers.get(c.slot);
        if (sp) {
          rp.x = sp.x;
          rp.z = sp.z;
          rp.yaw = sp.yaw;
          rp.flags = sp.flags;
          rp.cooldownTicks = sp.cooldownTicks;
        } else {
          rp.x = c.x;
          rp.z = c.z;
          rp.yaw = c.yaw;
          rp.flags = c.flags;
          rp.cooldownTicks = c.cooldownTicks;
        }
      }
      rp.connected = (rp.flags & 1) !== 0;
    }
    out.players.length = n;
    out.focusPlayerId = this.localPlayerId;
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
