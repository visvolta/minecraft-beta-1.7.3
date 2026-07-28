import type { ChestManager } from '../../../chest/ChestManager';
import { ItemStack } from '../../../inventory/ItemStack';
import type { GeneratedChunkFeatures } from './GeneratedChunkFeatures';
import type { LootStack } from './DungeonLoot';
import { BlockIds } from '../../../blocks/BlockId';
import type { Chunk } from '../../Chunk';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../chunkConstants';

/**
 * Applies dungeon generation side-channel data to runtime chest inventories
 * and spawner mob ids once the chunk exists in the live world.
 */
export interface SpawnerMobStore {
  setSpawnerMob(x: number, y: number, z: number, mobId: string): void;
}

const spawnerMobs = new Map<string, string>();

export function setSpawnerMob(x: number, y: number, z: number, mobId: string): void {
  spawnerMobs.set(`${x},${y},${z}`, mobId);
}

export function getSpawnerMob(x: number, y: number, z: number): string | undefined {
  return spawnerMobs.get(`${x},${y},${z}`);
}

export function clearSpawnerMob(x: number, y: number, z: number): void {
  spawnerMobs.delete(`${x},${y},${z}`);
}

function lootToStack(loot: LootStack): ItemStack {
  // Dungeon loot ids are item string ids (saddle, iron_ingot, …).
  return new ItemStack(loot.id, 'item', loot.count, loot.metadata);
}

export function applyDungeonFeaturesToRuntime(
  features: GeneratedChunkFeatures,
  chestManager: ChestManager,
  chunk?: Chunk,
): void {
  for (const dungeon of features.dungeons) {
    if (dungeon.mobId) {
      setSpawnerMob(dungeon.spawnerX, dungeon.spawnerY, dungeon.spawnerZ, dungeon.mobId);
    }
    for (const chest of dungeon.chests) {
      // Only apply if chest block is present (or chunk not provided).
      if (chunk) {
        const lx = chest.x - chunk.chunkX * CHUNK_SIZE_X;
        const lz = chest.z - chunk.chunkZ * CHUNK_SIZE_Z;
        if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) continue;
        if (chunk.getBlock(lx, chest.y, lz) !== BlockIds.Chest) continue;
      }
      const container = chestManager.getOrCreate(chest.x, chest.y, chest.z);
      for (const [slot, loot] of chest.contents) {
        if (slot < 0 || slot >= 27) continue;
        container.inventory.setStack(slot, lootToStack(loot));
      }
    }
  }
}
