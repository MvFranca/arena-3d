import RAPIER from "@dimforge/rapier3d-compat";

let ready: Promise<void> | null = null;

/**
 * Inicializa o WASM do Rapier. Deve ser aguardado uma vez por processo
 * (browser ou Node) antes de criar qualquer MatchSimulation.
 */
export function initPhysics(): Promise<void> {
  if (!ready) ready = RAPIER.init();
  return ready;
}

export { RAPIER };
export type RapierWorld = RAPIER.World;
export type RigidBody = RAPIER.RigidBody;
export type Collider = RAPIER.Collider;
