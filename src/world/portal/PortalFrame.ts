import { BlockIds } from '../../blocks/BlockId';
import { AIR_BLOCK_ID, CHUNK_SIZE_Y } from '../chunkConstants';
import { PortalAxis } from './PortalAxis';

/** Minimal read/write surface the frame logic needs. */
export interface PortalFrameWorld {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, blockId: number): void;
  isLoaded(x: number, z: number): boolean;
}

/** Beta's portal interior is exactly 2 wide and 3 tall. */
export const PORTAL_INTERIOR_WIDTH = 2;
export const PORTAL_INTERIOR_HEIGHT = 3;

/**
 * Beta `BlockPortal.tryToCreatePortal`.
 *
 * Called when fire is placed on obsidian. Determines the frame axis from the
 * surrounding obsidian, walks the 4x5 frame footprint, and fills the interior
 * with portal blocks when every border cell is obsidian and every interior
 * cell is air or fire.
 *
 * Beta rejects when BOTH axes have adjacent obsidian (`var5 == var6`), which
 * also rejects the case where neither does.
 *
 * @returns true when a portal was created.
 */
export function tryToCreatePortal(world: PortalFrameWorld, x: number, y: number, z: number): boolean {
  let alongX = 0;
  let alongZ = 0;

  if (world.getBlock(x - 1, y, z) === BlockIds.Obsidian || world.getBlock(x + 1, y, z) === BlockIds.Obsidian) {
    alongX = 1;
  }
  if (world.getBlock(x, y, z - 1) === BlockIds.Obsidian || world.getBlock(x, y, z + 1) === BlockIds.Obsidian) {
    alongZ = 1;
  }

  // Ambiguous (both or neither): not a valid frame.
  if (alongX === alongZ) return false;

  // Beta shifts the origin one step back when that cell is empty, so the
  // 2-wide interior is anchored consistently regardless of which half was lit.
  let originX = x;
  let originZ = z;
  if (world.getBlock(x - alongX, y, z - alongZ) === AIR_BLOCK_ID) {
    originX -= alongX;
    originZ -= alongZ;
  }

  for (let across = -1; across <= 2; across++) {
    for (let up = -1; up <= 3; up++) {
      const isBorder = across === -1 || across === 2 || up === -1 || up === 3;
      // Beta skips the four corners: `if (a != -1 && a != 2 || b != -1 && b != 3)`
      const isCorner = (across === -1 || across === 2) && (up === -1 || up === 3);
      if (isCorner) continue;

      const bx = originX + alongX * across;
      const by = y + up;
      const bz = originZ + alongZ * across;
      if (by < 0 || by >= CHUNK_SIZE_Y) return false;
      if (!world.isLoaded(bx, bz)) return false;

      const blockId = world.getBlock(bx, by, bz);
      if (isBorder) {
        if (blockId !== BlockIds.Obsidian) return false;
      } else if (blockId !== AIR_BLOCK_ID && blockId !== BlockIds.Fire) {
        return false;
      }
    }
  }

  for (let across = 0; across < PORTAL_INTERIOR_WIDTH; across++) {
    for (let up = 0; up < PORTAL_INTERIOR_HEIGHT; up++) {
      world.setBlock(
        originX + alongX * across,
        y + up,
        originZ + alongZ * across,
        BlockIds.Portal,
      );
    }
  }

  return true;
}

/**
 * Beta `BlockPortal.onNeighborBlockChange`.
 *
 * Re-validates the portal column this block belongs to and returns false when
 * the portal must break. Beta walks to the bottom of the column, requires
 * obsidian below, exactly three portal blocks, obsidian above, and a
 * consistent single-axis arrangement with obsidian on both sides.
 */
export function isPortalStillValid(world: PortalFrameWorld, x: number, y: number, z: number): boolean {
  const isPortal = (bx: number, by: number, bz: number): boolean =>
    world.getBlock(bx, by, bz) === BlockIds.Portal;

  let sideX = 0;
  let sideZ = 1;
  if (isPortal(x - 1, y, z) || isPortal(x + 1, y, z)) {
    sideX = 1;
    sideZ = 0;
  }

  // Walk to the bottom of the portal column.
  let bottom = y;
  while (bottom > 0 && isPortal(x, bottom - 1, z)) bottom -= 1;

  if (world.getBlock(x, bottom - 1, z) !== BlockIds.Obsidian) return false;

  let height = 1;
  while (height < 4 && isPortal(x, bottom + height, z)) height += 1;

  if (height !== PORTAL_INTERIOR_HEIGHT) return false;
  if (world.getBlock(x, bottom + height, z) !== BlockIds.Obsidian) return false;

  const hasXNeighbour = isPortal(x - 1, y, z) || isPortal(x + 1, y, z);
  const hasZNeighbour = isPortal(x, y, z - 1) || isPortal(x, y, z + 1);
  // A block that has portal neighbours on both axes is not part of a planar
  // portal and must break.
  if (hasXNeighbour && hasZNeighbour) return false;

  const forwardObsidian = world.getBlock(x + sideX, y, z + sideZ) === BlockIds.Obsidian
    && isPortal(x - sideX, y, z - sideZ);
  const backwardObsidian = world.getBlock(x - sideX, y, z - sideZ) === BlockIds.Obsidian
    && isPortal(x + sideX, y, z + sideZ);

  return forwardObsidian || backwardObsidian;
}

/** Canonical axis of an existing portal block, for bounds/mesh/particles. */
export function portalAxisAt(world: PortalFrameWorld, x: number, y: number, z: number): PortalAxis {
  const hasXNeighbour = world.getBlock(x - 1, y, z) === BlockIds.Portal
    || world.getBlock(x + 1, y, z) === BlockIds.Portal;
  return hasXNeighbour ? PortalAxis.X : PortalAxis.Z;
}
