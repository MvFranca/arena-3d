import { PHASE_CODES, PHASE_FROM_CODE, type MatchState, type PlayerInput } from "@arena/sim";
import { BufferReader, BufferWriter, clampInt } from "./codec";
import { BTN_ABILITY, BTN_KICK, INPUT_REDUNDANCY, OP, POS_SCALE, VEL_SCALE, YAW_SCALE } from "./opcodes";

// ----------------------------------------------------------------------- input

export interface TimedInput extends PlayerInput {
  /** Tick do servidor em que o cliente quer que este input seja aplicado. */
  tick: number;
}

/**
 * Pacote de input: os ultimos N inputs, do mais antigo para o mais novo.
 * Sem posicao, sem atributos, sem cooldown. So intencao.
 */
export function encodeInputPacket(writer: BufferWriter, inputs: readonly TimedInput[]): Uint8Array {
  writer.reset().u8(OP.INPUT);
  const list = inputs.slice(-INPUT_REDUNDANCY);
  writer.u8(list.length);
  for (const i of list) {
    writer.u32(i.seq).u32(i.tick);
    writer.i8(clampInt(i.dirX * 127, -127, 127));
    writer.i8(clampInt(i.dirZ * 127, -127, 127));
    writer.u8((i.kick ? BTN_KICK : 0) | (i.ability ? BTN_ABILITY : 0));
  }
  return writer.toUint8Array();
}

export function decodeInputPacket(reader: BufferReader): TimedInput[] {
  const count = Math.min(reader.u8(), INPUT_REDUNDANCY);
  const out: TimedInput[] = [];
  for (let k = 0; k < count; k++) {
    if (reader.remaining < 11) break;
    const seq = reader.u32();
    const tick = reader.u32();
    const dirX = reader.i8() / 127;
    const dirZ = reader.i8() / 127;
    const btn = reader.u8();
    out.push({ seq, tick, dirX, dirZ, kick: (btn & BTN_KICK) !== 0, ability: (btn & BTN_ABILITY) !== 0 });
  }
  return out;
}

// -------------------------------------------------------------------- snapshot

export interface SnapshotPlayer {
  slot: number;
  lastSeq: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  cooldownTicks: number;
  flags: number;
  dirX: number;
  dirZ: number;
}

export interface Snapshot {
  tick: number;
  phase: MatchState["phase"];
  phaseTicksRemaining: number;
  paused: boolean;
  clockTicksRemaining: number;
  scoreLeft: number;
  scoreRight: number;
  ball: MatchState["ball"];
  players: SnapshotPlayer[];
}

export function encodeSnapshot(writer: BufferWriter, s: MatchState): Uint8Array {
  writer.reset().u8(OP.SNAPSHOT);
  writer.u32(s.tick);
  writer.u8(PHASE_CODES[s.phase]);
  writer.u8(s.paused ? 1 : 0);
  writer.u16(Math.min(65535, s.phaseTicksRemaining));
  writer.u32(s.clockTicksRemaining);
  writer.u8(Math.min(255, s.scoreLeft));
  writer.u8(Math.min(255, s.scoreRight));
  writer.i32(s.ball.x * POS_SCALE).i32(s.ball.y * POS_SCALE).i32(s.ball.z * POS_SCALE);
  writer.i16(clampInt(s.ball.vx * VEL_SCALE, -32767, 32767));
  writer.i16(clampInt(s.ball.vy * VEL_SCALE, -32767, 32767));
  writer.i16(clampInt(s.ball.vz * VEL_SCALE, -32767, 32767));
  writer.u8(s.players.length);
  for (const p of s.players) {
    writer.u8(p.slot);
    writer.u32(p.lastSeq);
    writer.i32(p.x * POS_SCALE).i32(p.y * POS_SCALE).i32(p.z * POS_SCALE);
    writer.i16(clampInt(p.vx * VEL_SCALE, -32767, 32767));
    writer.i16(clampInt(p.vz * VEL_SCALE, -32767, 32767));
    writer.i16(clampInt(p.yaw * YAW_SCALE, -32767, 32767));
    writer.u16(Math.min(65535, p.cooldownTicks));
    writer.u8(p.flags & 0xff);
    writer.i8(clampInt((p.dirX ?? 0) * 127, -127, 127));
    writer.i8(clampInt((p.dirZ ?? 0) * 127, -127, 127));
  }
  return writer.toUint8Array();
}

export function decodeSnapshot(reader: BufferReader): Snapshot {
  const tick = reader.u32();
  const phase = PHASE_FROM_CODE[reader.u8()] ?? "lobby";
  const paused = reader.u8() !== 0;
  const phaseTicksRemaining = reader.u16();
  const clockTicksRemaining = reader.u32();
  const scoreLeft = reader.u8();
  const scoreRight = reader.u8();
  const ball = {
    x: reader.i32() / POS_SCALE,
    y: reader.i32() / POS_SCALE,
    z: reader.i32() / POS_SCALE,
    vx: reader.i16() / VEL_SCALE,
    vy: reader.i16() / VEL_SCALE,
    vz: reader.i16() / VEL_SCALE,
  };
  const count = reader.u8();
  const players: SnapshotPlayer[] = [];
  for (let i = 0; i < count; i++) {
    players.push({
      slot: reader.u8(),
      lastSeq: reader.u32(),
      x: reader.i32() / POS_SCALE,
      y: reader.i32() / POS_SCALE,
      z: reader.i32() / POS_SCALE,
      vx: reader.i16() / VEL_SCALE,
      vz: reader.i16() / VEL_SCALE,
      yaw: reader.i16() / YAW_SCALE,
      cooldownTicks: reader.u16(),
      flags: reader.u8(),
      dirX: reader.i8() / 127,
      dirZ: reader.i8() / 127,
    });
  }
  return { tick, phase, phaseTicksRemaining, paused, clockTicksRemaining, scoreLeft, scoreRight, ball, players };
}

// ------------------------------------------------------------------- ping/pong

export function encodePing(writer: BufferWriter, clientTimeMs: number): Uint8Array {
  return writer.reset().u8(OP.PING).f64(clientTimeMs).toUint8Array();
}

export function encodePong(writer: BufferWriter, clientTimeMs: number, serverTick: number, serverTickFraction: number): Uint8Array {
  return writer.reset().u8(OP.PONG).f64(clientTimeMs).u32(serverTick).f32(serverTickFraction).toUint8Array();
}

export function decodePing(reader: BufferReader): { clientTimeMs: number } {
  return { clientTimeMs: reader.f64() };
}

export function decodePong(reader: BufferReader): { clientTimeMs: number; serverTick: number; serverTickFraction: number } {
  return { clientTimeMs: reader.f64(), serverTick: reader.u32(), serverTickFraction: reader.f32() };
}

export function readOpcode(data: ArrayBuffer | Uint8Array): { op: number; reader: BufferReader } {
  const reader = new BufferReader(data);
  return { op: reader.u8(), reader };
}
