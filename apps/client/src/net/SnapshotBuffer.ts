import type { Snapshot, SnapshotPlayer } from "@arena/protocol";
import { lerp, lerpAngle } from "../game/stateUtils";

const CAPACITY = 32;

export interface SampledPlayer {
  slot: number;
  x: number;
  z: number;
  yaw: number;
  flags: number;
  cooldownTicks: number;
}

/** Guarda snapshots recentes e interpola entre dois deles para um tick de render. */
export class SnapshotBuffer {
  private readonly items: Snapshot[] = [];
  private readonly scratch = new Map<number, SampledPlayer>();

  push(s: Snapshot): void {
    // Mantem ordenado por tick; descarta snapshots velhos ou duplicados.
    const last = this.items[this.items.length - 1];
    if (last && s.tick <= last.tick) return;
    this.items.push(s);
    if (this.items.length > CAPACITY) this.items.shift();
  }

  get latest(): Snapshot | null {
    return this.items[this.items.length - 1] ?? null;
  }

  clear(): void {
    this.items.length = 0;
  }

  /**
   * Interpola bola e jogadores para renderTick. Se o tick pedido e mais novo
   * que o ultimo snapshot, clampa (sem extrapolar: menos erro em quique).
   */
  sample(renderTick: number, outBall: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, outPlayers: Map<number, SampledPlayer>): Snapshot | null {
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
    const t = a === b || b.tick === a.tick ? 1 : Math.min(1, Math.max(0, (renderTick - a.tick) / (b.tick - a.tick)));
    outBall.x = lerp(a.ball.x, b.ball.x, t);
    outBall.y = lerp(a.ball.y, b.ball.y, t);
    outBall.z = lerp(a.ball.z, b.ball.z, t);
    outBall.vx = b.ball.vx;
    outBall.vy = b.ball.vy;
    outBall.vz = b.ball.vz;

    this.scratch.clear();
    for (const pa of a.players) this.scratch.set(pa.slot, { slot: pa.slot, x: pa.x, z: pa.z, yaw: pa.yaw, flags: pa.flags, cooldownTicks: pa.cooldownTicks });
    for (const pb of b.players) {
      const pa: SnapshotPlayer | SampledPlayer = this.scratch.get(pb.slot) ?? pb;
      let out = outPlayers.get(pb.slot);
      if (!out) {
        out = { slot: pb.slot, x: 0, z: 0, yaw: 0, flags: 0, cooldownTicks: 0 };
        outPlayers.set(pb.slot, out);
      }
      out.x = lerp(pa.x, pb.x, t);
      out.z = lerp(pa.z, pb.z, t);
      out.yaw = lerpAngle(pa.yaw, pb.yaw, t);
      out.flags = pb.flags;
      out.cooldownTicks = pb.cooldownTicks;
    }
    for (const slot of [...outPlayers.keys()]) if (!b.players.some((p) => p.slot === slot)) outPlayers.delete(slot);
    return b;
  }
}
