import { worldToChunkLocal } from '../worldToChunkCoords';
import type { BlockBehaviourRegistry, BlockBehaviourContext } from '../BlockBehaviour';
import { BlockIds } from '../../blocks/BlockId';
import type { ChestManager } from '../../chest/ChestManager';

export function registerChestBehaviour(registry: BlockBehaviourRegistry, chestManager: ChestManager): void {
  registry.register(BlockIds.Chest, {
    onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number, _blockId: number): void {
      const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(x, z);
      const chunk = ctx.world['chunkManager'].getChunk(chunkX, chunkZ);
      if (chunk) {
        const metadata = chunk.getBlockMetadata(localX, y, localZ);
        // Register with the ChestManager immediately so it renders visibly
        chestManager.getOrCreate(x, y, z, metadata);
      }
    }
  });
}
