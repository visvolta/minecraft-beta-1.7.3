/**
 * Beta 1.7.3 BlockIce behaviour.
 *
 * - Melts when block light > 11 - lightOpacity (3), i.e. > 8
 * - On melt: replace with water still
 * - On break: place water if block below is solid or liquid
 * - Placed by weather system during freezing in enableSnow biomes
 */

import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';

export class IceBehaviour implements BlockBehaviour {
  /**
   * Beta BlockIce.updateTick(): melt if block light > 11 - opacity (3).
   * TODO: implement proper block light query via LightEngine.
   */
  public scheduledTick(_ctx: BlockBehaviourContext, _x: number, _y: number, _z: number): void {
    // Beta melting: block light > 8
    // Deferred until LightEngine exposes getBlocklight through BlockUpdateWorld.
  }

  /**
   * Beta BlockIce.harvestBlock(): when broken, place water if block below
   * is solid or liquid.
   */
  public onRemoved(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const below = ctx.world.getBlock(x, y - 1, z);
    if (below !== 0) {
      ctx.world.setBlock(x, y, z, BlockIds.WaterStill, {
        reason: 'world',
        notifyNeighbours: true,
        updateLighting: true,
      });
    }
  }
}

export function registerIceBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Ice, new IceBehaviour());
}
