import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import { findRailAtOrBelow, type RailBlockInfo, type RailShapeDefinition } from '../../world/rails/RailShapes';

export const MINECART_MAX_RAIL_SPEED = 0.6;
export const MINECART_EMPTY_DRAG = 0.9599999785423279;
export const MINECART_OCCUPIED_DRAG = 0.996999979019165;
export const MINECART_OFF_RAIL_DRAG = 0.98;
export const MINECART_GRAVITY = 0.03999999910593033;
export const MINECART_SLOPE_ACCELERATION = 0.012;
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

// ---------------------------------------------------------------- pushing
//
// Beta `EntityMinecart` carries a `pushX`/`pushZ` vector: the direction a
// player last shoved the cart in. It survives across ticks, is renormalised
// each tick, and is zeroed when it opposes actual motion. Without it a cart
// cannot be pushed along a track at all, which is why this was the most
// visible gap in the previous simplified implementation.

/** Beta's `> 0.01D` significance threshold for the push vector. */
export const MINECART_PUSH_EPSILON = 0.01;
/** Beta `var41`: push acceleration applied per tick while pushing. */
export const MINECART_PUSH_ACCELERATION = 0.04;
/** Beta drag applied to a cart being actively pushed. */
export const MINECART_PUSHED_DRAG = 0.8;
/** Beta drag applied to a powered cart with no meaningful push vector. */
export const MINECART_UNPUSHED_DRAG = 0.9;

export interface MinecartPush { x: number; z: number }

/**
 * Beta's post-move push reconciliation:
 *
 *   if |push| > 0.01 and speed^2 > 0.001:
 *     normalise push
 *     if push . motion < 0  -> clear push (player is behind the motion)
 *     else                  -> push = motion (keep shoving the same way)
 */
export function reconcileMinecartPush(
  push: MinecartPush,
  velocity: { readonly x: number; readonly z: number },
): void {
  const magnitude = Math.hypot(push.x, push.z);
  if (magnitude <= MINECART_PUSH_EPSILON) return;
  if (velocity.x * velocity.x + velocity.z * velocity.z <= 0.001) return;
  const nx = push.x / magnitude;
  const nz = push.z / magnitude;
  if (nx * velocity.x + nz * velocity.z < 0) {
    push.x = 0;
    push.z = 0;
  } else {
    push.x = velocity.x;
    push.z = velocity.z;
  }
}

/**
 * Beta's rail-borne drag step for an unridden cart, including the push
 * acceleration branch. Returns whether the cart was actively pushed.
 */
export function applyMinecartPushDrag(
  push: MinecartPush,
  velocity: { x: number; y: number; z: number },
): boolean {
  const magnitude = Math.hypot(push.x, push.z);
  if (magnitude > MINECART_PUSH_EPSILON) {
    push.x /= magnitude;
    push.z /= magnitude;
    velocity.x *= MINECART_PUSHED_DRAG;
    velocity.y = 0;
    velocity.z *= MINECART_PUSHED_DRAG;
    velocity.x += push.x * MINECART_PUSH_ACCELERATION;
    velocity.z += push.z * MINECART_PUSH_ACCELERATION;
    return true;
  }
  velocity.x *= MINECART_UNPUSHED_DRAG;
  velocity.y = 0;
  velocity.z *= MINECART_UNPUSHED_DRAG;
  return false;
}

// ------------------------------------------------------------ orientation
//
// Beta derives yaw from the *previous-to-current* position delta rather than
// from velocity, and flips 180 degrees (toggling `isInReverse`) when the yaw
// delta crosses +/-170 degrees. That flip is what stops the cart model
// spinning wildly as it reverses through a curve.

/** Beta's reverse-flip threshold in degrees. */
export const MINECART_REVERSE_FLIP_DEGREES = 170;

export interface MinecartYawResult {
  readonly yaw: number;
  readonly isInReverse: boolean;
}

/**
 * Beta's yaw update from `onUpdate`'s tail:
 *
 *   dx = prevX - x; dz = prevZ - z
 *   if dx*dx + dz*dz > 0.001: yaw = atan2(dz, dx) * 180/PI  (+180 if reversed)
 *   then if the wrapped delta from prevYaw is outside +/-170, flip 180.
 */
export function updateMinecartYaw(
  previousX: number,
  previousZ: number,
  x: number,
  z: number,
  currentYaw: number,
  previousYaw: number,
  isInReverse: boolean,
): MinecartYawResult {
  let yaw = currentYaw;
  let reverse = isInReverse;
  const dx = previousX - x;
  const dz = previousZ - z;
  if (dx * dx + dz * dz > 0.001) {
    yaw = Math.atan2(dz, dx) * 180 / Math.PI;
    if (reverse) yaw += 180;
  }
  let delta = yaw - previousYaw;
  while (delta >= 180) delta -= 360;
  while (delta < -180) delta += 360;
  if (delta < -MINECART_REVERSE_FLIP_DEGREES || delta >= MINECART_REVERSE_FLIP_DEGREES) {
    yaw += 180;
    reverse = !reverse;
  }
  return { yaw, isInReverse: reverse };
}
