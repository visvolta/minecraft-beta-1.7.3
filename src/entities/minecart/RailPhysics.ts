import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import { findRailAtOrBelow, type RailBlockInfo, type RailShapeDefinition } from '../../world/rails/RailShapes';

export const MINECART_MAX_RAIL_SPEED = 0.4;
export const MINECART_EMPTY_DRAG = 0.9599999785423279;
export const MINECART_OCCUPIED_DRAG = 0.996999979019165;
export const MINECART_OFF_RAIL_DRAG = 0.98;
export const MINECART_GRAVITY = 0.03999999910593033;
export const MINECART_SLOPE_ACCELERATION = 0.0078125;
export const POWERED_RAIL_ACCELERATION = 0.06;
export const UNPOWERED_RAIL_BRAKE = 0.5;
export const POWERED_RAIL_START_SPEED = 0.02;
export const MINECART_WIDTH = 0.98;
export const MINECART_HEIGHT = 0.7;
export const MINECART_DAMAGE_THRESHOLD = 40;
export const MINECART_RAIL_BASE_Y_OFFSET = 0.02;

export interface RailProjection {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RailEndpoints {
  readonly start: RailProjection;
  readonly end: RailProjection;
}

export function findMinecartRail(world: BlockUpdateWorld, x: number, y: number, z: number): RailBlockInfo | undefined {
  return findRailAtOrBelow(world, x, y, z);
}

export function getRailEndpoints(rail: RailBlockInfo): RailEndpoints {
  return {
    start: endpointToWorld(rail, rail.shape.start),
    end: endpointToWorld(rail, rail.shape.end),
  };
}

function endpointToWorld(rail: RailBlockInfo, endpoint: RailShapeDefinition['start']): RailProjection {
  return {
    x: rail.x + 0.5 + endpoint.x * 0.5,
    y: rail.y + 0.5 + endpoint.y * 0.5,
    z: rail.z + 0.5 + endpoint.z * 0.5,
  };
}

export function projectMinecartToRail(x: number, y: number, z: number, rail: RailBlockInfo): RailProjection {
  const endpoints = getRailEndpoints(rail);
  const dx = endpoints.end.x - endpoints.start.x;
  const dz = endpoints.end.z - endpoints.start.z;
  let t: number;
  if (Math.abs(dx) < 1e-12) {
    t = z - rail.z;
  } else if (Math.abs(dz) < 1e-12) {
    t = x - rail.x;
  } else {
    const lx = x - endpoints.start.x;
    const lz = z - endpoints.start.z;
    t = (lx * dx + lz * dz) * 2;
  }

  const px = endpoints.start.x + dx * t;
  const pz = endpoints.start.z + dz * t;

  return {
    x: px,
    y: Number.isFinite(y) ? getMinecartBaseYOnRail(px, pz, rail) : rail.y + MINECART_RAIL_BASE_Y_OFFSET,
    z: pz,
  };
}

export function getMinecartBaseYOnRail(x: number, z: number, rail: RailBlockInfo): number {
  let rise = 0;
  switch (rail.shape.metadata) {
    case 2:
      rise = clamp01(x - rail.x);
      break;
    case 3:
      rise = 1 - clamp01(x - rail.x);
      break;
    case 4:
      rise = 1 - clamp01(z - rail.z);
      break;
    case 5:
      rise = clamp01(z - rail.z);
      break;
  }
  return rail.y + MINECART_RAIL_BASE_Y_OFFSET + rise;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function alignVelocityToRail(
  velocity: { x: number; z: number },
  rail: RailBlockInfo,
): { x: number; z: number } {
  const endpoints = getRailEndpoints(rail);
  let dx = endpoints.end.x - endpoints.start.x;
  let dz = endpoints.end.z - endpoints.start.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-12) return { x: 0, z: 0 };
  const dot = velocity.x * dx + velocity.z * dz;
  if (dot < 0) {
    dx = -dx;
    dz = -dz;
  }
  const speed = Math.hypot(velocity.x, velocity.z);
  return { x: speed * dx / length, z: speed * dz / length };
}

export function applySlopeAcceleration(velocity: { x: number; z: number }, shape: RailShapeDefinition): void {
  switch (shape.metadata) {
    case 2:
      velocity.x -= MINECART_SLOPE_ACCELERATION;
      break;
    case 3:
      velocity.x += MINECART_SLOPE_ACCELERATION;
      break;
    case 4:
      velocity.z += MINECART_SLOPE_ACCELERATION;
      break;
    case 5:
      velocity.z -= MINECART_SLOPE_ACCELERATION;
      break;
  }
}

export function applyPoweredRailEffect(
  world: BlockUpdateWorld,
  rail: RailBlockInfo,
  velocity: { x: number; y: number; z: number },
): void {
  if (!rail.poweredRail) return;
  if (!rail.active) {
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed < 0.03) {
      velocity.x = 0;
      velocity.y = 0;
      velocity.z = 0;
    } else {
      velocity.x *= UNPOWERED_RAIL_BRAKE;
      velocity.y = 0;
      velocity.z *= UNPOWERED_RAIL_BRAKE;
    }
    return;
  }

  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed > 0.01) {
    velocity.x += velocity.x / speed * POWERED_RAIL_ACCELERATION;
    velocity.z += velocity.z / speed * POWERED_RAIL_ACCELERATION;
    return;
  }

  if (rail.shape.metadata === 1) {
    if (world.isNormalCube(rail.x - 1, rail.y, rail.z)) velocity.x = POWERED_RAIL_START_SPEED;
    else if (world.isNormalCube(rail.x + 1, rail.y, rail.z)) velocity.x = -POWERED_RAIL_START_SPEED;
  } else if (rail.shape.metadata === 0) {
    if (world.isNormalCube(rail.x, rail.y, rail.z - 1)) velocity.z = POWERED_RAIL_START_SPEED;
    else if (world.isNormalCube(rail.x, rail.y, rail.z + 1)) velocity.z = -POWERED_RAIL_START_SPEED;
  }
}

export function clampHorizontalVelocity(velocity: { x: number; z: number }, max = MINECART_MAX_RAIL_SPEED): void {
  velocity.x = Math.max(-max, Math.min(max, velocity.x));
  velocity.z = Math.max(-max, Math.min(max, velocity.z));
}

export function railYawRadians(shape: RailShapeDefinition): number {
  if (shape.direction.x !== 0 || shape.direction.z !== 0) {
    return Math.atan2(shape.direction.x, shape.direction.z);
  }
  return 0;
}
