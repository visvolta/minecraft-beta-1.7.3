import { BlockIds, type BlockId } from '../../blocks/BlockId';

/**
 * Beta 1.7.3 `RailLogic.refreshTrackShape` — the rule that turns a rail's
 * neighbours into its shape metadata.
 *
 * Rails were previously placed with a fixed metadata and never reconciled, so
 * corners stayed straight and a track could render one way while the minecart
 * followed another. This is the single shared implementation both placement
 * and neighbour updates go through, so the rendered shape, the metadata and
 * the cart path can never disagree.
 *
 * Metadata (Beta): 0 N/S, 1 E/W, 2..5 ascending E/W/N/S, 6..9 curves
 * (SE, SW, NW, NE). Powered rails use bit 8 for the active flag and cannot
 * take a curve.
 */

/** Minimal world view the shape rule needs. */
export interface RailWorldView {
  getBlock(x: number, y: number, z: number): BlockId;
  getBlockMetadata(x: number, y: number, z: number): number;
}

export function isRailBlock(blockId: BlockId): boolean {
  return blockId === BlockIds.Rail
    || blockId === BlockIds.PoweredRail
    || blockId === BlockIds.DetectorRail;
}

/** A rail at this cell, or one step up/down (Beta connects across slopes). */
function railNeighbourAt(world: RailWorldView, x: number, y: number, z: number): boolean {
  if (isRailBlock(world.getBlock(x, y, z))) return true;
  if (isRailBlock(world.getBlock(x, y + 1, z))) return true;
  return isRailBlock(world.getBlock(x, y - 1, z));
}

export interface RailShapeInput {
  /** True for powered/detector rails, which never curve. */
  readonly poweredRail: boolean;
  /** Beta consults redstone power when resolving ambiguous corners. */
  readonly powered?: boolean;
}

/**
 * Computes the Beta shape metadata (0..9) for a rail from its neighbours.
 *
 * Faithful port of `RailLogic.refreshTrackShape`, including the ordering of
 * the corner tests — Beta's later assignments deliberately overwrite earlier
 * ones, so the sequence is what picks the corner when three or four sides
 * are occupied.
 */
export function computeRailShape(
  world: RailWorldView,
  x: number,
  y: number,
  z: number,
  input: RailShapeInput,
): number {
  const north = railNeighbourAt(world, x, y, z - 1);
  const south = railNeighbourAt(world, x, y, z + 1);
  const west = railNeighbourAt(world, x - 1, y, z);
  const east = railNeighbourAt(world, x + 1, y, z);

  let shape = -1;

  // Two opposite neighbours on one axis: a straight.
  if ((north || south) && !west && !east) shape = 0;
  if ((west || east) && !north && !south) shape = 1;

  // Corners, only for plain rails.
  if (!input.poweredRail) {
    if (south && east && !north && !west) shape = 6;
    if (south && west && !north && !east) shape = 7;
    if (north && west && !south && !east) shape = 8;
    if (north && east && !south && !west) shape = 9;
  }

  if (shape === -1) {
    if (north || south) shape = 0;
    if (west || east) shape = 1;

    if (!input.poweredRail) {
      // Beta orders these two branches differently depending on power, which
      // decides which corner wins at a T- or cross-junction.
      if (input.powered === true) {
        if (south && east) shape = 6;
        if (west && south) shape = 7;
        if (east && north) shape = 9;
        if (north && west) shape = 8;
      } else {
        if (north && west) shape = 8;
        if (east && north) shape = 9;
        if (west && south) shape = 7;
        if (south && east) shape = 6;
      }
    }
  }

  // A straight becomes an ascending rail when the next rail is one block up.
  if (shape === 0) {
    if (isRailBlock(world.getBlock(x, y + 1, z - 1))) shape = 4;
    if (isRailBlock(world.getBlock(x, y + 1, z + 1))) shape = 5;
  }
  if (shape === 1) {
    if (isRailBlock(world.getBlock(x + 1, y + 1, z))) shape = 2;
    if (isRailBlock(world.getBlock(x - 1, y + 1, z))) shape = 3;
  }

  if (shape < 0) shape = 0;
  return shape;
}

/**
 * Beta's placement seed. `BlockRail.onBlockAdded` immediately reconciles the
 * shape from neighbours, so a freshly placed rail with no neighbours falls
 * back to the player's facing axis rather than always pointing north/south.
 */
export function railShapeFromPlayerYaw(yawDegrees: number): number {
  const quadrant = Math.floor((yawDegrees * 4 / 360) + 0.5) & 3;
  // Quadrants 0 and 2 face along Z, 1 and 3 along X.
  return quadrant % 2 === 0 ? 0 : 1;
}

/** Splits a rail's raw metadata into shape and powered flag. */
export function splitRailMetadata(metadata: number, poweredRail: boolean): {
  shape: number; active: boolean;
} {
  if (!poweredRail) return { shape: metadata & 15, active: false };
  return { shape: metadata & 7, active: (metadata & 8) !== 0 };
}

/** Recombines a shape and powered flag into raw metadata. */
export function combineRailMetadata(shape: number, active: boolean, poweredRail: boolean): number {
  if (!poweredRail) return shape & 15;
  return (shape & 7) | (active ? 8 : 0);
}
