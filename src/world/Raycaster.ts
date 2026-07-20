import { AIR_BLOCK_ID, CHUNK_SIZE_Y } from './chunkConstants';
import type { BlockDefinition } from '../blocks/BlockDefinition';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ChunkManager } from './ChunkManager';
import type { BlockBehaviourRegistry } from './BlockBehaviour';
import { getBlockBounds } from './BlockBehaviour';
import type { BlockUpdateWorld } from './BlockUpdateWorld';
import type { AABB } from '../physics/AABB';
import { worldToChunkLocal } from './worldToChunkCoords';

/** Unit axis-aligned face normal. Exactly one component is +/-1. */
export interface FaceNormal {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Integer world-space block coordinates. */
export interface BlockPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Result of a successful raycast against block geometry. */
export interface RaycastHit {
  /** Integer coordinates of the hit block. */
  readonly blockPos: BlockPosition;
  /** Outward-facing normal of the face that was hit. */
  readonly face: FaceNormal;
  /** Distance travelled along the ray from its origin, in blocks. */
  readonly distance: number;
  /** Definition of the block that was hit (from the BlockRegistry). */
  readonly blockDefinition: BlockDefinition;
  /** The specific AABB hit. */
  readonly hitAabb: AABB;
}

/**
 * Casts rays against block geometry using 3D DDA (Amanatides & Woo voxel
 * traversal): steps exactly one voxel boundary at a time along whichever
 * axis is nearest, rather than sampling at small fixed increments. This is
 * exact (no tunnelling through thin gaps) and its cost is proportional to
 * the number of voxels actually crossed, not the ray length divided by an
 * arbitrary step size.
 *
 * Reports the first non-Air block hit. Whether that block can be broken or
 * placed against is a decision for the caller (e.g. InteractionController),
 * not this class.
 */
export class Raycaster {
  public constructor(
    private readonly chunkManager: ChunkManager,
    private readonly blockRegistry: BlockRegistry,
    private readonly behaviourRegistry: BlockBehaviourRegistry,
    private readonly blockUpdateWorld: BlockUpdateWorld
  ) {}

  /**
   * Casts a ray from `origin` along `direction` (need not be normalized)
   * up to `maxDistance` blocks. Returns the first non-Air block hit, or
   * undefined if none is found within range.
   */
  public cast(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number,
  ): RaycastHit | undefined {
    const length = Math.sqrt(
      direction.x * direction.x + direction.y * direction.y + direction.z * direction.z,
    );

    if (length === 0) {
      return undefined;
    }

    const dirX = direction.x / length;
    const dirY = direction.y / length;
    const dirZ = direction.z / length;

    // Current voxel the ray is inside.
    let voxelX = Math.floor(origin.x);
    let voxelY = Math.floor(origin.y);
    let voxelZ = Math.floor(origin.z);

    const stepX = this.signOf(dirX);
    const stepY = this.signOf(dirY);
    const stepZ = this.signOf(dirZ);

    // Distance along the ray to cross one full voxel, per axis.
    const tDeltaX = dirX !== 0 ? Math.abs(1 / dirX) : Infinity;
    const tDeltaY = dirY !== 0 ? Math.abs(1 / dirY) : Infinity;
    const tDeltaZ = dirZ !== 0 ? Math.abs(1 / dirZ) : Infinity;

    // Distance along the ray to the first voxel boundary crossing, per axis.
    let tMaxX = this.firstBoundaryDistance(origin.x, voxelX, stepX, dirX);
    let tMaxY = this.firstBoundaryDistance(origin.y, voxelY, stepY, dirY);
    let tMaxZ = this.firstBoundaryDistance(origin.z, voxelZ, stepZ, dirZ);

    // Check the starting voxel itself before stepping (a hit here has
    // distance 0 and no meaningful face normal from outside; in practice
    // the player's eye is never inside a solid block, so this is mostly
    // a defensive first check).
    let travelled = 0;
    
    // Instead of strictly tracking voxel intersections dynamically from the DDA state
    // we use DDA purely to find which voxels the ray passes through, 
    // and for each non-air voxel we test Ray-AABB intersection explicitly.
    while (travelled <= maxDistance) {
      const blockId = this.getBlock(voxelX, voxelY, voxelZ);

      if (blockId !== AIR_BLOCK_ID) {
        const blockDefinition = this.blockRegistry.getById(blockId);

        if (blockDefinition !== undefined) {
          const aabbs = getBlockBounds(this.blockRegistry, this.behaviourRegistry, this.blockUpdateWorld, voxelX, voxelY, voxelZ, 'interaction');
          let bestHit: { distance: number, face: FaceNormal, hitAabb: AABB } | undefined = undefined;

          for (const aabb of aabbs) {
            const hit = aabb.intersectRay(origin.x, origin.y, origin.z, dirX, dirY, dirZ);
            if (hit && hit.distance <= maxDistance) {
              if (!bestHit || hit.distance < bestHit.distance) {
                bestHit = { ...hit, hitAabb: aabb };
              }
            }
          }

          if (bestHit) {
            return {
              blockPos: { x: voxelX, y: voxelY, z: voxelZ },
              face: bestHit.face,
              distance: bestHit.distance,
              blockDefinition,
              hitAabb: bestHit.hitAabb,
            };
          }
        }
      }

      // Advance to the next voxel boundary: whichever axis is nearest.
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        voxelX += stepX;
        travelled = tMaxX;
        tMaxX += tDeltaX;
      } else if (tMaxY < tMaxZ) {
        voxelY += stepY;
        travelled = tMaxY;
        tMaxY += tDeltaY;
      } else {
        voxelZ += stepZ;
        travelled = tMaxZ;
        tMaxZ += tDeltaZ;
      }
    }

    return undefined;
  }

  private signOf(value: number): number {
    if (value > 0) return 1;
    if (value < 0) return -1;
    return 0;
  }

  /**
   * Distance along the ray from `origin` to the nearest voxel boundary
   * ahead of it on one axis (the near edge of the next voxel in the
   * direction of travel).
   */
  private firstBoundaryDistance(
    origin: number,
    voxel: number,
    step: number,
    dir: number,
  ): number {
    if (dir === 0) {
      return Infinity;
    }

    const boundary = step > 0 ? voxel + 1 : voxel;
    return (boundary - origin) / dir;
  }

  /** Looks up a world-space block via ChunkManager; unloaded chunks read as Air. */
  private getBlock(worldX: number, worldY: number, worldZ: number): number {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) {
      return AIR_BLOCK_ID;
    }

    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);

    if (chunk === undefined) {
      // Unloaded chunk: treat as open space, consistent with ChunkMesher
      // and PlayerPhysics's existing "missing chunk = Air" convention.
      return AIR_BLOCK_ID;
    }

    return chunk.getBlock(localX, worldY, localZ);
  }
}
