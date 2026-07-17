/**
 * Beta 1.7.3 BlockSnow behaviour.
 *
 * Single layer only (no metadata stacking per user decision).
 * - Height: 0.125 blocks (1/8)
 * - Melts when block light > 11
 * - Removed when support block below is removed
 * - No gravity (doesn't fall)
 * - Placed by weather system during snowfall in enableSnow biomes
 */

import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';

export class SnowBehaviour implements BlockBehaviour {
  /**
   * Beta BlockSnow.updateTick(): melt if block light > 11.
   * TODO: implement proper block light query via LightEngine.
   */
  public scheduledTick(_ctx: BlockBehaviourContext, _x: number, _y: number, _z: number): void {
    // Beta melting: block light > 11
    // Deferred until LightEngine exposes getBlocklight through BlockUpdateWorld.
  }

  /**
   * Beta BlockSnow.onNeighborBlockChange(): check if support still exists.
   */
  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    this.canSnowStay(ctx, x, y, z);
  }

  private canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const below = ctx.world.getBlock(x, y - 1, z);
    if (below === 0) return false;
    return isOpaqueSolidBlock(below);
  }

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
