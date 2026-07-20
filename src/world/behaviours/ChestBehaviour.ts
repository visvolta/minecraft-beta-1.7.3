import { worldToChunkLocal } from '../worldToChunkCoords';
import type { BlockBehaviourRegistry, BlockBehaviourContext } from '../BlockBehaviour';
import { BlockIds } from '../../blocks/BlockId';
import type { ChestManager } from '../../chest/ChestManager';

export function registerChestBehaviour(registry: BlockBehaviourRegistry, chestManager: ChestManager): void {
  registry.register(BlockIds.Chest, {
    canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
      const isChest = (nx: number, nz: number) => ctx.world.getBlock(nx, y, nz) === BlockIds.Chest;

      const neighbors = [
        { nx: x - 1, nz: z },
        { nx: x + 1, nz: z },
        { nx: x, nz: z - 1 },
        { nx: x, nz: z + 1 }
      ];

      let chestCount = 0;
      let neighborChest = null;

      for (const { nx, nz } of neighbors) {
        if (isChest(nx, nz)) {
          chestCount++;
          neighborChest = { nx, nz };
        }
      }

      if (chestCount > 1) return false;

      if (neighborChest) {
        const { nx, nz } = neighborChest;
        const subNeighbors = [
          { snx: nx - 1, snz: nz },
          { snx: nx + 1, snz: nz },
          { snx: nx, snz: nz - 1 },
          { snx: nx, snz: nz + 1 }
        ];
        
        let subCount = 0;
        for (const { snx, snz } of subNeighbors) {
          if (snx === x && snz === z) continue;
          if (isChest(snx, snz)) subCount++;
        }

        if (subCount > 0) return false;

        // Phase 5B: Validate that the resulting pair orientation is geometrically valid
        // relative to the existing chest's authoritative facing.
        const neighborMetadata = ctx.world.getBlockMetadata(nx, y, nz);
        // 2: -Z (North), 3: +Z (South), 4: -X (West), 5: +X (East)
        if (neighborMetadata === 2 || neighborMetadata === 3) {
          // North/South chests must pair along the X axis
          if (nx === x) return false;
        } else if (neighborMetadata === 4 || neighborMetadata === 5) {
          // East/West chests must pair along the Z axis
          if (nz === z) return false;
        }
      }

      return true;
    },
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
