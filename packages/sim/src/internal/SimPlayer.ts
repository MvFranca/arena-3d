import type { Collider, RigidBody } from "../physics/rapier";
import type { AbilityId, Loadout, PlayerInput, ResolvedStats, Team } from "../types";
import { EMPTY_INPUT } from "../types";

/** Estado mutavel de um jogador dentro da simulacao. Nao sai do pacote. */
export class SimPlayer {
  readonly id: string;
  readonly slot: number;
  readonly team: Team;
  readonly name: string;
  readonly loadout: Loadout;
  readonly stats: ResolvedStats;
  readonly abilityId: AbilityId | null;
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly baseMass: number;

  input: PlayerInput = { ...EMPTY_INPUT };
  prevKick = false;
  prevAbility = false;
  lastSeq = 0;
  connected = true;
  yaw = 0;

  kickBufferTicks = 0;
  kickRefractoryTicks = 0;
  kickedThisTick = false;

  cooldownTicks = 0;
  activeTicks = 0;
  shieldTicks = 0;
  kickChargeTicks = 0;
  kickChargeMultiplier = 1;
  speedCapMultiplier = 1;

  /** Ultimo tick em que tocou a bola. Usado para atribuir gol. */
  lastBallTouchTick = -1;

  constructor(args: {
    id: string;
    slot: number;
    team: Team;
    name: string;
    loadout: Loadout;
    stats: ResolvedStats;
    body: RigidBody;
    collider: Collider;
  }) {
    this.id = args.id;
    this.slot = args.slot;
    this.team = args.team;
    this.name = args.name;
    this.loadout = args.loadout;
    this.stats = args.stats;
    this.abilityId = args.loadout.abilityId;
    this.body = args.body;
    this.collider = args.collider;
    this.baseMass = args.stats.mass;
    this.yaw = args.team === "left" ? 0 : Math.PI;
  }

  resetTransient(): void {
    this.kickBufferTicks = 0;
    this.kickRefractoryTicks = 0;
    this.kickedThisTick = false;
    this.cooldownTicks = 0;
    this.activeTicks = 0;
    this.shieldTicks = 0;
    this.kickChargeTicks = 0;
    this.kickChargeMultiplier = 1;
    this.speedCapMultiplier = 1;
    this.collider.setMass(this.baseMass);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
}
