import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { BlockBehaviourRegistry } from '../../world/BlockBehaviour';
import { getBlockBounds } from '../../world/BlockBehaviour';
import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import { AABB } from '../../physics/AABB';
import { CHUNK_SIZE_Y } from '../../world/chunkConstants';

/** Tiny separation skin so resting contact never re-overlaps a block face. */
const COLLISION_EPSILON = 0.001;

/** Axes are resolved Y first, then X, then Z (matches the existing, proven
 * item/player movers and gives stable landings). */
const AXIS_ORDER: readonly ('x' | 'y' | 'z')[] = ['y', 'x', 'z'];

/**
 * The minimal surface the physics mover needs from a body. `Entity` satisfies
 * this structurally, so every entity can be moved without a shared base
 * dependency beyond these fields.
 */
export interface PhysicsMovable {
  readonly position: { x: number; y: number; z: number };
  readonly velocity: { x: number; y: number; z: number };
  stepHeight: number;
  onGround: boolean;
  isCollidedHorizontally: boolean;
  isCollidedVertically: boolean;
  getAABB(): AABB;
}

/**
 * Shared, per-tick AABB-vs-world collision mover, mirroring Beta's
 * `Entity.moveEntity`.
 *
 * - Velocity is expressed in **blocks per tick**; the caller applies its own
 *   gravity/drag before calling `move` (Beta does the same in each entity's
 *   `onUpdate`), so nothing here forces a particular gravity or drag.
 * - Collision is resolved one axis at a time against **metadata-aware block
 *   bounds** (`getBlockBounds(..., 'collision')`), so non-full blocks such as
 *   slabs, doors and pressure plates collide correctly.
 * - Resolution is symmetric: the same swept test runs for positive and
 *   negative motion, so pushing either direction behaves identically.
 * - A blocked axis zeroes that velocity component (Beta zeroes `motionX/Y/Z`
 *   when the achieved offset differs from the requested one).
 * - Optional step-up (Beta `stepHeight`) lets grounded living entities climb
 *   single blocks without jumping.
 *
 * The mover never allocates per-frame state beyond the small swept boxes and
 * reuses the passed-in body's AABB via `getAABB`.
 */
export class EntityPhysics {
  public constructor(
    private readonly blockRegistry: BlockRegistry,
    private readonly behaviourRegistry: BlockBehaviourRegistry,
    private readonly world: BlockUpdateWorld,
  ) {}

  /** Moves `body` by its current velocity, resolving world collision. */
  public move(body: PhysicsMovable): void {
    const delta = { x: body.velocity.x, y: body.velocity.y, z: body.velocity.z };
    const requestedX = delta.x;
    const requestedZ = delta.z;
    const wasOnGround = body.onGround;

    let grounded = false;
    let collidedX = false;
    let collidedZ = false;
    let collidedY = false;

    for (const axis of AXIS_ORDER) {
      const box = body.getAABB();
      const resolved = this.resolveAxis(box, axis, delta[axis]);

      if (axis === 'x') {
        body.position.x += resolved;
        if (resolved !== delta.x) {
          collidedX = true;
          body.velocity.x = 0;
        }
      } else if (axis === 'z') {
        body.position.z += resolved;
        if (resolved !== delta.z) {
          collidedZ = true;
          body.velocity.z = 0;
        }
      } else {
        body.position.y += resolved;
        if (resolved !== delta.y) {
          collidedY = true;
          if (delta.y < 0) {
            grounded = true;
          }
          body.velocity.y = 0;
        }
      }
    }

    // Optional step-up: if a horizontal move was blocked while grounded and
    // the body can step, try to climb onto the obstacle and settle on top.
    if (body.stepHeight > 0 && wasOnGround && (collidedX || collidedZ)) {
      this.tryStepUp(body, collidedX ? requestedX : 0, collidedZ ? requestedZ : 0);
      // Re-derive grounded/collision state after the step attempt.
      grounded = this.isGrounded(body);
      collidedX = false;
      collidedZ = false;
    }

    body.onGround = grounded;
    body.isCollidedHorizontally = collidedX || collidedZ;
    body.isCollidedVertically = collidedY;
  }

  /**
   * Attempts to raise the body by up to `stepHeight`, move it horizontally by
   * the blocked amount, then settle it back down onto the step. Aborts (and
   * restores position) if the step would push into solid geometry or a
   * ceiling.
   */
  private tryStepUp(body: PhysicsMovable, dx: number, dz: number): void {
    const startX = body.position.x;
    const startY = body.position.y;
    const startZ = body.position.z;
    const step = body.stepHeight;

    // Raise.
    body.position.y += step;
    if (this.intersectsAnySolid(body.getAABB())) {
      // No headroom for the step; abort.
      body.position.x = startX;
      body.position.y = startY;
      body.position.z = startZ;
      return;
    }

    // Move horizontally at the raised height.
    if (dx !== 0) {
      const resolvedX = this.resolveAxis(body.getAABB(), 'x', dx);
      body.position.x += resolvedX;
    }
    if (dz !== 0) {
      const resolvedZ = this.resolveAxis(body.getAABB(), 'z', dz);
      body.position.z += resolvedZ;
    }

    // Settle back down onto the step (up to the full step height).
    const settled = this.resolveAxis(body.getAABB(), 'y', -step);
    body.position.y += settled;

    // If we ended up no higher than we started, the "step" was worthless.
    if (body.position.y <= startY + COLLISION_EPSILON) {
      body.position.x = startX;
      body.position.y = startY;
      body.position.z = startZ;
    }
  }

  /** True if a downward probe from the body immediately contacts solid ground. */
  private isGrounded(body: PhysicsMovable): boolean {
    const box = body.getAABB();
    const probe = this.resolveAxis(box, 'y', -COLLISION_EPSILON * 4);
    return probe > -COLLISION_EPSILON * 4;
  }

  /** Sweeps `box` by `distance` along `axis`, returning the achievable distance. */
  private resolveAxis(box: AABB, axis: 'x' | 'y' | 'z', distance: number): number {
    if (distance === 0) {
      return 0;
    }

    const movingPositive = distance > 0;
    const sweptBox = this.sweptBoxAlongAxis(box, axis, distance);
    const range = this.blockRangeCoveringBox(sweptBox);

    let allowed = distance;

    for (let bx = range.minX; bx <= range.maxX; bx++) {
      for (let by = range.minY; by <= range.maxY; by++) {
        for (let bz = range.minZ; bz <= range.maxZ; bz++) {
          if (by < 0 || by >= CHUNK_SIZE_Y) {
            continue;
          }
          const bounds = getBlockBounds(
            this.blockRegistry,
            this.behaviourRegistry,
            this.world,
            bx, by, bz,
            'collision',
          );
          for (const blockBox of bounds) {
            if (!this.overlapsOnOtherAxes(box, blockBox, axis)) {
              continue;
            }
            const limited = this.limitDistance(box, blockBox, axis, movingPositive);
            if (movingPositive) {
              allowed = Math.min(allowed, Math.max(0, limited));
            } else {
              allowed = Math.max(allowed, Math.min(0, limited));
            }
          }
        }
      }
    }

    return allowed;
  }

  /** True if `box` overlaps `blockBox` on the two axes other than `axis`. */
  private overlapsOnOtherAxes(box: AABB, blockBox: AABB, axis: 'x' | 'y' | 'z'): boolean {
    const xOverlap = axis === 'x' || (box.minX < blockBox.maxX && box.maxX > blockBox.minX);
    const yOverlap = axis === 'y' || (box.minY < blockBox.maxY && box.maxY > blockBox.minY);
    const zOverlap = axis === 'z' || (box.minZ < blockBox.maxZ && box.maxZ > blockBox.minZ);
    return xOverlap && yOverlap && zOverlap;
  }

  /** Distance along `axis` before `box` touches `blockBox`'s near face. */
  private limitDistance(box: AABB, blockBox: AABB, axis: 'x' | 'y' | 'z', movingPositive: boolean): number {
    if (axis === 'x') {
      return movingPositive ? blockBox.minX - box.maxX - COLLISION_EPSILON : blockBox.maxX - box.minX + COLLISION_EPSILON;
    }
    if (axis === 'y') {
      return movingPositive ? blockBox.minY - box.maxY - COLLISION_EPSILON : blockBox.maxY - box.minY + COLLISION_EPSILON;
    }
    return movingPositive ? blockBox.minZ - box.maxZ - COLLISION_EPSILON : blockBox.maxZ - box.minZ + COLLISION_EPSILON;
  }

  /** The box extended along `axis` by `distance`, for gathering candidates. */
  private sweptBoxAlongAxis(box: AABB, axis: 'x' | 'y' | 'z', distance: number): AABB {
    const dx = axis === 'x' ? distance : 0;
    const dy = axis === 'y' ? distance : 0;
    const dz = axis === 'z' ? distance : 0;
    const moved = box.translated(dx, dy, dz);
    return new AABB(
      Math.min(box.minX, moved.minX),
      Math.min(box.minY, moved.minY),
      Math.min(box.minZ, moved.minZ),
      Math.max(box.maxX, moved.maxX),
      Math.max(box.maxY, moved.maxY),
      Math.max(box.maxZ, moved.maxZ),
    );
  }

  /** Inclusive integer block range covering a world-space box. */
  private blockRangeCoveringBox(box: AABB): {
    minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
  } {
    return {
      minX: Math.floor(box.minX),
      maxX: Math.ceil(box.maxX) - 1,
      minY: Math.floor(box.minY),
      maxY: Math.ceil(box.maxY) - 1,
      minZ: Math.floor(box.minZ),
      maxZ: Math.ceil(box.maxZ) - 1,
    };
  }

  /** True if `box` overlaps any solid block's collision bounds. */
  private intersectsAnySolid(box: AABB): boolean {
    const range = this.blockRangeCoveringBox(box);
    for (let bx = range.minX; bx <= range.maxX; bx++) {
      for (let by = range.minY; by <= range.maxY; by++) {
        for (let bz = range.minZ; bz <= range.maxZ; bz++) {
          if (by < 0 || by >= CHUNK_SIZE_Y) {
            continue;
          }
          const bounds = getBlockBounds(
            this.blockRegistry,
            this.behaviourRegistry,
            this.world,
            bx, by, bz,
            'collision',
          );
          for (const blockBox of bounds) {
            if (box.intersects(blockBox)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }
}
