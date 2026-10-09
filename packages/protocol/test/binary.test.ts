import { createEmptyMatchState } from "@arena/sim";
import { describe, expect, it } from "vitest";
import { BufferWriter, decodeInputPacket, decodeSnapshot, encodeInputPacket, encodeSnapshot, OP, readOpcode } from "../src";

describe("input", () => {
  it("vai e volta com no maximo 3 inputs", () => {
    const w = new BufferWriter();
    const inputs = [1, 2, 3, 4].map((n) => ({ seq: n, tick: 100 + n, dirX: n % 2 ? 1 : -0.5, dirZ: 0.25, kick: n === 4, ability: n === 2 }));
    const bytes = encodeInputPacket(w, inputs);
    const { op, reader } = readOpcode(bytes);
    expect(op).toBe(OP.INPUT);
    const decoded = decodeInputPacket(reader);
    expect(decoded).toHaveLength(3);
    expect(decoded[0]!.seq).toBe(2);
    expect(decoded[2]).toMatchObject({ seq: 4, tick: 104, kick: true, ability: false });
    expect(decoded[2]!.dirX).toBeCloseTo(-0.5, 1);
    expect(decoded[0]!.ability).toBe(true);
  });
});

describe("snapshot", () => {
  it("preserva campos com quantizacao de centesimo", () => {
    const s = createEmptyMatchState();
    s.tick = 1234;
    s.phase = "playing";
    s.clockTicksRemaining = 5400;
    s.scoreLeft = 2;
    s.scoreRight = 1;
    s.ball = { x: 3.456, y: 0.5, z: -7.891, vx: 12.34, vy: -1, vz: 0.01 };
    s.players.push({
      id: "p", slot: 3, team: "right", name: "p", x: -10.125, y: 1.2, z: 4.5, vx: -3.3, vz: 9.99, yaw: 1.5708,
      cooldownTicks: 321, flags: 0b1011, lastSeq: 99, abilityId: "dash", dirX: 0.5, dirZ: -1,
    });
    const bytes = encodeSnapshot(new BufferWriter(), s);
    expect(bytes.length).toBeLessThan(80);
    const { op, reader } = readOpcode(bytes);
    expect(op).toBe(OP.SNAPSHOT);
    const d = decodeSnapshot(reader);
    expect(d.tick).toBe(1234);
    expect(d.phase).toBe("playing");
    expect(d.scoreLeft).toBe(2);
    expect(d.ball.x).toBeCloseTo(3.46, 2);
    expect(d.ball.vx).toBeCloseTo(12.34, 2);
    expect(d.players[0]).toMatchObject({ slot: 3, lastSeq: 99, cooldownTicks: 321, flags: 0b1011 });
    expect(d.players[0]!.yaw).toBeCloseTo(1.571, 2);
    expect(d.players[0]!.dirX).toBeCloseTo(0.5, 1);
    expect(d.players[0]!.dirZ).toBeCloseTo(-1, 1);
  });
});
