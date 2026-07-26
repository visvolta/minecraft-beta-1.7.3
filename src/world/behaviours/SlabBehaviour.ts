import type { BlockBehaviour, BlockBehaviourContext, BoundingBoxType } from '../BlockBehaviour';
import type { AABB } from '../../physics/AABB';
import { slabShape } from '../../blocks/shapes/BlockShapes';
import { toWorldBound } from '../../blocks/shapes/toWorldBounds';
import { BlockIds } from '../../blocks/BlockId';

/** Beta `BlockStep` metadata bit marking a slab placed in the upper half. */
const UPPER_HALF_BIT = 8;
/** Material bits; the upper-half flag is not part of the material identity. */
const MATERIAL_MASK = 7;

export class SlabBehaviour implements BlockBehaviour {
  /**
   * Half-height, matching the rendered slab. Beta 1.7.3 slabs always occupy
   * the bottom half; the shared shape still reads the placement bit so that
   * geometry and collision can never disagree if one ever appears.
   */
  public getBoundingBoxes(
    ctx: BlockBehaviourContext,
    x: number,
    y: number,
    z: number,
    _type: BoundingBoxType,
  ): AABB[] | undefined {
    return toWorldBound(slabShape(ctx.world.getBlockMetadata(x, y, z)), x, y, z);
  }

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const world = ctx.world;
    const currentMeta = world.getBlockMetadata(x, y, z);

    // Beta `BlockStep.onBlockAdded`: a bottom slab landing on a matching
    // bottom slab merges into a double slab. Only same-material, same-half
    // pairs merge, so the material bits are compared without the half flag.
    if ((currentMeta & UPPER_HALF_BIT) !== 0) return;

    const belowId = world.getBlock(x, y - 1, z);
    if (belowId !== BlockIds.Slab) return;

    const belowMeta = world.getBlockMetadata(x, y - 1, z);
    if ((belowMeta & UPPER_HALF_BIT) !== 0) return;
    if ((belowMeta & MATERIAL_MASK) !== (currentMeta & MATERIAL_MASK)) return;

    world.setBlock(x, y, z, BlockIds.Air, { notifyNeighbours: true, updateLighting: true });
    world.setBlock(x, y - 1, z, BlockIds.DoubleSlab, {
      metadata: currentMeta & MATERIAL_MASK,
      notifyNeighbours: true,
      updateLighting: true,
    });
  }
}
