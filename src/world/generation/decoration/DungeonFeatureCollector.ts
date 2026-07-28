import type { LootStack } from './DungeonLoot';
import type { DungeonPopulationSink } from './WorldGenDungeons';
import type { GeneratedDungeonChest, GeneratedDungeonFeature } from './GeneratedChunkFeatures';

/**
 * Collects dungeon chest/spawner callbacks during populate and merges chests
 * that belong to the same room (same spawner placed after chests in Beta).
 *
 * Beta places up to 2 chests then the spawner. We buffer chests until a
 * spawner is reported; any trailing chests without a spawner are dropped
 * (failed dungeon) matching unusable chest blocks without TE in edge cases.
 */
export class DungeonFeatureCollector implements DungeonPopulationSink {
  private openChests: GeneratedDungeonChest[] = [];
  private readonly completed: GeneratedDungeonFeature[] = [];

  public onDungeonChest(
    x: number,
    y: number,
    z: number,
    contents: ReadonlyMap<number, LootStack>,
  ): void {
    this.openChests.push({ x, y, z, contents: new Map(contents) });
  }

  public onDungeonSpawner(x: number, y: number, z: number, mobId: string): void {
    this.completed.push({
      spawnerX: x,
      spawnerY: y,
      spawnerZ: z,
      mobId,
      chests: this.openChests,
    });
    this.openChests = [];
  }

  public takeFeatures(): GeneratedDungeonFeature[] {
    // Discard orphan chests from failed rooms (no spawner placed).
    this.openChests = [];
    const out = this.completed.slice();
    this.completed.length = 0;
    return out;
  }
}
