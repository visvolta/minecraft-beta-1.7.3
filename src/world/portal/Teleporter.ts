import { BlockIds } from '../../blocks/BlockId';
import { AIR_BLOCK_ID, CHUNK_SIZE_Y } from '../chunkConstants';
import { JavaRandom } from '../generation/random/JavaRandom';
import type { PortalFrameWorld } from './PortalFrame';

/** Beta `Teleporter`: radius 128 when looking for an existing portal. */
export const PORTAL_SEARCH_RADIUS = 128;

/** Beta `Teleporter.func_4108_c`: radius 16 when looking for build space. */
export const PORTAL_PLACEMENT_RADIUS = 16;

/** Beta clamps a forced portal build into this vertical band. */
export const PORTAL_BUILD_MIN_Y = 70;
export const PORTAL_BUILD_MAX_Y = 118;

export interface PortalDestination {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A world the teleporter can search and build in. */
export interface TeleporterWorld extends PortalFrameWorld {
  /** True when the column is available to search (chunk resident). */
  isColumnAvailable(x: number, z: number): boolean;
}

/**
 * Beta 1.7.3 `Teleporter`.
 *
 * Two phases, matching the reference exactly:
 *   1. `func_4106_b` — scan +/-128 blocks horizontally and the full column for
 *      an existing portal block, keeping the nearest by squared distance, then
 *      walk to the bottom of that portal.
 *   2. `func_4108_c` — if none exists, look within +/-16 for a safe pocket and
 *      build a frame; failing that, force a build with Y clamped to 70..118.
 *
 * The radius is Beta's and is deliberately not reduced for performance. What
 * IS optimised is the scan itself: only resident columns are examined, and the
 * caller is expected to have loaded the destination area first.
 */
export class Teleporter {
  private readonly random: JavaRandom;

  public constructor(seed: bigint) {
    this.random = new JavaRandom(seed);
  }

  /**
   * Finds the nearest existing portal, or builds one. Returns the position the
   * entity should be placed at.
   */
  public findOrCreate(world: TeleporterWorld, x: number, y: number, z: number): PortalDestination {
    const existing = this.findExistingPortal(world, x, y, z);
    if (existing !== undefined) return existing;

    const built = this.createPortal(world, x, y, z);
    // After building, re-run the search so placement uses the same
    // nudge/centring rules as an existing portal.
    return this.findExistingPortal(world, built.x, built.y, built.z) ?? built;
  }

  /** Beta `func_4106_b`: nearest existing portal within the search radius. */
  public findExistingPortal(
    world: TeleporterWorld,
    entityX: number,
    entityY: number,
    entityZ: number,
  ): PortalDestination | undefined {
    let bestDistance = -1;
    let bestX = 0;
    let bestY = 0;
    let bestZ = 0;

    const baseX = Math.floor(entityX);
    const baseZ = Math.floor(entityZ);

    for (let bx = baseX - PORTAL_SEARCH_RADIUS; bx <= baseX + PORTAL_SEARCH_RADIUS; bx++) {
      const dx = bx + 0.5 - entityX;
      for (let bz = baseZ - PORTAL_SEARCH_RADIUS; bz <= baseZ + PORTAL_SEARCH_RADIUS; bz++) {
        // Skip columns that are not resident; scanning them would read air and
        // waste the whole radius on unloaded space.
        if (!world.isColumnAvailable(bx, bz)) continue;
        const dz = bz + 0.5 - entityZ;

        for (let by = CHUNK_SIZE_Y - 1; by >= 0; by--) {
          if (world.getBlock(bx, by, bz) !== BlockIds.Portal) continue;

          // Walk to the bottom of this portal column (Beta does the same).
          let bottom = by;
          while (bottom > 0 && world.getBlock(bx, bottom - 1, bz) === BlockIds.Portal) bottom -= 1;

          const dy = bottom + 0.5 - entityY;
          const distance = dx * dx + dy * dy + dz * dz;
          if (bestDistance < 0 || distance < bestDistance) {
            bestDistance = distance;
            bestX = bx;
            bestY = bottom;
            bestZ = bz;
          }
          by = bottom;
        }
      }
    }

    if (bestDistance < 0) return undefined;

    // Beta nudges the landing point half a block toward the portal plane so
    // the entity stands inside the 2-wide portal rather than on its edge.
    let placeX = bestX + 0.5;
    const placeY = bestY + 0.5;
    let placeZ = bestZ + 0.5;
    if (world.getBlock(bestX - 1, bestY, bestZ) === BlockIds.Portal) placeX -= 0.5;
    if (world.getBlock(bestX + 1, bestY, bestZ) === BlockIds.Portal) placeX += 0.5;
    if (world.getBlock(bestX, bestY, bestZ - 1) === BlockIds.Portal) placeZ -= 0.5;
    if (world.getBlock(bestX, bestY, bestZ + 1) === BlockIds.Portal) placeZ += 0.5;

    return { x: placeX, y: placeY, z: placeZ };
  }

  /**
   * Beta `func_4108_c`: find a safe pocket within +/-16 and build a portal,
   * or force one into the 70..118 band when nowhere is suitable.
   */
  public createPortal(
    world: TeleporterWorld,
    entityX: number,
    entityY: number,
    entityZ: number,
  ): PortalDestination {
    const baseX = Math.floor(entityX);
    const baseY = Math.floor(entityY);
    const baseZ = Math.floor(entityZ);

    let bestDistance = -1;
    let bestX = baseX;
    let bestY = baseY;
    let bestZ = baseZ;
    let bestOrientation = 0;
    const orientationSeed = this.random.nextInt(4);

    for (let bx = baseX - PORTAL_PLACEMENT_RADIUS; bx <= baseX + PORTAL_PLACEMENT_RADIUS; bx++) {
      const dx = bx + 0.5 - entityX;
      for (let bz = baseZ - PORTAL_PLACEMENT_RADIUS; bz <= baseZ + PORTAL_PLACEMENT_RADIUS; bz++) {
        if (!world.isColumnAvailable(bx, bz)) continue;
        const dz = bz + 0.5 - entityZ;

        columnLoop:
        for (let by = CHUNK_SIZE_Y - 1 - 10; by >= 1; by--) {
          if (world.getBlock(bx, by, bz) !== AIR_BLOCK_ID) continue;
          // Drop to the floor of this air pocket.
          while (by > 1 && world.getBlock(bx, by - 1, bz) === AIR_BLOCK_ID) by -= 1;

          for (let o = orientationSeed; o < orientationSeed + 4; o++) {
            let stepX = o % 2;
            let stepZ = 1 - stepX;
            if (o % 4 >= 2) {
              stepX = -stepX;
              stepZ = -stepZ;
            }

            // Beta checks a 3 x 4 x 5 volume: solid floor beneath, air above.
            for (let across = 0; across < 3; across++) {
              for (let along = 0; along < 4; along++) {
                for (let up = -1; up < 4; up++) {
                  const cx = bx + (along - 1) * stepX + across * stepZ;
                  const cy = by + up;
                  const cz = bz + (along - 1) * stepZ - across * stepX;
                  if (cy < 0 || cy >= CHUNK_SIZE_Y) continue columnLoop;
                  if (up < 0 && world.getBlock(cx, cy, cz) === AIR_BLOCK_ID) continue columnLoop;
                  if (up >= 0 && world.getBlock(cx, cy, cz) !== AIR_BLOCK_ID) continue columnLoop;
                }
              }
            }

            const dy = by + 0.5 - entityY;
            const distance = dx * dx + dy * dy + dz * dz;
            if (bestDistance < 0 || distance < bestDistance) {
              bestDistance = distance;
              bestX = bx;
              bestY = by;
              bestZ = bz;
              bestOrientation = o % 4;
            }
          }
        }
      }
    }

    let originX = bestX;
    let originY = bestY;
    const originZ = bestZ;
    let stepX = bestOrientation % 2;
    let stepZ = 1 - stepX;
    if (bestOrientation % 4 >= 2) {
      stepX = -stepX;
      stepZ = -stepZ;
    }

    if (bestDistance < 0) {
      // Nowhere suitable: force a platform in Beta's 70..118 band.
      if (originY < PORTAL_BUILD_MIN_Y) originY = PORTAL_BUILD_MIN_Y;
      if (originY > PORTAL_BUILD_MAX_Y) originY = PORTAL_BUILD_MAX_Y;

      for (let across = -1; across <= 1; across++) {
        for (let along = 1; along < 3; along++) {
          for (let up = -1; up < 3; up++) {
            const cx = originX + (along - 1) * stepX + across * stepZ;
            const cy = originY + up;
            const cz = originZ + (along - 1) * stepZ - across * stepX;
            world.setBlock(cx, cy, cz, up < 0 ? BlockIds.Obsidian : AIR_BLOCK_ID);
          }
        }
      }
    }

    // Build the frame and fill the interior with portal blocks.
    for (let along = 0; along < 4; along++) {
      for (let up = -1; up < 4; up++) {
        const cx = originX + (along - 1) * stepX;
        const cy = originY + up;
        const cz = originZ + (along - 1) * stepZ;
        const isFrame = along === 0 || along === 3 || up === -1 || up === 3;
        world.setBlock(cx, cy, cz, isFrame ? BlockIds.Obsidian : BlockIds.Portal);
      }
    }

    originX = bestX;
    return { x: originX + 0.5, y: originY + 0.5, z: originZ + 0.5 };
  }
}
