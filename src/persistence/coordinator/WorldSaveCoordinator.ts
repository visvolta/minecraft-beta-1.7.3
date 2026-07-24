import { decodeWorldMetadata, encodeWorldMetadata, GENERATOR_VERSION, SAVE_VERSION, type WorldMetadata, WORLD_METADATA_VERSION } from '../metadata/WorldMetadata';
import type { WorldStorage } from '../storage/WorldStorage';
import type { ChunkPersistenceQueue } from '../queue/ChunkPersistenceQueue';
import type { ChunkManager } from '../../world/ChunkManager';
import { Difficulty } from '../../world/Difficulty';
import { GameMode } from '../../player/GameMode';
import { getActiveSaveTrace, measureSaveAsync, measureSaveSync, recordSaveEvent } from '../debug/SavePipelineTrace';

export interface SaveMetrics { readonly dirty: boolean; readonly saves: number; readonly failures: number; readonly lastError: string | undefined; }
const KEY = 'metadata.json';

/** Persistence owns writes and dirty state; Engine deliberately owns when autosave is triggered. */
export class WorldSaveCoordinator {
  private metadata: WorldMetadata;
  private dirty = false;
  private saves = 0;
  private failures = 0;
  private lastError: string | undefined;
  private chunkQueue?: ChunkPersistenceQueue;
  private chunkManager?: ChunkManager;

  private constructor(private readonly storage: WorldStorage, metadata: WorldMetadata) {
    this.metadata = metadata;
  }

  public static async open(storage: WorldStorage, fallback: WorldMetadata): Promise<WorldSaveCoordinator> {
    const bytes = await storage.get(fallback.worldId, KEY);
    return new WorldSaveCoordinator(storage, bytes === undefined ? fallback : decodeWorldMetadata(bytes));
  }

  public attachPersistence(chunkManager: ChunkManager, chunkQueue: ChunkPersistenceQueue): void {
    this.chunkManager = chunkManager;
    this.chunkQueue = chunkQueue;
  }

  public getMetadata(): WorldMetadata { return this.metadata; }
  public isDirty(): boolean { return this.dirty; }
  public getMetrics(): SaveMetrics { return { dirty: this.dirty, saves: this.saves, failures: this.failures, lastError: this.lastError }; }

  public update(metadata: WorldMetadata): void {
    if (JSON.stringify(this.metadata) !== JSON.stringify(metadata)) {
      this.metadata = metadata;
      this.dirty = true;
    }
  }

  public async flushDirtyChunks(): Promise<void> {
    console.info('[SavePipelineTrace] save.coordinator.flush_chunks_enter', { operationId: getActiveSaveTrace()?.id ?? null, queueStats: this.chunkQueue?.getStats() ?? null });
    if (this.chunkQueue !== undefined && this.chunkManager !== undefined) {
      await this.chunkQueue.saveAllDirty(this.chunkManager);
    }
  }

  public async commitRegions(): Promise<void> {
    if (this.chunkQueue !== undefined) await this.chunkQueue.commitRegions();
  }

  public async writeMetadata(): Promise<void> {
    const now = Date.now();
    this.metadata = { ...this.metadata, lastPlayedMs: now, lastPlayedAt: now };
    await this.storage.put(this.metadata.worldId, KEY, encodeWorldMetadata(this.metadata));
    this.dirty = false;
    this.saves++;
    this.lastError = undefined;
  }

  public async save(force = false): Promise<void> {
    const dirtyChunkCount = measureSaveSync('save.coordinator.enumerate_dirty_chunks', {
      force,
      metadataDirty: this.dirty,
    }, () => {
      let dirtyChunks = 0;
      if (this.chunkManager !== undefined) {
        for (const chunk of this.chunkManager) if (chunk.isPersistenceDirty()) dirtyChunks++;
      }
      return dirtyChunks;
    });
    const hasDirtyChunks = dirtyChunkCount > 0;
    recordSaveEvent('save.coordinator.enumeration_complete', {
      force,
      metadataDirty: this.dirty,
      dirtyChunkCount,
    });
    if (!this.dirty && !force && !hasDirtyChunks) return;

    try {
      if (force && this.chunkQueue !== undefined && this.chunkManager !== undefined) {
        const chunkQueue = this.chunkQueue;
        const chunkManager = this.chunkManager;
        await measureSaveAsync('save.coordinator.flush_dirty_chunks', {
          dirtyChunkCount,
          pendingChunkQueue: chunkQueue.getStats(),
        }, async () => {
          await chunkQueue.saveAllDirty(chunkManager);
        });
      }

      this.metadata = measureSaveSync('save.coordinator.timestamp_metadata', {
        dirtyChunkCount,
      }, () => {
        const now = Date.now();
        return {
          ...this.metadata,
          lastPlayedMs: now,
          lastPlayedAt: now,
        };
      });

      await measureSaveAsync('save.coordinator.write_metadata', {
        worldId: this.metadata.worldId,
        key: KEY,
      }, async () => {
        await this.storage.put(this.metadata.worldId, KEY, encodeWorldMetadata(this.metadata));
      });

      this.dirty = false;
      this.saves++;
      this.lastError = undefined;
    } catch (error) {
      this.failures++;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
}

export function createDefaultMetadata(): WorldMetadata {
  return {
    formatVersion: WORLD_METADATA_VERSION,
    worldId: 'default',
    name: 'Default World',
    displayName: 'Default World',
    seed: '-47',
    seedText: '-47',
    createdAt: 0,
    lastPlayedAt: 0,
    saveVersion: SAVE_VERSION,
    generatorVersion: GENERATOR_VERSION,
    spawn: { x: 8, y: 140, z: 8 },
    player: { x: 8, y: 140, z: 8, yaw: 0, pitch: 0 },
    playerHealth: { health: 20, maxHealth: 20 },
    playerFood: { hunger: 20, saturation: 5, exhaustion: 0 },
    gameMode: GameMode.Survival,
    timeTicks: 0,
    difficulty: Difficulty.Normal,
    weather: { raining: false, thundering: false, rainTime: 0, thunderTime: 0 },
    autosave: { enabled: true, intervalSeconds: 30 },
    lastPlayedMs: 0,
  };
}
