import type { Chunk } from '../../world/Chunk.ts';
import { ChunkSerializer } from '../nbt/ChunkSerializer.ts';
import { RegionCoordinator } from './RegionCoordinator.ts';
import { encodeNbt, decodeNbt } from '../nbt/NbtCodec.ts';
import { RegionCorruptionError } from '../region/RegionCorruptionError.ts';
import type { NbtCompound, NbtTag } from '../nbt/Nbt.ts';
import { getActiveSaveTrace, measureSaveAsync, measureSaveSync, recordSaveEvent, recordSaveFailure } from '../debug/SavePipelineTrace.ts';

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
  completion: Promise<void>;
  canceled: boolean;
  settled: boolean;
  processing: boolean;
  retryTimerActive: boolean;
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
  private readonly retryTimers = new Set<ReturnType<typeof setTimeout>>();
  private lastFailure: string | undefined;
  private stats = { saved: 0, failed: 0, loaded: 0 };
  private entityHooks: ChunkEntityHooks | null = null;
  private simulationTickProvider: () => number = () => 0;
  private disposed = false;

  public constructor(regionCoordinator: RegionCoordinator) {
    this.regionCoordinator = regionCoordinator;
  }

  /** Connects the EntityManager so chunks can save/load their entities. */
  public setEntityHooks(hooks: ChunkEntityHooks): void {
    this.entityHooks = hooks;
  }

  public setSimulationTickProvider(provider: () => number): void {
    this.simulationTickProvider = provider;
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
      retryTimers: this.retryTimers.size,
      pendingPeriodicFlush: this.pendingPeriodicFlush !== null,
      regionCoordinator: this.regionCoordinator.getStats(),
      lastFailure: this.lastFailure,
    };
  }

  public enqueueRead(chunkX: number, chunkZ: number): Promise<Chunk | undefined | 'corrupt'> {
    if (this.disposed) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => {
      this.reads.push({ chunkX, chunkZ, resolve, reject });
      this.pumpReads();
    });
  }

  public requestUnload(chunk: Chunk): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    if (!chunk.isPersistenceDirty()) {
      recordSaveEvent('save.queue.unload_skipped_clean_chunk', {
        key,
        queueStats: this.getStats(),
      });
      return Promise.resolve();
    }

    let queued = this.unloads.get(key);
    if (queued) {
      queued.canceled = false;
      recordSaveEvent('save.queue.unload_reused', {
        key,
        retries: queued.retries,
        queueStats: this.getStats(),
      });
      return queued.completion;
    }

    let complete!: () => void;
    let fail!: (error: unknown) => void;
    const completion = new Promise<void>((resolve, reject) => {
      complete = resolve;
      fail = reject;
    });
    queued = { chunk, resolve: complete, reject: fail, completion, canceled: false, settled: false, processing: false, retryTimerActive: false, retries: 0 };
    this.unloads.set(key, queued);
      recordSaveEvent('save.queue.unload_enqueued', {
        key,
        queueStats: this.getStats(),
        persistenceRevision: chunk.getPersistenceRevision(),
      });
    void this.processUnload(queued);
    return completion;
  }

  public cancelUnload(chunk: Chunk): void {
    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    const queued = this.unloads.get(key);
    if (queued) {
      queued.canceled = true;
      this.unloads.delete(key);
      this.settleUnload(queued);
      recordSaveEvent('save.queue.unload_canceled', {
        key,
        retries: queued.retries,
        queueStats: this.getStats(),
      });
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.pendingPeriodicFlush !== null) {
      clearTimeout(this.pendingPeriodicFlush);
      this.pendingPeriodicFlush = null;
    }
    while (this.reads.length > 0) this.reads.shift()!.resolve(undefined);
    for (const unload of this.unloads.values()) {
      unload.canceled = true;
      this.settleUnload(unload);
    }
    this.unloads.clear();
    for (const timer of this.retryTimers) clearTimeout(timer);
    this.retryTimers.clear();
  }

  private pumpReads(): void {
    if (this.disposed) {
      while (this.reads.length > 0) this.reads.shift()!.resolve(undefined);
      return;
    }
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
    if (this.disposed) {
      read.resolve(undefined);
      return;
    }
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
      const chunk = ChunkSerializer.decodeChunk(decoded.root, this.simulationTickProvider());
      chunk.markAsLoadedFromDisk();
      this.stats.loaded++;
      if (this.entityHooks !== null && !this.entityHooks.hasParkedEntities(read.chunkX, read.chunkZ)) {
        const entityTags = ChunkSerializer.decodeEntities(decoded.root);
        if (entityTags.length > 0) this.entityHooks.loadChunkEntities(entityTags);
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
        this.regionCoordinator.commitAll().catch((error) => {
          this.stats.failed++;
          this.lastFailure = error instanceof Error ? error.message : String(error);
          recordSaveFailure('save.queue.periodic_flush_failed', error, {
            queueStats: this.getStats(),
          });
        });
      }, 5000);
    }
  }

  private async saveChunk(chunk: Chunk): Promise<number> {
    this.activeSaves++;
    try {
      const snapshotRevision = chunk.getPersistenceRevision();
      const entityTags = measureSaveSync('save.queue.serialize_entities', {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        snapshotRevision,
      }, () => this.entityHooks?.serializeChunkEntities(chunk.chunkX, chunk.chunkZ) ?? []);
      const nbt = measureSaveSync('save.queue.serialize_chunk', {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        snapshotRevision,
        entityCount: entityTags.length,
      }, () => ChunkSerializer.encodeChunk(chunk, BigInt(this.simulationTickProvider()), entityTags));
      const bytes = measureSaveSync('save.queue.encode_nbt', {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        snapshotRevision,
      }, () => encodeNbt(nbt, ''));

      const rx = Math.floor(chunk.chunkX / 32);
      const rz = Math.floor(chunk.chunkZ / 32);
      const lx = chunk.chunkX & 31;
      const lz = chunk.chunkZ & 31;

      const region = await measureSaveAsync('save.queue.get_region', {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        regionX: rx,
        regionZ: rz,
      }, async () => this.regionCoordinator.getRegion(rx, rz));
      await measureSaveAsync('save.queue.write_region_chunk', {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        regionX: rx,
        regionZ: rz,
        localX: lx,
        localZ: lz,
        bytes: bytes.byteLength,
        snapshotRevision,
        queueStatsBeforeWrite: this.getStats(),
      }, async () => {
        await region.setChunkData(lx, lz, bytes, Math.floor(Date.now() / 1000));
      });
      this.stats.saved++;
      this.schedulePeriodicFlush();
      return snapshotRevision;
    } finally {
      this.activeSaves--;
    }
  }

  private settleUnload(unload: QueuedUnload, error?: unknown): void {
    if (unload.settled) return;
    unload.settled = true;
    unload.processing = false;
    unload.retryTimerActive = false;
    if (error === undefined) unload.resolve();
    else unload.reject(error);
  }

  private async processUnload(unload: QueuedUnload): Promise<void> {
    unload.processing = true;
    unload.retryTimerActive = false;
    const key = chunkKey(unload.chunk.chunkX, unload.chunk.chunkZ);
    if (this.disposed) {
      this.settleUnload(unload);
      return;
    }
    recordSaveEvent('save.queue.unload_begin', {
      key,
      retries: unload.retries,
      queueStats: this.getStats(),
    });
    try {
      const snapshotRevision = await this.saveChunk(unload.chunk);
      if (this.disposed) {
        this.settleUnload(unload);
        return;
      }
      if (!unload.canceled) {
        const rx = Math.floor(unload.chunk.chunkX / 32);
        const rz = Math.floor(unload.chunk.chunkZ / 32);
        await measureSaveAsync('save.queue.unload_commit_region', {
          key,
          regionX: rx,
          regionZ: rz,
          retries: unload.retries,
          queueStatsBeforeCommit: this.getStats(),
        }, async () => {
          await this.regionCoordinator.commitRegion(rx, rz);
        });
        unload.chunk.markPersistenceClean(snapshotRevision);
        if (unload.chunk.isPersistenceDirty()) {
          recordSaveEvent('save.queue.unload_chunk_redirtied', {
            key,
            retries: unload.retries,
            snapshotRevision,
            currentRevision: unload.chunk.getPersistenceRevision(),
          });
          await this.processUnload(unload);
          return;
        }
      }
    } catch (err) {
      this.stats.failed++;
      this.lastFailure = err instanceof Error ? err.message : String(err);
      unload.retries++;
      const retryDelayMs = Math.min(30000, 1000 * Math.pow(2, unload.retries));
      recordSaveFailure('save.queue.unload_retry_scheduled', err, {
        key,
        retries: unload.retries,
        retryDelayMs,
        canceled: unload.canceled,
        disposed: this.disposed,
        queueStats: this.getStats(),
      });
      if (!unload.canceled && !this.disposed) {
        unload.processing = false;
        unload.retryTimerActive = true;
        const timer = setTimeout(() => {
          this.retryTimers.delete(timer);
          void this.processUnload(unload);
        }, retryDelayMs);
        this.retryTimers.add(timer);
      } else {
        this.unloads.delete(key);
        this.settleUnload(unload, err);
      }
      return;
    }

    if (!unload.canceled) {
      this.unloads.delete(key);
      recordSaveEvent('save.queue.unload_complete', {
        key,
        retries: unload.retries,
        queueStats: this.getStats(),
      });
      this.settleUnload(unload);
    }
  }

  public async saveSomeDirty(chunks: Iterable<Chunk>, maxChunks: number): Promise<number> {
    if (this.disposed || maxChunks <= 0) return 0;
    const snapshots: Array<{ chunk: Chunk; revision: number; regionX: number; regionZ: number }> = [];
    let saved = 0;
    for (const chunk of chunks) {
      if (saved >= maxChunks) break;
      if (!chunk.isPersistenceDirty() || this.unloads.has(chunkKey(chunk.chunkX, chunk.chunkZ))) continue;
      const revision = await this.saveChunk(chunk);
      snapshots.push({
        chunk,
        revision,
        regionX: Math.floor(chunk.chunkX / 32),
        regionZ: Math.floor(chunk.chunkZ / 32),
      });
      saved++;
    }
    const touchedRegions = new Set<string>();
    for (const snapshot of snapshots) touchedRegions.add(`${snapshot.regionX},${snapshot.regionZ}`);
    for (const key of touchedRegions) {
      const [regionX, regionZ] = key.split(',').map(Number) as [number, number];
      await this.regionCoordinator.commitRegion(regionX, regionZ);
    }
    for (const { chunk, revision } of snapshots) {
      if (chunk.getPersistenceRevision() === revision) chunk.markPersistenceClean(revision);
    }
    return saved;
  }

  public async commitRegions(): Promise<void> {
    await this.regionCoordinator.commitAll();
  }

  private diagnosticSnapshot(): Record<string, unknown> {
    return {
      operationId: getActiveSaveTrace()?.id ?? null,
      disposed: this.disposed,
      activeSaves: this.activeSaves,
      retryTimers: this.retryTimers.size,
      pendingUnloads: [...this.unloads.entries()].map(([key, unload]) => ({
        key,
        processing: unload.processing,
        canceled: unload.canceled,
        settled: unload.settled,
        retries: unload.retries,
        retryTimerActive: unload.retryTimerActive,
        completionState: unload.settled ? 'settled' : 'pending',
      })),
    };
  }

  public async saveAllDirty(chunks: Iterable<Chunk>): Promise<void> {
    console.info('[SavePipelineTrace] save.queue.save_all_dirty_enter', this.diagnosticSnapshot());
    if (this.disposed) {
      console.info('[SavePipelineTrace] save.queue.save_all_dirty_complete', { ...this.diagnosticSnapshot(), reason: 'disposed' });
      return;
    }
    const candidates = measureSaveSync('save.queue.collect_dirty_chunks', {
      queueStats: this.getStats(),
    }, () => {
      const collected: Chunk[] = [];
      for (const chunk of chunks) {
        if (chunk.isPersistenceDirty() && !this.unloads.has(chunkKey(chunk.chunkX, chunk.chunkZ))) collected.push(chunk);
      }
      return collected;
    });

    console.info('[SavePipelineTrace] save.queue.dirty_enumeration_complete', { ...this.diagnosticSnapshot(), dirtyChunkCount: candidates.length });
    console.info('[SavePipelineTrace] save.queue.dirty_chunk_count', candidates.length);
    console.info('[SavePipelineTrace] save.queue.dirty_flush_begin', { ...this.diagnosticSnapshot(), dirtyChunkCount: candidates.length });
    const dirtyFlushWatchdog = setTimeout(() => console.warn('[SavePipelineTrace] save.queue.dirty_flush_pending', this.diagnosticSnapshot()), 5000);
    const snapshots = await measureSaveAsync('save.queue.flush_dirty_chunks', {
      dirtyChunkCount: candidates.length,
      pendingUnloadCount: this.unloads.size,
      queueStats: this.getStats(),
    }, async () => Promise.all(candidates.map((chunk) => this.saveChunk(chunk).then((revision) => ({ chunk, revision })) )));
    clearTimeout(dirtyFlushWatchdog);
    console.info('[SavePipelineTrace] save.queue.dirty_flush_complete', { ...this.diagnosticSnapshot(), savedChunkCount: snapshots.length });

    await measureSaveAsync('save.queue.commit_all_regions', {
      savedChunkCount: snapshots.length,
      pendingUnloadCount: this.unloads.size,
      queueStats: this.getStats(),
    }, async () => {
      await this.regionCoordinator.commitAll();
    });

    measureSaveSync('save.queue.mark_chunks_clean', {
      savedChunkCount: snapshots.length,
    }, () => {
      for (const { chunk, revision } of snapshots) {
        if (chunk.getPersistenceRevision() === revision) chunk.markPersistenceClean(revision);
      }
    });

    const unloadPromises = measureSaveSync('save.queue.capture_pending_unloads', {
      pendingUnloadCount: this.unloads.size,
      queueStats: this.getStats(),
    }, () => [...this.unloads.values()].map((unload) => unload.completion));

    console.info('[SavePipelineTrace] save.queue.pending_unload_count', { ...this.diagnosticSnapshot(), pendingUnloadCount: unloadPromises.length });
    console.info('[SavePipelineTrace] save.queue.wait_unloads_begin', this.diagnosticSnapshot());
    const unloadWatchdog = setTimeout(() => console.warn('[SavePipelineTrace] save.queue.wait_unloads_pending', this.diagnosticSnapshot()), 5000);
    await measureSaveAsync('save.queue.wait_unload_saves', {
      pendingUnloadCount: unloadPromises.length,
      queueStats: this.getStats(),
      unresolvedPromises: unloadPromises.length,
    }, async () => {
      await Promise.all(unloadPromises);
    });
    clearTimeout(unloadWatchdog);
    console.info('[SavePipelineTrace] save.queue.wait_unloads_complete', this.diagnosticSnapshot());
    console.info('[SavePipelineTrace] save.queue.save_all_dirty_complete', this.diagnosticSnapshot());
  }
}
