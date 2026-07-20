import type { Chunk } from '../../world/Chunk.ts';
import { ChunkSerializer } from '../nbt/ChunkSerializer.ts';
import { RegionCoordinator } from './RegionCoordinator.ts';
import { encodeNbt, decodeNbt } from '../nbt/NbtCodec.ts';
import { RegionCorruptionError } from '../region/RegionCorruptionError.ts';
import type { NbtCompound, NbtTag } from '../nbt/Nbt.ts';

/**
 * Bridge between chunk persistence and the EntityManager. Lets chunks save and
 * load their owned entities without the queue depending on entity internals.
 */
export interface ChunkEntityHooks {
  serializeChunkEntities(chunkX: number, chunkZ: number): NbtTag[];
  loadChunkEntities(tags: readonly NbtCompound[]): void;
  hasParkedEntities(chunkX: number, chunkZ: number): boolean;
}

interface QueuedRead {
  chunkX: number;
  chunkZ: number;
  resolve: (chunk: Chunk | undefined | 'corrupt') => void;
  reject: (err: unknown) => void;
}

interface QueuedUnload {
  chunk: Chunk;
  resolve: () => void;
  reject: (err: unknown) => void;
  canceled: boolean;
  retries: number;
}

function chunkKey(x: number, z: number): string {
  return `${x},${z}`;
}

export class ChunkPersistenceQueue {
  private readonly reads: QueuedRead[] = [];
  private readonly unloads = new Map<string, QueuedUnload>();
  private activeReads = 0;
  private readonly maxActiveReads = 4;

  private activeSaves = 0;

  private readonly regionCoordinator: RegionCoordinator;

  private pendingPeriodicFlush: ReturnType<typeof setTimeout> | null = null;
  private stats = { saved: 0, failed: 0, loaded: 0 };
  private entityHooks: ChunkEntityHooks | null = null;

  public constructor(regionCoordinator: RegionCoordinator) {
    this.regionCoordinator = regionCoordinator;
  }

  /** Connects the EntityManager so chunks can save/load their entities. */
  public setEntityHooks(hooks: ChunkEntityHooks): void {
    this.entityHooks = hooks;
  }

  public getStats() {
    return {
      pendingReads: this.reads.length,
      activeReads: this.activeReads,
      blockedUnloads: this.unloads.size,
      activeSaves: this.activeSaves,
      chunksLoaded: this.stats.loaded,
      chunksSaved: this.stats.saved,
      saveFailures: this.stats.failed,
    };
  }

  public enqueueRead(chunkX: number, chunkZ: number): Promise<Chunk | undefined | 'corrupt'> {
    return new Promise((resolve, reject) => {
      this.reads.push({ chunkX, chunkZ, resolve, reject });
      this.pumpReads();
    });
  }

  public requestUnload(chunk: Chunk): Promise<void> {
    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    if (!chunk.isPersistenceDirty()) {
      return Promise.resolve();
    }

    let queued = this.unloads.get(key);
    if (queued) {
      queued.canceled = false;
      return Promise.resolve(); // already tracking it
    }

    return new Promise((resolve, reject) => {
      queued = { chunk, resolve, reject, canceled: false, retries: 0 };
      this.unloads.set(key, queued);
      this.processUnload(queued!);
    });
  }

  public cancelUnload(chunk: Chunk): void {
    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    const queued = this.unloads.get(key);
    if (queued) {
      queued.canceled = true;
      this.unloads.delete(key);
    }
  }

  private pumpReads(): void {
    while (this.reads.length > 0 && this.activeReads < this.maxActiveReads) {
      const read = this.reads.shift()!;
      this.activeReads++;
      this.processRead(read).finally(() => {
        this.activeReads--;
        this.pumpReads();
      });
    }
  }

  private async processRead(read: QueuedRead): Promise<void> {
    try {
      const rx = Math.floor(read.chunkX / 32);
      const rz = Math.floor(read.chunkZ / 32);
      const region = await this.regionCoordinator.getRegion(rx, rz);

      const lx = read.chunkX & 31;
      const lz = read.chunkZ & 31;

      const bytes = await region.getChunkData(lx, lz);
      if (!bytes) {
        read.resolve(undefined);
        return;
      }

      const decoded = decodeNbt(bytes);
      const chunk = ChunkSerializer.decodeChunk(decoded.root);
      chunk.markAsLoadedFromDisk();
      this.stats.loaded++;
      // Restore owned entities from disk unless in-memory parked entities are
      // authoritative for this chunk (a same-session re-stream).
      if (this.entityHooks !== null && !this.entityHooks.hasParkedEntities(read.chunkX, read.chunkZ)) {
        const entityTags = ChunkSerializer.decodeEntities(decoded.root);
        if (entityTags.length > 0) {
          this.entityHooks.loadChunkEntities(entityTags);
        }
      }
      read.resolve(chunk);
    } catch (err) {
      if (err instanceof RegionCorruptionError) {
        read.resolve('corrupt');
      } else {
        read.reject(err);
      }
    }
  }

  private schedulePeriodicFlush(): void {
    if (this.pendingPeriodicFlush === null) {
      this.pendingPeriodicFlush = setTimeout(() => {
        this.pendingPeriodicFlush = null;
        this.regionCoordinator.commitAll().catch(() => {});
      }, 5000);
    }
  }

  private async saveChunk(chunk: Chunk): Promise<number> {
    this.activeSaves++;
    try {
      const snapshotRevision = chunk.getPersistenceRevision();
      const entityTags = this.entityHooks?.serializeChunkEntities(chunk.chunkX, chunk.chunkZ) ?? [];
      const nbt = ChunkSerializer.encodeChunk(chunk, 0n, entityTags);
      const bytes = encodeNbt(nbt, '');

      const rx = Math.floor(chunk.chunkX / 32);
      const rz = Math.floor(chunk.chunkZ / 32);
      const lx = chunk.chunkX & 31;
      const lz = chunk.chunkZ & 31;

      const region = await this.regionCoordinator.getRegion(rx, rz);
      await region.setChunkData(lx, lz, bytes, Math.floor(Date.now() / 1000));
      this.stats.saved++;
      this.schedulePeriodicFlush();
      return snapshotRevision;
    } finally {
      this.activeSaves--;
    }
  }

  private async processUnload(unload: QueuedUnload): Promise<void> {
    try {
      const snapshotRevision = await this.saveChunk(unload.chunk);
      if (!unload.canceled) {
        const rx = Math.floor(unload.chunk.chunkX / 32);
        const rz = Math.floor(unload.chunk.chunkZ / 32);
        await this.regionCoordinator.commitRegion(rx, rz);
        unload.chunk.markPersistenceClean(snapshotRevision);
      }
    } catch (err) {
      this.stats.failed++;
      unload.retries++;
      if (!unload.canceled) {
        // Backoff and retry
        setTimeout(() => this.processUnload(unload), Math.min(30000, 1000 * Math.pow(2, unload.retries)));
      }
      return;
    }

    if (!unload.canceled) {
      this.unloads.delete(chunkKey(unload.chunk.chunkX, unload.chunk.chunkZ));
      unload.resolve();
    }
  }

  public async saveAllDirty(chunks: Iterable<Chunk>): Promise<void> {
    const promises: Promise<{ chunk: Chunk, revision: number }>[] = [];
    for (const chunk of chunks) {
      if (chunk.isPersistenceDirty() && !this.unloads.has(chunkKey(chunk.chunkX, chunk.chunkZ))) {
        promises.push(this.saveChunk(chunk).then(revision => ({ chunk, revision })));
      }
    }
    const snapshots = await Promise.all(promises);
    await this.regionCoordinator.commitAll();

    // Now that commit All is done, mark them clean
    for (const { chunk, revision } of snapshots) {
      chunk.markPersistenceClean(revision);
    }

    // Also await any unloads that are currently saving
    const unloadPromises: Promise<void>[] = [];
    for (const unload of this.unloads.values()) {
      unloadPromises.push(new Promise<void>((resolve) => {
        const originalResolve = unload.resolve;
        unload.resolve = () => { originalResolve(); resolve(); };
      }));
    }
    await Promise.all(unloadPromises);
  }
}
