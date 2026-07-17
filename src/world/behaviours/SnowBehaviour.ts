/**
 * Beta 1.7.3 BlockSnow behaviour.
 *
 * Single layer only (no metadata stacking per user decision).
 * - Height: 0.125 blocks (1/8)
 * - Melts when block light > 11 (Beta: getSavedLightValue(EnumSkyBlock.Block, ...) > 11)
 * - Removed when support block below is removed
 * - No gravity (doesn't fall)
 * - setTickOnLoad=true in Beta → schedules tick on world load
 * - Placed by weather system during snowfall in enableSnow biomes
 */

import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';

export class SnowBehaviour implements BlockBehaviour {
  /**
   * Beta BlockSnow.updateTick(): melt if block light > 11.
   * On melt: drop items (no-op for now), set to Air.
   */
  public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const blockLight = ctx.world.getBlocklight(x, y, z);
    if (blockLight > 11) {
      // Beta: this.dropBlockAsItem(...) then setBlockWithNotify(x, y, z, 0)
      ctx.world.setBlock(x, y, z, BlockIds.Air, {
        reason: 'scheduled',
        notifyNeighbours: true,
        updateLighting: true,
      });
    }
  }

  /**
   * Beta BlockSnow.onNeighborBlockChange(): check if support still exists.
   */
  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    this.canSnowStay(ctx, x, y, z);
  }

  /**
   * Beta BlockSnow.canPlaceBlockAt():
   * Block below must be opaque and solid.
   */
  private canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const below = ctx.world.getBlock(x, y - 1, z);
    if (below === 0) return false;
    // Beta: blocksList[var5].isOpaqueCube() && material.getIsSolid()
    return isOpaqueSolidBlock(below);
  }

  /**
   * Beta BlockSnow.canSnowStay(): remove if unsupported.
   */
  private canSnowStay(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    if (!this.canPlaceBlockAt(ctx, x, y, z)) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, {
        reason: 'neighbour',
        notifyNeighbours: true,
        updateLighting: true,
      });
      return false;
    }
    return true;
  }
}

/**
 * Returns true if the block is opaque and solid (Beta isOpaqueCube + material.isSolid).
 * Used for snow placement support check.
 */
function isOpaqueSolidBlock(blockId: number): boolean {
  switch (blockId) {
    case BlockIds.Air:
    case BlockIds.WaterFlowing:
    case BlockIds.WaterStill:
    case BlockIds.LavaFlowing:
    case BlockIds.LavaStill:
    case BlockIds.Fire:
    case BlockIds.Snow:
    case BlockIds.Ice:
      return false;
    default:
      return true;
  }
}

export function registerSnowBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Snow, new SnowBehaviour());
}
