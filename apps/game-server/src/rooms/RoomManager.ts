import { getRuleset, RULESETS, type ArenaConfig } from "@arena/sim";
import { randomBytes } from "node:crypto";
import { config } from "../config";
import { resolveRoomMap } from "../platform";
import { MatchRoom, type MatchResultReport } from "./MatchRoom";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomManager {
  private readonly rooms = new Map<string, MatchRoom>();

  constructor(private readonly onResult: (report: MatchResultReport) => void) {}

  get count(): number {
    return this.rooms.size;
  }

  get capacity(): number {
    return config.maxRooms;
  }

  list(): MatchRoom[] {
    return [...this.rooms.values()];
  }

  get(code: string): MatchRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  async create(
    rulesetId: string,
    opts: { automatic?: boolean; reserved?: string[]; ticket?: string; ranked?: boolean; mapId?: string; arena?: ArenaConfig } = {},
  ): Promise<MatchRoom> {
    if (this.rooms.size >= config.maxRooms) throw new Error("server_full");
    if (!RULESETS[rulesetId]) throw new Error("unknown_ruleset");
    const ruleset = getRuleset(rulesetId);
    const ranked = opts.ranked ?? false;
    const resolved = opts.arena
      ? { mapId: opts.mapId ?? opts.arena.id, arena: opts.arena }
      : await resolveRoomMap(ranked ? ruleset.arenaId : opts.mapId, ranked, ruleset.arenaId);
    const code = this.uniqueCode();
    const room = new MatchRoom({
      code,
      ruleset,
      arena: resolved.arena,
      mapId: resolved.mapId,
      automatic: opts.automatic ?? false,
      reserved: opts.reserved,
      ticket: opts.ticket,
      ranked,
      onEmpty: (r) => this.rooms.delete(r.code),
      onResult: this.onResult,
    });
    this.rooms.set(code, room);
    return room;
  }

  tickAll(): void {
    for (const room of this.rooms.values()) room.tick();
  }

  /** Salas reservadas pelo matchmaking em que ninguem apareceu. */
  sweep(now: number): void {
    for (const room of this.rooms.values()) {
      if (room.playerCount === 0 && now - room.createdAt > config.emptyRoomTtlMs) room.destroy();
    }
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      const bytes = randomBytes(5);
      let code = "";
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("could_not_allocate_code");
  }
}
