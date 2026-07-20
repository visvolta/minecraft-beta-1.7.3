import type { BlockBehaviour, BlockBehaviourContext } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';
import { BlockIds } from '../../blocks/BlockId';

export class SlabBehaviour implements BlockBehaviour {
  public getBoundingBoxes(
    _ctx: BlockBehaviourContext,
    x: number,
    y: number,
    z: number,
    _type: 'collision' | 'selection' | 'interaction'
  ): AABB[] | undefined {
    // Single slab is exactly half-height (y=0 to 0.5)
    return [new AABB(x, y, z, x + 1, y + 0.5, z + 1)];
  }

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const world = ctx.world;
    const currentMeta = world.getBlockMetadata(x, y, z);

    // Replicate Beta 1.7.3 BlockStep.onBlockAdded() behavior:
    // If the block below is a single slab of the same material, merge them into a double slab
    const belowId = world.getBlock(x, y - 1, z);
    if (belowId === BlockIds.Slab) {
      const belowMeta = world.getBlockMetadata(x, y - 1, z);
      if (belowMeta === currentMeta) {
        world.setBlock(x, y, z, BlockIds.Air, { notifyNeighbours: true, updateLighting: true });
        world.setBlock(x, y - 1, z, BlockIds.DoubleSlab, { metadata: currentMeta, notifyNeighbours: true, updateLighting: true });
      }
    }
  }
}
