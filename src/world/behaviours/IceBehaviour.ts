/**
 * Beta 1.7.3 BlockIce behaviour.
 *
 * - Melts when block light > 11 - lightOpacity (3), i.e. > 8
 *   Beta: getSavedLightValue(EnumSkyBlock.Block, ...) > 11 - Block.lightOpacity[this.blockID]
 * - On melt (updateTick): replace with water still (metadata 0)
 * - On break (harvestBlock): if block below is solid or liquid, place water moving
 * - setTickOnLoad=true in Beta → schedules tick on world load
 * - No metadata
 * - Placed by weather system during freezing in enableSnow biomes
 */

import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';

/**
 * Beta BlockIce light opacity. Ice has lightOpacity 3 in Beta.
 * Melting threshold: block light > 11 - 3 = 8.
 */
const ICE_LIGHT_OPACITY = 3;
const MELT_THRESHOLD = 11 - ICE_LIGHT_OPACITY;

export class IceBehaviour implements BlockBehaviour {
  /**
   * Beta BlockIce.updateTick(): melt if block light > 11 - opacity.
   * On melt, replace with water still (matching Beta exactly).
   */
  public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const blockLight = ctx.world.getBlocklight(x, y, z);
    if (blockLight > MELT_THRESHOLD) {
      // Beta: this.dropBlockAsItem(...) then setBlockWithNotify(x, y, z, Block.waterStill.blockID)
      ctx.world.setBlock(x, y, z, BlockIds.WaterStill, {
        reason: 'scheduled',
        notifyNeighbours: true,
        updateLighting: true,
      });
    }
  }

  /**
   * Beta BlockIce.harvestBlock(): when manually broken, place water if block
   * below is solid or liquid. This is the BREAK path, not the MELT path.
   * Beta uses waterMoving (flowing), not waterStill.
   */
  public onRemoved(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    // Beta: Material var7 = getBlockMaterial(x, y-1, z);
    // if (var7.getIsSolid() || var7.getIsLiquid()) setBlockWithNotify(waterMoving)
    const below = ctx.world.getBlock(x, y - 1, z);
    if (isSolidOrLiquid(below)) {
      ctx.world.setBlock(x, y, z, BlockIds.WaterFlowing, {
        reason: 'world',
        notifyNeighbours: true,
        updateLighting: true,
      });
    }
  }
}

/**
 * Returns true if the block is solid or liquid (Beta material check).
 */
function isSolidOrLiquid(blockId: number): boolean {
  switch (blockId) {
    case BlockIds.Air:
    case BlockIds.Fire:
      return false;
    default:
      return blockId !== 0;
  }
}

export function registerIceBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Ice, new IceBehaviour());
}
