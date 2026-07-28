import { BlockIds } from '../../blocks/BlockId';
import type { BlockId } from '../../blocks/BlockId';
import { AABB } from '../../physics/AABB';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry, BoundingBoxType } from '../BlockBehaviour';
import { isPortalStillValid, portalAxisAt } from '../portal/PortalFrame';
import { portalLocalBounds } from '../portal/PortalAxis';

/**
 * Beta 1.7.3 `BlockPortal`.
 *
 * - `getCollisionBoundingBoxFromPool` returns null: the player walks straight
 *   into a portal, which is what lets contact start the travel timer.
 * - `setBlockBoundsBasedOnState` produces a thin, orientation-dependent box
 *   used for selection; the orientation comes from the canonical portal axis
 *   so meshing, particles and teleport placement cannot disagree with it.
 * - `onNeighborBlockChange` re-validates the frame and removes the portal when
 *   the obsidian is broken.
 */
export class PortalBehaviour implements BlockBehaviour {
  /** Beta returns null from the collision pool: portals never block movement. */
  public getBoundingBoxes(
    _ctx: BlockBehaviourContext,
    _x: number,
    _y: number,
    _z: number,
    type: BoundingBoxType,
  ): AABB[] | undefined {
    if (type === 'collision') return [];
    return undefined;
  }

  /**
   * Selection/outline box: thin across the portal plane, full block along it.
   * Derived from the shared axis helper rather than re-deriving orientation.
   */
  public getSelectionBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number): AABB[] {
    const axis = portalAxisAt(
      {
        getBlock: (bx, by, bz) => ctx.world.getBlock(bx, by, bz),
        setBlock: () => undefined,
        isLoaded: (bx, bz) => ctx.world.isLoaded(bx, bz),
      },
      x, y, z,
    );
    const b = portalLocalBounds(axis);
    return [new AABB(x + b.minX, y + b.minY, z + b.minZ, x + b.maxX, y + b.maxY, z + b.maxZ)];
  }

  /**
   * Beta `BlockPortal.onNeighborBlockChange`: break the portal when its
   * obsidian frame is no longer intact. Lighting updates automatically
   * because the block is removed through the normal world mutation path.
   */
  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const world = {
      getBlock: (bx: number, by: number, bz: number) => ctx.world.getBlock(bx, by, bz),
      setBlock: () => undefined,
      isLoaded: (bx: number, bz: number) => ctx.world.isLoaded(bx, bz),
    };
    if (isPortalStillValid(world, x, y, z)) return;

    ctx.world.setBlock(x, y, z, BlockIds.Air as BlockId, {
      reason: 'neighbour',
      notifyNeighbours: true,
      updateLighting: true,
    });
  }
}

export function registerPortalBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Portal, new PortalBehaviour());
}
