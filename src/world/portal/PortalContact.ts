import { BlockIds } from '../../blocks/BlockId';
import type { AABB } from '../../physics/AABB';
import { CHUNK_SIZE_Y } from '../chunkConstants';
import { PortalAxis, portalLocalBounds } from './PortalAxis';

/** Minimal world read surface for portal overlap tests. */
export interface PortalContactWorld {
  getBlock(x: number, y: number, z: number): number;
  isLoaded(x: number, z: number): boolean;
}

/**
 * Detects whether an entity is physically inside a portal.
 *
 * Beta relies on `Block.onEntityCollidedWithBlock`, which the world calls for
 * every block an entity's AABB overlaps — that callback fires regardless of
 * whether the block has a collision box, which is why a non-solid portal can
 * still detect contact.
 *
 * This project resolves contact through collision AABBs, and the portal
 * deliberately returns an empty collision list (Beta's
 * `getCollisionBoundingBoxFromPool` returns null) so the player can walk
 * through it. A null collision box therefore cannot be used to detect
 * contact, and an explicit overlap scan is required instead.
 *
 * The logical contact volume is the same thin, orientation-aware plane the
 * portal renders and selects with, so the purple you can see is exactly the
 * volume that triggers travel.
 */
export function isInsidePortal(world: PortalContactWorld, box: AABB): boolean {
  // Beta expands the tested cell range by the usual +1 exclusive bound.
  const minX = Math.floor(box.minX);
  const maxX = Math.floor(box.maxX);
  const minY = Math.floor(box.minY);
  const maxY = Math.floor(box.maxY);
  const minZ = Math.floor(box.minZ);
  const maxZ = Math.floor(box.maxZ);

  for (let y = minY; y <= maxY; y++) {
    if (y < 0 || y >= CHUNK_SIZE_Y) continue;
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (!world.isLoaded(x, z)) continue;
        if (world.getBlock(x, y, z) !== BlockIds.Portal) continue;

        // Use the portal's own thin plane, not the whole block cell: standing
        // in the adjacent block of a 2-wide portal must not count as contact
        // unless the player actually overlaps the visible plane.
        const axis = resolveAxis(world, x, y, z);
        const local = portalLocalBounds(axis);
        const pMinX = x + local.minX;
        const pMaxX = x + local.maxX;
        const pMinY = y + local.minY;
        const pMaxY = y + local.maxY;
        const pMinZ = z + local.minZ;
        const pMaxZ = z + local.maxZ;

        const overlaps =
          box.maxX > pMinX && box.minX < pMaxX &&
          box.maxY > pMinY && box.minY < pMaxY &&
          box.maxZ > pMinZ && box.minZ < pMaxZ;

        if (overlaps) return true;
      }
    }
  }

  return false;
}

/** Canonical portal axis, matching meshing/selection/particles. */
function resolveAxis(world: PortalContactWorld, x: number, y: number, z: number): PortalAxis {
  const hasXNeighbour =
    world.getBlock(x - 1, y, z) === BlockIds.Portal ||
    world.getBlock(x + 1, y, z) === BlockIds.Portal;
  return hasXNeighbour ? PortalAxis.X : PortalAxis.Z;
}

/**
 * Finds the portal block an entity is standing in, if any. Used as the source
 * anchor when resolving a travel destination.
 */
export function findContactedPortal(
  world: PortalContactWorld,
  box: AABB,
): { x: number; y: number; z: number } | undefined {
  const minX = Math.floor(box.minX);
  const maxX = Math.floor(box.maxX);
  const minY = Math.floor(box.minY);
  const maxY = Math.floor(box.maxY);
  const minZ = Math.floor(box.minZ);
  const maxZ = Math.floor(box.maxZ);

  for (let y = minY; y <= maxY; y++) {
    if (y < 0 || y >= CHUNK_SIZE_Y) continue;
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (!world.isLoaded(x, z)) continue;
        if (world.getBlock(x, y, z) === BlockIds.Portal) return { x, y, z };
      }
    }
  }

  return undefined;
}
