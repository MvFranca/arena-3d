import type { ArenaConfig } from "../config/arenas";
import { BALL, FIXED_DT, GRAVITY, PLAYER, PLAYER_CENTER_Y } from "../config/tuning";
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

/** Cria o mundo e todos os colliders estaticos da arena. */
export function createArenaWorld(arena: ArenaConfig): RapierWorld {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = FIXED_DT;

  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const addBox = (hx: number, hy: number, hz: number, x: number, y: number, z: number, restitution: number, friction: number) => {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRestitution(restitution).setFriction(friction),
      fixed,
    );
  };

  const L = arena.halfLength;
  const W = arena.halfWidth;
  const H = arena.wallHeight;
  const thick = 0.5;
  const wallR = arena.wallRestitution;

  // Chao e teto
  addBox(L + arena.goalDepth + 2, thick, W + 2, 0, -thick, 0, 0.2, arena.floorFriction);
  addBox(L + arena.goalDepth + 2, thick, W + 2, 0, arena.ceilingHeight + thick, 0, 0.1, 0.2);

  // Laterais (eixo Z)
  addBox(L + thick, H / 2, thick, 0, H / 2, W + thick, wallR, 0.1);
  addBox(L + thick, H / 2, thick, 0, H / 2, -(W + thick), wallR, 0.1);

  // Fundos com abertura para o gol
  const sideSeg = (W - arena.goalHalfWidth) / 2;
  const segCenterZ = arena.goalHalfWidth + sideSeg;
  for (const side of [-1, 1]) {
    const x = side * (L + thick);
    addBox(thick, H / 2, sideSeg, x, H / 2, segCenterZ, wallR, 0.1);
    addBox(thick, H / 2, sideSeg, x, H / 2, -segCenterZ, wallR, 0.1);
    // Travessao: do topo do gol ate o topo da parede
    const barH = Math.max(0.05, (arena.ceilingHeight - arena.goalHeight) / 2);
    addBox(thick, barH, arena.goalHalfWidth, x, arena.goalHeight + barH, 0, wallR, 0.1);
    // Bolsa do gol: fundo e laterais, para a bola parar dentro
    const depth = arena.goalDepth;
    const backX = side * (L + depth + thick);
    addBox(thick, arena.goalHeight / 2, arena.goalHalfWidth + thick, backX, arena.goalHeight / 2, 0, 0.1, 0.8);
    const sideX = side * (L + depth / 2 + thick);
    addBox(depth / 2, arena.goalHeight / 2, thick, sideX, arena.goalHeight / 2, arena.goalHalfWidth + thick, 0.1, 0.8);
    addBox(depth / 2, arena.goalHeight / 2, thick, sideX, arena.goalHeight / 2, -(arena.goalHalfWidth + thick), 0.1, 0.8);
    // Teto da bolsa (rede)
    addBox(depth / 2 + thick, thick / 2, arena.goalHalfWidth + thick, sideX, arena.goalHeight + thick / 2, 0, 0.1, 0.8);
  }

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
      .setRestitution(PLAYER.restitution),
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
    RAPIER.ColliderDesc.ball(BALL.radius).setMass(BALL.mass).setFriction(BALL.friction).setRestitution(BALL.restitution),
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
