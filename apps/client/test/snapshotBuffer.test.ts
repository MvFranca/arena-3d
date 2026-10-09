import type { Snapshot, SnapshotPlayer } from "@arena/protocol";
import { SNAPSHOT_EVERY_TICKS } from "@arena/sim";
import { describe, expect, it } from "vitest";
import { SnapshotBuffer } from "../src/net/SnapshotBuffer";

function player(partial: Partial<SnapshotPlayer> & Pick<SnapshotPlayer, "slot">): SnapshotPlayer {
  return {
    lastSeq: 1,
    x: 0,
    y: 1,
    z: 0,
    vx: 0,
    vz: 0,
    yaw: 0,
    cooldownTicks: 0,
    flags: 1,
    dirX: 0,
    dirZ: 0,
    ...partial,
  };
}

function snap(tick: number, players: SnapshotPlayer[], ballX = 0): Snapshot {
  return {
    tick,
    phase: "playing",
    phaseTicksRemaining: 0,
    clockTicksRemaining: 1000,
    scoreLeft: 0,
    scoreRight: 0,
    ball: { x: ballX, y: 0.5, z: 0, vx: 2, vy: 0, vz: 0 },
    players,
  };
}

describe("SnapshotBuffer", () => {
  it("ignora snapshots mais velhos e substitui o mesmo tick", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(10, [player({ slot: 0, x: 1 })]));
    buf.push(snap(8, [player({ slot: 0, x: 9 })]));
    buf.push(snap(10, [player({ slot: 0, x: 2 })]));
    expect(buf.size).toBe(1);
    expect(buf.latest!.players[0]!.x).toBe(2);
  });

  it("interpola posicao entre dois snapshots", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, [player({ slot: 1, x: 0, z: 0, yaw: 0 })], 0));
    buf.push(snap(4, [player({ slot: 1, x: 4, z: 8, yaw: Math.PI })], 4));
    const out = new Map();
    const ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    buf.sample(2, out, ball);
    const p = out.get(1)!;
    expect(p.x).toBeCloseTo(2, 5);
    expect(p.z).toBeCloseTo(4, 5);
    expect(p.yaw).toBeCloseTo(Math.PI / 2, 5);
    expect(ball.x).toBeCloseTo(2, 5);
  });

  it("nao extrapola sem limite quando o renderTick passa do ultimo snapshot", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(10, [player({ slot: 0, x: 0, vx: 10, z: 0, vz: 0 })]));
    const out = new Map();
    buf.sample(10 + SNAPSHOT_EVERY_TICKS + 20, out);
    const p = out.get(0)!;
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(1.2);
  });

  it("aumenta o atraso apos varios underruns", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(20, [player({ slot: 0 })]));
    const start = buf.delayTicks;
    for (let i = 0; i < 6; i++) buf.tune(40);
    expect(buf.delayTicks).toBeGreaterThan(start);
  });

  it("remove jogador que saiu do snapshot mais novo", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, [player({ slot: 0 }), player({ slot: 1 })]));
    buf.push(snap(2, [player({ slot: 0 })]));
    const out = new Map();
    out.set(1, { slot: 1, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, flags: 0, cooldownTicks: 0, dirX: 0, dirZ: 0 });
    buf.sample(2, out);
    expect(out.has(1)).toBe(false);
    expect(out.has(0)).toBe(true);
  });
});
