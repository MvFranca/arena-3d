import type { Snapshot, SnapshotPlayer } from "@arena/protocol";
import { FIXED_DT, SNAPSHOT_EVERY_TICKS } from "@arena/sim";
import { lerp, lerpAngle } from "../game/stateUtils";

const CAPACITY = 32;
const MIN_DELAY = SNAPSHOT_EVERY_TICKS;
const MAX_DELAY = SNAPSHOT_EVERY_TICKS * 4;
const DEFAULT_DELAY = SNAPSHOT_EVERY_TICKS * 2;
const MAX_EXTRAPOLATE = SNAPSHOT_EVERY_TICKS + 1;

export interface SampledPlayer {
  slot: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  flags: number;
  cooldownTicks: number;
  dirX: number;
  dirZ: number;
}

export interface SampledBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** Guarda snapshots recentes e interpola jogadores remotos para um tick de render. */
export class SnapshotBuffer {
  private readonly items: Snapshot[] = [];
  private readonly scratch = new Map<number, SampledPlayer>();
  delayTicks = DEFAULT_DELAY;
  private underruns = 0;
  private healthy = 0;

  push(s: Snapshot): void {
    const last = this.items[this.items.length - 1];
    if (last && s.tick < last.tick) return;
    if (last && s.tick === last.tick) {
      this.items[this.items.length - 1] = s;
      return;
    }
    this.items.push(s);
    if (this.items.length > CAPACITY) this.items.shift();
  }

  get latest(): Snapshot | null {
    return this.items[this.items.length - 1] ?? null;
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
    this.delayTicks = DEFAULT_DELAY;
    this.underruns = 0;
    this.healthy = 0;
  }

  /** Aumenta o atraso se faltar snapshot; reduz se o buffer estiver folgado. */
  tune(renderTick: number): void {
    const latest = this.latest;
    if (!latest) return;
    const ahead = latest.tick - renderTick;
    if (ahead < 0) {
      this.underruns++;
      this.healthy = 0;
      if (this.underruns >= 3 && this.delayTicks < MAX_DELAY) {
        this.delayTicks++;
        this.underruns = 0;
      }
    } else if (ahead > this.delayTicks + SNAPSHOT_EVERY_TICKS) {
      this.healthy++;
      this.underruns = 0;
      if (this.healthy >= 8 && this.delayTicks > MIN_DELAY) {
        this.delayTicks--;
        this.healthy = 0;
      }
    } else {
      this.underruns = 0;
    }
  }

  /**
   * Interpola jogadores para renderTick. Se o tick pedido e mais novo que o
   * ultimo snapshot, extrapola no maximo poucos ticks pela velocidade.
   */
  sample(renderTick: number, outPlayers: Map<number, SampledPlayer>, outBall?: SampledBall): Snapshot | null {
    const n = this.items.length;
    if (n === 0) return null;
    let a = this.items[0]!;
    let b = a;
    for (let i = 0; i < n; i++) {
      const s = this.items[i]!;
      if (s.tick <= renderTick) a = s;
      if (s.tick >= renderTick) {
        b = s;
        break;
      }
      b = s;
    }

    this.scratch.clear();
    if (renderTick > b.tick) {
      const extra = Math.min(MAX_EXTRAPOLATE, renderTick - b.tick);
      this.writeExtrapolated(b, extra, outPlayers, outBall);
      return b;
    }

    const t = a === b || b.tick === a.tick ? 1 : Math.min(1, Math.max(0, (renderTick - a.tick) / (b.tick - a.tick)));
    if (outBall) {
      outBall.x = lerp(a.ball.x, b.ball.x, t);
      outBall.y = lerp(a.ball.y, b.ball.y, t);
      outBall.z = lerp(a.ball.z, b.ball.z, t);
      outBall.vx = lerp(a.ball.vx, b.ball.vx, t);
      outBall.vy = lerp(a.ball.vy, b.ball.vy, t);
      outBall.vz = lerp(a.ball.vz, b.ball.vz, t);
    }
    for (const pa of a.players) {
      this.scratch.set(pa.slot, this.toSampled(pa));
    }
    for (const pb of b.players) {
      const pa = this.scratch.get(pb.slot) ?? this.toSampled(pb);
      let out = outPlayers.get(pb.slot);
      if (!out) {
        out = emptySampled(pb.slot);
        outPlayers.set(pb.slot, out);
      }
      out.x = lerp(pa.x, pb.x, t);
      out.z = lerp(pa.z, pb.z, t);
      out.vx = lerp(pa.vx, pb.vx, t);
      out.vz = lerp(pa.vz, pb.vz, t);
      out.yaw = lerpAngle(pa.yaw, pb.yaw, t);
      out.flags = pb.flags;
      out.cooldownTicks = pb.cooldownTicks;
      out.dirX = pb.dirX;
      out.dirZ = pb.dirZ;
    }
    for (const slot of [...outPlayers.keys()]) if (!b.players.some((p) => p.slot === slot)) outPlayers.delete(slot);
    return b;
  }

  private writeExtrapolated(s: Snapshot, extraTicks: number, outPlayers: Map<number, SampledPlayer>, outBall?: SampledBall): void {
    const dt = extraTicks * FIXED_DT;
    if (outBall) {
      outBall.x = s.ball.x + s.ball.vx * dt;
      outBall.y = s.ball.y + s.ball.vy * dt;
      outBall.z = s.ball.z + s.ball.vz * dt;
      outBall.vx = s.ball.vx;
      outBall.vy = s.ball.vy;
      outBall.vz = s.ball.vz;
    }
    for (const p of s.players) {
      let out = outPlayers.get(p.slot);
      if (!out) {
        out = emptySampled(p.slot);
        outPlayers.set(p.slot, out);
      }
      out.x = p.x + p.vx * dt;
      out.z = p.z + p.vz * dt;
      out.vx = p.vx;
      out.vz = p.vz;
      out.yaw = p.yaw;
      out.flags = p.flags;
      out.cooldownTicks = p.cooldownTicks;
      out.dirX = p.dirX;
      out.dirZ = p.dirZ;
    }
    for (const slot of [...outPlayers.keys()]) if (!s.players.some((p) => p.slot === slot)) outPlayers.delete(slot);
  }

  private toSampled(p: SnapshotPlayer): SampledPlayer {
    return {
      slot: p.slot,
      x: p.x,
      z: p.z,
      vx: p.vx,
      vz: p.vz,
      yaw: p.yaw,
      flags: p.flags,
      cooldownTicks: p.cooldownTicks,
      dirX: p.dirX,
      dirZ: p.dirZ,
    };
  }
}

function emptySampled(slot: number): SampledPlayer {
  return { slot, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, flags: 0, cooldownTicks: 0, dirX: 0, dirZ: 0 };
}
