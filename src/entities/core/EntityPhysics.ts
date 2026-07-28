import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { BlockBehaviourRegistry } from '../../world/BlockBehaviour';
import { getBlockBounds } from '../../world/BlockBehaviour';
import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import { AABB } from '../../physics/AABB';
import { BetaCollisionMover } from '../../physics/BetaCollisionMover';
import { CHUNK_SIZE_Y } from '../../world/chunkConstants';

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
  private readonly collisionMover: BetaCollisionMover;

  public constructor(
    private readonly blockRegistry: BlockRegistry,
    private readonly behaviourRegistry: BlockBehaviourRegistry,
    private readonly world: BlockUpdateWorld,
  ) {
    this.collisionMover = new BetaCollisionMover(blockRegistry, behaviourRegistry, world);
  }

  /** Moves `body` by its current velocity, resolving world collision. */
  public move(body: PhysicsMovable): void {
    const result = this.collisionMover.move(body, body.velocity.x, body.velocity.y, body.velocity.z, {
      stepHeight: body.stepHeight,
      wasGrounded: body.onGround,
    });

    if (result.collidedX) body.velocity.x = 0;
    if (result.collidedY) body.velocity.y = 0;
    if (result.collidedZ) body.velocity.z = 0;

    body.onGround = result.grounded;
    body.isCollidedHorizontally = result.collidedHorizontally;
    body.isCollidedVertically = result.collidedVertically;
    this.dispatchBlockCollisionHooks(body);
  }

  private dispatchBlockCollisionHooks(body: PhysicsMovable): void {
    const box = body.getAABB();
    const range = this.blockRangeCoveringBox(box);
    for (let bx = range.minX; bx <= range.maxX; bx++) {
      for (let by = range.minY; by <= range.maxY; by++) {
        for (let bz = range.minZ; bz <= range.maxZ; bz++) {
          if (by < 0 || by >= CHUNK_SIZE_Y) continue;
          const blockId = this.world.getBlock(bx, by, bz);
          const behaviour = this.behaviourRegistry.get(blockId);
          if (behaviour.onEntityCollidedWithBlock === undefined) continue;
          const bounds = getBlockBounds(this.blockRegistry, this.behaviourRegistry, this.world, bx, by, bz, 'interaction');
          if (bounds.some((bound) => box.intersects(bound))) {
            behaviour.onEntityCollidedWithBlock({ world: this.world, gameTick: 0 } as any, bx, by, bz, box, body);
          }
        }
      }
    }
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

}