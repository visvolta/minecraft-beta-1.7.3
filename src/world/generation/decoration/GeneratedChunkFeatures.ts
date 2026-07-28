import type { LootStack } from './DungeonLoot';

export interface GeneratedDungeonChest {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly contents: ReadonlyMap<number, LootStack>;
}

export interface GeneratedDungeonFeature {
  readonly spawnerX: number;
  readonly spawnerY: number;
  readonly spawnerZ: number;
  readonly mobId: string;
  readonly chests: readonly GeneratedDungeonChest[];
}

/**
 * Side-channel payload produced alongside chunk blocks/metadata so runtime
 * systems (chests, spawners) can materialise gameplay objects after generation.
 */
export interface GeneratedChunkFeatures {
  readonly dungeons: readonly GeneratedDungeonFeature[];
}

export function emptyGeneratedFeatures(): GeneratedChunkFeatures {
  return { dungeons: [] };
}
