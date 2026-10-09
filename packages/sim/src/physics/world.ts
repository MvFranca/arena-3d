import type { ArenaConfig } from "../config/arenas";
import { BALL, FIXED_DT, GRAVITY, PLAYER, PLAYER_CENTER_Y, playerWalkBounds } from "../config/tuning";
import type { ResolvedStats } from "../types";
import { RAPIER, type Collider, type RapierWorld, type RigidBody } from "./rapier";

export interface PlayerBody {
  body: RigidBody;
  collider: Collider;
  baseMass: number;
}

export interface BallBody {
  body: RigidBody;
  collider: Collider;
}

/** Membership/filter empacotados no formato Rapier (16 + 16 bits). */
export const COLLISION = {
  ENV: 0x0001,
  WALL_BALL: 0x0002,
  WALL_PLAYER: 0x0004,
  PLAYER: 0x0008,
  BALL: 0x0010,
} as const;

export function collisionGroups(membership: number, filter: number): number {
  return (membership & 0xffff) | ((filter & 0xffff) << 16);
}

const GROUPS_ENV = collisionGroups(COLLISION.ENV, COLLISION.PLAYER | COLLISION.BALL);
const GROUPS_WALL_BALL = collisionGroups(COLLISION.WALL_BALL, COLLISION.BALL);
const GROUPS_WALL_PLAYER = collisionGroups(COLLISION.WALL_PLAYER, COLLISION.PLAYER);
/** Trave e rede: a bola quica e o jogador não atravessa. */
const GROUPS_GOAL = collisionGroups(COLLISION.WALL_BALL | COLLISION.WALL_PLAYER, COLLISION.BALL | COLLISION.PLAYER);
const GROUPS_PLAYER = collisionGroups(
  COLLISION.PLAYER,
  COLLISION.ENV | COLLISION.WALL_PLAYER | COLLISION.PLAYER | COLLISION.BALL,
);
const GROUPS_BALL = collisionGroups(COLLISION.BALL, COLLISION.ENV | COLLISION.WALL_BALL | COLLISION.PLAYER);

/** Cria o mundo e todos os colliders estaticos da arena. */
export function createArenaWorld(arena: ArenaConfig): RapierWorld {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = FIXED_DT;

  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const addBox = (
    hx: number,
    hy: number,
    hz: number,
    x: number,
    y: number,
    z: number,
    restitution: number,
    friction: number,
    groups: number,
  ) => {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, y, z)
        .setRestitution(restitution)
        .setFriction(friction)
        .setCollisionGroups(groups),
      fixed,
    );
  };

  const L = arena.halfLength;
  const W = arena.halfWidth;
  const H = arena.wallHeight;
  const thick = 0.5;
  const wallR = arena.wallRestitution;
  const walk = playerWalkBounds(arena);

  // Chao e teto: ambos, para a bola nao cair/furar o teto.
  addBox(walk.halfLength + 2, thick, walk.halfWidth + 2, 0, -thick, 0, 0.2, arena.floorFriction, GROUPS_ENV);
  addBox(walk.halfLength + 2, thick, walk.halfWidth + 2, 0, arena.ceilingHeight + thick, 0, 0.1, 0.2, GROUPS_ENV);

  // Laterais internas: so a bola. Jogador atravessa para o corredor.
  addBox(L + thick, H / 2, thick, 0, H / 2, W + thick, wallR, 0.1, GROUPS_WALL_BALL);
  addBox(L + thick, H / 2, thick, 0, H / 2, -(W + thick), wallR, 0.1, GROUPS_WALL_BALL);

  // Fundos com abertura para o gol + bolsa: so a bola. Jogador entra no gol e circula atras.
  const sideSeg = (W - arena.goalHalfWidth) / 2;
  const segCenterZ = arena.goalHalfWidth + sideSeg;
  for (const side of [-1, 1]) {
    const x = side * (L + thick);
    addBox(thick, H / 2, sideSeg, x, H / 2, segCenterZ, wallR, 0.1, GROUPS_WALL_BALL);
    addBox(thick, H / 2, sideSeg, x, H / 2, -segCenterZ, wallR, 0.1, GROUPS_WALL_BALL);
    const barH = Math.max(0.05, (arena.ceilingHeight - arena.goalHeight) / 2);
    addBox(thick, barH, arena.goalHalfWidth, x, arena.goalHeight + barH, 0, wallR, 0.1, GROUPS_WALL_BALL);
    const depth = arena.goalDepth;
    const backX = side * (L + depth + thick);
    addBox(thick, arena.goalHeight / 2, arena.goalHalfWidth + thick, backX, arena.goalHeight / 2, 0, 0.1, 0.8, GROUPS_GOAL);
    const sideX = side * (L + depth / 2);
    addBox(depth / 2, arena.goalHeight / 2, thick, sideX, arena.goalHeight / 2, arena.goalHalfWidth + thick, 0.1, 0.8, GROUPS_GOAL);
    addBox(depth / 2, arena.goalHeight / 2, thick, sideX, arena.goalHeight / 2, -(arena.goalHalfWidth + thick), 0.1, 0.8, GROUPS_GOAL);
    const roofX = side * (L + depth / 2 + thick);
    addBox(depth / 2 + thick, thick / 2, arena.goalHalfWidth + thick, roofX, arena.goalHeight + thick / 2, 0, 0.1, 0.8, GROUPS_WALL_BALL);
    const postR = 0.2;
    for (const z of [-arena.goalHalfWidth, arena.goalHalfWidth]) {
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(arena.goalHeight / 2, postR)
          .setTranslation(side * L, arena.goalHeight / 2, z)
          .setRestitution(wallR)
          .setFriction(0.2)
          .setCollisionGroups(GROUPS_GOAL),
        fixed,
      );
    }
  }

  // Limite externo retangular: so o jogador. Bola ja esta contida nas paredes internas.
  addBox(walk.halfLength + thick, H / 2, thick, 0, H / 2, walk.halfWidth + thick, 0.15, 0.2, GROUPS_WALL_PLAYER);
  addBox(walk.halfLength + thick, H / 2, thick, 0, H / 2, -(walk.halfWidth + thick), 0.15, 0.2, GROUPS_WALL_PLAYER);
  addBox(thick, H / 2, walk.halfWidth + thick, walk.halfLength + thick, H / 2, 0, 0.15, 0.2, GROUPS_WALL_PLAYER);
  addBox(thick, H / 2, walk.halfWidth + thick, -(walk.halfLength + thick), H / 2, 0, 0.15, 0.2, GROUPS_WALL_PLAYER);

  return world;
}

export function createPlayerBody(world: RapierWorld, stats: ResolvedStats, x: number, z: number): PlayerBody {
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, PLAYER_CENTER_Y, z)
    .lockRotations()
    .enabledTranslations(true, false, true)
    .setGravityScale(0)
    .setLinearDamping(PLAYER.linearDamping)
    .setCcdEnabled(false);
  const body = world.createRigidBody(desc);
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius)
      .setMass(stats.mass)
      .setFriction(PLAYER.friction)
      .setRestitution(PLAYER.restitution)
      .setCollisionGroups(GROUPS_PLAYER),
    body,
  );
  return { body, collider, baseMass: stats.mass };
}

export function createBallBody(world: RapierWorld): BallBody {
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, BALL.radius, 0)
    .setLinearDamping(BALL.linearDamping)
    .setAngularDamping(BALL.angularDamping)
    .setCcdEnabled(true);
  const body = world.createRigidBody(desc);
  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(BALL.radius)
      .setMass(BALL.mass)
      .setFriction(BALL.friction)
      .setRestitution(BALL.restitution)
      .setCollisionGroups(GROUPS_BALL),
    body,
  );
  return { body, collider };
}

export function clampHorizontalSpeed(body: RigidBody, max: number): void {
  const v = body.linvel();
  const speed = Math.hypot(v.x, v.z);
  if (speed > max) {
    const s = max / speed;
    body.setLinvel({ x: v.x * s, y: v.y, z: v.z * s }, true);
  }
}

export function clampSpeed3(body: RigidBody, max: number): void {
  const v = body.linvel();
  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed > max) {
    const s = max / speed;
    body.setLinvel({ x: v.x * s, y: v.y * s, z: v.z * s }, true);
  }
}
