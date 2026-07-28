import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { BlockBehaviourRegistry } from '../world/BlockBehaviour';
import { getBlockBounds } from '../world/BlockBehaviour';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';
import { CHUNK_SIZE_Y } from '../world/chunkConstants';
import { AABB } from './AABB';

export interface CollisionBody {
  readonly position: { x: number; y: number; z: number };
  getAABB(): AABB;
}

export interface CollisionMoveOptions {
  readonly stepHeight?: number;
  readonly wasGrounded?: boolean;
}

export interface CollisionMoveResult {
  readonly requestedX: number;
  readonly requestedY: number;
  readonly requestedZ: number;
  readonly movedX: number;
  readonly movedY: number;
  readonly movedZ: number;
  readonly collidedX: boolean;
  readonly collidedY: boolean;
  readonly collidedZ: boolean;
  readonly collidedHorizontally: boolean;
  readonly collidedVertically: boolean;
  readonly grounded: boolean;
  readonly stepped: boolean;
}

const MOVEMENT_EPSILON = 1e-10;

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > MOVEMENT_EPSILON;
}

/**
 * Shared Beta 1.7.3 AABB mover.
 *
 * Mirrors `Entity.moveEntity`'s collision core: collect block AABBs from the
 * full requested swept volume, resolve Y then X then Z with
 * AxisAlignedBB.calculate*Offset, and optionally compare the normal path with a
 * step-height path. PlayerPhysics and EntityPhysics both route through this so
 * partial-block collisions cannot diverge.
 */
export class BetaCollisionMover {
  public constructor(
    private readonly blockRegistry: BlockRegistry,
    private readonly behaviourRegistry: BlockBehaviourRegistry,
    private readonly world: BlockUpdateWorld,
  ) {}

  public move(body: CollisionBody, dx: number, dy: number, dz: number, options: CollisionMoveOptions = {}): CollisionMoveResult {
    const startX = body.position.x;
    const startY = body.position.y;
    const startZ = body.position.z;
    const originalBox = body.getAABB();

    const normal = this.resolveFromBox(originalBox, dx, dy, dz);
    let chosen = normal;
    let stepped = false;

    const stepHeight = Math.max(0, options.stepHeight ?? 0);
    const wasGrounded = options.wasGrounded ?? false;
    const canTryStep = stepHeight > 0
      && (wasGrounded || (differs(dy, normal.y) && dy < 0))
      && (differs(dx, normal.x) || differs(dz, normal.z));

    if (canTryStep) {
      const step = this.resolveStepPath(originalBox, dx, dz, stepHeight);
      if (step !== undefined) {
        const normalDistanceSq = normal.x * normal.x + normal.z * normal.z;
        const stepDistanceSq = step.x * step.x + step.z * step.z;
        if (stepDistanceSq > normalDistanceSq + MOVEMENT_EPSILON) {
          chosen = step;
          stepped = true;
        }
      }
    }

    body.position.x = startX + chosen.x;
    body.position.y = startY + chosen.y;
    body.position.z = startZ + chosen.z;

    const collidedX = differs(dx, chosen.x);
    const collidedY = differs(dy, chosen.y);
    const collidedZ = differs(dz, chosen.z);
    const grounded = collidedY && dy < 0;

    return {
      requestedX: dx,
      requestedY: dy,
      requestedZ: dz,
      movedX: chosen.x,
      movedY: chosen.y,
      movedZ: chosen.z,
      collidedX,
      collidedY,
      collidedZ,
      collidedHorizontally: collidedX || collidedZ,
      collidedVertically: collidedY,
      grounded,
      stepped,
    };
  }

  public intersectsAnySolid(box: AABB): boolean {
    const range = this.blockRangeCoveringBox(box);
    for (let bx = range.minX; bx <= range.maxX; bx++) {
      for (let by = range.minY; by <= range.maxY; by++) {
        for (let bz = range.minZ; bz <= range.maxZ; bz++) {
          if (by < 0 || by >= CHUNK_SIZE_Y) continue;
          const bounds = getBlockBounds(this.blockRegistry, this.behaviourRegistry, this.world, bx, by, bz, 'collision');
          for (const bound of bounds) if (box.intersects(bound)) return true;
        }
      }
    }
    return false;
  }

  private resolveFromBox(originalBox: AABB, dx: number, dy: number, dz: number): { readonly x: number; readonly y: number; readonly z: number; readonly box: AABB } {
    const boxes = this.getCollidingBlockBounds(originalBox.addCoord(dx, dy, dz));
    const box = originalBox.copy();
    let moveX = dx;
    let moveY = dy;
    let moveZ = dz;

    for (const blockBox of boxes) moveY = blockBox.calculateYOffset(box, moveY);
    box.offset(0, moveY, 0);

    for (const blockBox of boxes) moveX = blockBox.calculateXOffset(box, moveX);
    box.offset(moveX, 0, 0);

    for (const blockBox of boxes) moveZ = blockBox.calculateZOffset(box, moveZ);
    box.offset(0, 0, moveZ);

    return { x: moveX, y: moveY, z: moveZ, box };
  }

  private resolveStepPath(originalBox: AABB, dx: number, dz: number, stepHeight: number): { readonly x: number; readonly y: number; readonly z: number; readonly box: AABB } | undefined {
    const boxes = this.getCollidingBlockBounds(originalBox.addCoord(dx, stepHeight, dz));
    const box = originalBox.copy();
    let moveX = dx;
    let moveY = stepHeight;
    let moveZ = dz;

    for (const blockBox of boxes) moveY = blockBox.calculateYOffset(box, moveY);
    box.offset(0, moveY, 0);
    if (moveY <= 0) return undefined;

    for (const blockBox of boxes) moveX = blockBox.calculateXOffset(box, moveX);
    box.offset(moveX, 0, 0);

    for (const blockBox of boxes) moveZ = blockBox.calculateZOffset(box, moveZ);
    box.offset(0, 0, moveZ);

    let settleY = -moveY;
    for (const blockBox of boxes) settleY = blockBox.calculateYOffset(box, settleY);
    box.offset(0, settleY, 0);

    const totalY = moveY + settleY;
    if (totalY <= MOVEMENT_EPSILON || totalY > stepHeight + MOVEMENT_EPSILON) return undefined;
    return { x: moveX, y: totalY, z: moveZ, box };
  }

  private getCollidingBlockBounds(sweptBox: AABB): AABB[] {
    const bounds: AABB[] = [];
    const range = this.blockRangeCoveringBox(sweptBox);
    for (let bx = range.minX; bx <= range.maxX; bx++) {
      for (let by = range.minY; by <= range.maxY; by++) {
        for (let bz = range.minZ; bz <= range.maxZ; bz++) {
          if (by < 0 || by >= CHUNK_SIZE_Y) continue;
          bounds.push(...getBlockBounds(this.blockRegistry, this.behaviourRegistry, this.world, bx, by, bz, 'collision'));
        }
      }
    }
    return bounds;
  }

  private blockRangeCoveringBox(box: AABB): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } {
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
