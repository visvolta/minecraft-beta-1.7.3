import type { Chunk } from '../world/Chunk.ts';
import { ChunkSerializer } from '../nbt/ChunkSerializer.ts';
import { encodeNbt, decodeNbt } from '../nbt/NbtCodec.ts';
import { DIMENSION_OVERWORLD, type DimensionId } from '../world/dimension/DimensionId';
import type { NbtTag, NbtCompound } from '../nbt/Nbt.ts';
import { encodeWorldMetadata, decodeWorldMetadata, type WorldMetadata } from '../world/WorldMetadata.ts';
import { compressDeflate, decompressDeflate } from './codec/Compression.ts';
import { buildChunkRecord, decodeChunkRecord, encodeChunkRecord } from './codec/ChunkRecord.ts';
import { RecordCorruptionError } from './codec/PersistenceError.ts';
import type { StorageBackend, WorldSummary } from './backend/StorageBackend.ts';
import { PrioritySerialExecutor, type ExecutorDiagnostics } from './exec/PrioritySerialExecutor.ts';
import { BoundedExecutor } from './exec/BoundedExecutor.ts';

/**
 * The single authoritative world-persistence service — the sole persistence
 * owner for one world session.
 *
 * Stage 2 status: wired into production gameplay for NEW-format worlds (the
 * whole gameplay path is new-format in Stage 2; legacy is unreachable). One
 * service per world session; the application owns the shared backend and the
 * service NEVER closes it.
 *
 * Design:
 *   - One serialized WRITE lane (PrioritySerialExecutor) owns chunk saves,
 *     unload saves, metadata/player writes and forced saves — so writes to the
 *     same chunk never overlap and there is exactly one owner per write.
 *   - One bounded READ lane (BoundedExecutor) owns chunk/metadata reads.
 *   - Forced save marks the world closing (rejecting new background writes and
 *     new reads), enqueues forced chunk writes at high priority, then awaits a
 *     sequence-based flush barrier covering every write accepted before it.
 *   - Dirty transitions are deterministic: a chunk is marked clean only for the
 *     exact revision that was written. `savedAt` is diagnostic only; revisions
 *     and executor acceptance sequence numbers determine correctness. The clock
 *     is injectable for tests.
 *   - Unload is a STATE TRANSITION: the caller stops normal mutation first, the
 *     service saves the final revision once, and the caller removes the chunk
 *     only after the save succeeds — no unbounded save-until-clean loop.
 *   - Corruption fails loud: a present-but-invalid record throws
 *     RecordCorruptionError (with the failing validation stage) and the stored
 *     record is left untouched. A missing record returns undefined so terrain
 *     may generate.
 *   - The service is independent of ChunkManager: the engine supplies iterable
 *     chunks for bounded autosave and forced save.
 */

export const WRITE_PRIORITY_BACKGROUND = 0;
export const WRITE_PRIORITY_FORCED = 1;

const METADATA_KEY = 'metadata';

import { chunkKey } from '../world/chunkKey';

/** Optional bridge to entity (de)serialization; unset when there are no entities. */
export interface PersistenceEntityHooks {
  serializeChunkEntities(chunkX: number, chunkZ: number): NbtTag[];
  loadChunkEntities(tags: readonly NbtCompound[]): void;
  hasParkedEntities(chunkX: number, chunkZ: number): boolean;
}

export interface WorldPersistenceServiceOptions {
  backend: StorageBackend;
  /** Injectable clock for the diagnostic `savedAt`; defaults to Date.now. */
  clock?: () => number;
  /** Bounded read-lane concurrency; defaults to 4. */
  readConcurrency?: number;
}

export interface WorldPersistenceStats {
  worldId: string | null;
  opened: boolean;
  closing: boolean;
  closed: boolean;
  pendingUnloads: number;
  write: { active: number; pending: number; accepted: number; closed: boolean };
  read: { active: number; pending: number; closed: boolean };
}

export interface PersistenceErrorInfo {
  message: string;
  timeMs: number;
}

export interface PersistencePerformanceStats {
  readonly lastChunkEncodeMs: number;
  readonly lastChunkWriteMs: number;
  readonly lastChunkReadMs: number;
  readonly lastChunkDecodeMs: number;
  readonly lastMetadataWriteMs: number;
  readonly lastMetadataReadMs: number;
  readonly lastFlushBarrierMs: number;
}

type MutablePersistencePerformanceStats = {
  -readonly [Key in keyof PersistencePerformanceStats]: PersistencePerformanceStats[Key];
};

/** Aggregated service diagnostics for watchdogs / error screens / risk snapshot. */
export interface ServiceDiagnostics {
  worldId: string | null;
  opened: boolean;
  closing: boolean;
  closed: boolean;
  writeLane: ExecutorDiagnostics;
  readLane: { active: number; pending: number; closed: boolean };
  /** Chunks with an accepted-but-not-settled save (by chunk key count). */
  inFlightChunks: number;
  pendingBackgroundSaves: number;
  pendingUnloads: number;
  metadataWriteInFlight: boolean;
  lastError: PersistenceErrorInfo | null;
}

interface UnloadState {
  canceled: boolean;
  promise: Promise<void>;
}

export class WorldPersistenceService {
  private readonly backend: StorageBackend;
  private readonly writeExec = new PrioritySerialExecutor();
  private readonly readExec: BoundedExecutor;
  private readonly clock: () => number;
  private readonly unloads = new Map<number, UnloadState>();
  /** chunk key -> number of accepted-but-not-settled saves (avoids re-selecting in-flight chunks). */
  private readonly inFlightChunks = new Map<number, number>();
  private pendingBackgroundSaves = 0;
  private metadataWriteInFlight = false;
  private lastError: PersistenceErrorInfo | null = null;
  private changeListener: (() => void) | null = null;
  private worldId: string | null = null;
  /**
   * Dimension this service instance reads/writes for. Chunk and record keys
   * are namespaced by it, so Nether (0,0) can never overwrite Overworld (0,0).
   * Defaults to the Overworld, which keeps the historical key format.
   */
  private dimension: DimensionId = DIMENSION_OVERWORLD;
  private metadata: WorldMetadata | null = null;
  private opened = false;
  private closing = false;
  private closed = false;
  private entityHooks: PersistenceEntityHooks | null = null;
  private simulationTickProvider: () => number = () => 0;
  private performanceStats: MutablePersistencePerformanceStats = {
    lastChunkEncodeMs: 0,
    lastChunkWriteMs: 0,
    lastChunkReadMs: 0,
    lastChunkDecodeMs: 0,
    lastMetadataWriteMs: 0,
    lastMetadataReadMs: 0,
    lastFlushBarrierMs: 0,
  };

  public constructor(options: WorldPersistenceServiceOptions) {
    this.backend = options.backend;
    this.clock = options.clock ?? ((): number => Date.now());
    this.readExec = new BoundedExecutor(options.readConcurrency ?? 4);
  }

  public setEntityHooks(hooks: PersistenceEntityHooks | null): void {
    this.entityHooks = hooks;
  }

  public setSimulationTickProvider(provider: () => number): void {
    this.simulationTickProvider = provider;
  }

  /** Event-driven state change notification (correction 8). The engine subscribes. */
  public setChangeListener(listener: (() => void) | null): void {
    this.changeListener = listener;
  }

  private notifyChange(): void {
    this.changeListener?.();
  }

  /** Clears the recorded last error (e.g. after a successful forced save / resume). */
  public clearLastError(): void {
    if (this.lastError !== null) {
      this.lastError = null;
      this.notifyChange();
    }
  }

  public getLastError(): PersistenceErrorInfo | null {
    return this.lastError;
  }

  private recordError(error: unknown): void {
    this.lastError = { message: error instanceof Error ? error.message : String(error), timeMs: this.clock() };
  }

  public getWorldId(): string | null {
    return this.worldId;
  }

  /** Dimension whose records this service reads and writes. */
  public getDimension(): DimensionId { return this.dimension; }

  /**
   * Rebind this service to another dimension's namespace. Used when a
   * dimension world context is created; callers must quiesce in-flight work
   * first so no write lands in the wrong namespace.
   */
  public setDimension(dimension: DimensionId): void { this.dimension = dimension; }

  public get isClosing(): boolean {
    return this.closing;
  }

  public get isClosed(): boolean {
    return this.closed;
  }

  public getPerformanceStats(): PersistencePerformanceStats {
    return this.performanceStats;
  }

  public getStats(): WorldPersistenceStats {
    return {
      worldId: this.worldId,
      opened: this.opened,
      closing: this.closing,
      closed: this.closed,
      pendingUnloads: this.unloads.size,
      write: {
        active: this.writeExec.activeCount,
        pending: this.writeExec.pendingCount,
        accepted: this.writeExec.acceptedCount,
        closed: this.writeExec.isClosed,
      },
      read: {
        active: this.readExec.activeCount,
        pending: this.readExec.pendingCount,
        closed: this.readExec.isClosed,
      },
    };
  }

  public async open(worldId: string): Promise<void> {
    if (this.opened) throw new Error('WorldPersistenceService is already opened');
    if (this.closed) throw new Error('WorldPersistenceService is closed');
    await this.backend.open();
    this.worldId = worldId;
    this.opened = true;
  }

  // --- metadata ---

  /** Reads and caches the world metadata record; `undefined` if absent. Fails loud on corruption. */
  public loadMetadata(): Promise<WorldMetadata | undefined> {
    const guardError = this.readGuardError();
    if (guardError !== undefined) return Promise.reject(guardError);
    const worldId = this.worldId!;
    return this.readExec.enqueue(async () => {
      const readStart = performance.now();
      const bytes = await this.backend.readRecord(worldId, METADATA_KEY);
      this.performanceStats.lastMetadataReadMs = performance.now() - readStart;
      if (bytes === undefined) {
        this.metadata = null;
        return undefined;
      }
      try {
        const metadata = decodeWorldMetadata(bytes);
        this.metadata = metadata;
        return metadata;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stage = message.toLowerCase().includes('version') ? 'version' : 'schema';
        throw new RecordCorruptionError('metadata', message, { worldId, chunkX: undefined, chunkZ: undefined, stage });
      }
    });
  }

  public getMetadata(): WorldMetadata | null {
    return this.metadata;
  }

  /** Caches and durably writes the world metadata (player data lives in metadata). */
  public saveMetadata(metadata: WorldMetadata, priority: number = WRITE_PRIORITY_BACKGROUND): Promise<void> {
    const guardError = this.writeGuardError(priority);
    if (guardError !== undefined) return Promise.reject(guardError);
    const worldId = this.worldId!;
    this.metadata = metadata;
    this.metadataWriteInFlight = true;
    this.notifyChange();
    const task = this.writeExec.enqueue(async () => {
      const metadataStart = performance.now();
      const bytes = encodeWorldMetadata(metadata);
      await this.backend.writeRecord(worldId, METADATA_KEY, bytes);
      this.performanceStats.lastMetadataWriteMs = performance.now() - metadataStart;
    }, priority);
    return task.then(
      () => {
        this.metadataWriteInFlight = false;
        this.notifyChange();
      },
      (error) => {
        this.metadataWriteInFlight = false;
        this.recordError(error);
        this.notifyChange();
        throw error;
      },
    );
  }

  // --- chunk reads ---

  /**
   * Load a chunk on the bounded read lane. Returns `undefined` when no record
   * exists (caller may generate terrain). Throws `RecordCorruptionError` if a
   * record exists but fails validation — the stored record is left untouched.
   */
  public loadChunk(chunkX: number, chunkZ: number): Promise<Chunk | undefined> {
    const guardError = this.readGuardError();
    if (guardError !== undefined) return Promise.reject(guardError);
    const worldId = this.worldId!;
    // Capture the dimension at ENQUEUE time. Reading `this.dimension` inside
    // the deferred task would use whichever dimension is active when the task
    // finally runs, so a queued Overworld read could resolve against Nether
    // keys after a portal transition.
    const dimension = this.dimension;
    return this.readExec.enqueue(async () => {
      const readStart = performance.now();
      const bytes = await this.backend.readChunk(worldId, chunkX, chunkZ, dimension);
      this.performanceStats.lastChunkReadMs = performance.now() - readStart;
      if (bytes === undefined) return undefined;
      const decodeStart = performance.now();
      const chunk = await this.decodeChunkRecord(bytes, chunkX, chunkZ, worldId);
      this.performanceStats.lastChunkDecodeMs = performance.now() - decodeStart;
      return chunk;
    });
  }

  // --- chunk writes ---

  /**
   * Save one chunk on the serialized write lane at the given priority. Resolves
   * once the chunk record is durably written; marks the chunk clean only if its
   * revision still equals the captured revision (correction 6 invariant).
   * Background saves are rejected once the world is closing. Tracks in-flight
   * state so autosave never re-selects a chunk already being saved.
   */
  public saveChunk(chunk: Chunk, priority: number = WRITE_PRIORITY_BACKGROUND): Promise<void> {
    const guardError = this.writeGuardError(priority);
    if (guardError !== undefined) return Promise.reject(guardError);
    const worldId = this.worldId!;
    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    const isBackground = priority < WRITE_PRIORITY_FORCED;
    // Captured at enqueue time so a save queued in one dimension can never be
    // written into another dimension's namespace after a transition.
    const dimension = this.dimension;
    this.inFlightChunks.set(key, (this.inFlightChunks.get(key) ?? 0) + 1);
    if (isBackground) this.pendingBackgroundSaves++;
    this.notifyChange();
    const task = this.writeExec.enqueue(async () => {
      const snapshotRevision = chunk.getPersistenceRevision();
      const encodeStart = performance.now();
      const recordBytes = await this.encodeChunkRecord(chunk, snapshotRevision);
      this.performanceStats.lastChunkEncodeMs = performance.now() - encodeStart;
      const writeStart = performance.now();
      await this.backend.writeChunk(worldId, chunk.chunkX, chunk.chunkZ, recordBytes, dimension);
      this.performanceStats.lastChunkWriteMs = performance.now() - writeStart;
      // Captured-revision invariant: clean only if still at the captured revision.
      if (chunk.getPersistenceRevision() === snapshotRevision) {
        chunk.markPersistenceClean(snapshotRevision);
      }
    }, priority);
    return task.then(
      () => this.finishChunkSave(key, isBackground, null),
      (error) => {
        this.finishChunkSave(key, isBackground, error);
        throw error;
      },
    );
  }

  private finishChunkSave(key: number, isBackground: boolean, error: unknown): void {
    const count = (this.inFlightChunks.get(key) ?? 1) - 1;
    if (count <= 0) this.inFlightChunks.delete(key);
    else this.inFlightChunks.set(key, count);
    if (isBackground) this.pendingBackgroundSaves = Math.max(0, this.pendingBackgroundSaves - 1);
    if (error !== null) this.recordError(error);
    this.notifyChange();
  }

  public getDiagnostics(): ServiceDiagnostics {
    return {
      worldId: this.worldId,
      opened: this.opened,
      closing: this.closing,
      closed: this.closed,
      writeLane: this.writeExec.getDiagnostics(),
      readLane: { active: this.readExec.activeCount, pending: this.readExec.pendingCount, closed: this.readExec.isClosed },
      inFlightChunks: this.inFlightChunks.size,
      pendingBackgroundSaves: this.pendingBackgroundSaves,
      pendingUnloads: this.unloads.size,
      metadataWriteInFlight: this.metadataWriteInFlight,
      lastError: this.lastError,
    };
  }

  /** Delete a stored chunk record (write lane). */
  public deleteChunk(chunkX: number, chunkZ: number, priority: number = WRITE_PRIORITY_BACKGROUND): Promise<void> {
    const guardError = this.writeGuardError(priority);
    if (guardError !== undefined) return Promise.reject(guardError);
    const worldId = this.worldId!;
    const dimension = this.dimension;
    return this.writeExec.enqueue(async () => {
      await this.backend.deleteChunk(worldId, chunkX, chunkZ, dimension);
    }, priority);
  }

  /**
   * Bounded background autosave: enqueue up to `maxChunks` dirty chunks at the
   * given priority (best-effort — a failure leaves a chunk dirty for a later
   * autosave, while the executor's completion record still lets a barrier
   * surface it). Triggered externally by the engine; the service has no timers.
   * Returns the number of chunks enqueued.
   */
  public saveSomeDirty(chunks: Iterable<Chunk>, maxChunks: number, priority: number = WRITE_PRIORITY_BACKGROUND): Promise<number> {
    const guardError = this.writeGuardError(priority);
    if (guardError !== undefined) return Promise.reject(guardError);
    if (maxChunks <= 0) return Promise.resolve(0);
    let enqueued = 0;
    for (const chunk of chunks) {
      if (enqueued >= maxChunks) break;
      if (!chunk.isPersistenceDirty()) continue;
      const key = chunkKey(chunk.chunkX, chunk.chunkZ);
      if (this.unloads.has(key)) continue;
      if ((this.inFlightChunks.get(key) ?? 0) > 0) continue; // already being saved
      this.saveChunk(chunk, priority).catch(() => undefined);
      enqueued++;
    }
    return Promise.resolve(enqueued);
  }

  // --- unload (state transition) ---

  /**
   * Persist a chunk that is being unloaded. The caller must stop normal mutation
   * of the chunk BEFORE calling this (unload is a state transition). The service
   * saves the chunk's final revision exactly once on the write lane and resolves
   * only after the write succeeds; the caller removes the chunk afterwards. No
   * save-until-clean loop. Re-requesting an in-flight unload reuses its promise.
   */
  public requestUnload(chunk: Chunk): Promise<void> {
    const guardError = this.writeGuardError(WRITE_PRIORITY_BACKGROUND);
    if (guardError !== undefined) return Promise.reject(guardError);
    if (!chunk.isPersistenceDirty()) return Promise.resolve();
    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    const existing = this.unloads.get(key);
    if (existing !== undefined) {
      existing.canceled = false;
      return existing.promise;
    }
    const worldId = this.worldId!;
    const dimension = this.dimension;
    const state: UnloadState = { canceled: false, promise: undefined as unknown as Promise<void> };
    const task = this.writeExec.enqueue(async () => {
      if (state.canceled) return;
      const snapshotRevision = chunk.getPersistenceRevision();
      const encodeStart = performance.now();
      const recordBytes = await this.encodeChunkRecord(chunk, snapshotRevision);
      this.performanceStats.lastChunkEncodeMs = performance.now() - encodeStart;
      if (state.canceled) return;
      const writeStart = performance.now();
      await this.backend.writeChunk(worldId, chunk.chunkX, chunk.chunkZ, recordBytes, dimension);
      this.performanceStats.lastChunkWriteMs = performance.now() - writeStart;
      if (chunk.getPersistenceRevision() === snapshotRevision) {
        chunk.markPersistenceClean(snapshotRevision);
      }
    }, WRITE_PRIORITY_BACKGROUND);
    state.promise = task.then(
      () => {
        this.unloads.delete(key);
        this.notifyChange();
      },
      (error) => {
        this.unloads.delete(key);
        this.recordError(error);
        this.notifyChange();
        throw error;
      },
    );
    this.unloads.set(key, state);
    this.notifyChange();
    return state.promise;
  }

  /**
   * Cancel a pending unload (the chunk is wanted again). The enqueued task no-ops
   * if it has not yet written; the caller re-checks whether the chunk is still
   * undesired before removing it.
   */
  public cancelUnload(chunk: Chunk): void {
    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    const state = this.unloads.get(key);
    if (state !== undefined) {
      state.canceled = true;
    }
  }

  // --- generic world-scoped records ---

  public writeRecord(key: string, value: Uint8Array, priority: number = WRITE_PRIORITY_BACKGROUND): Promise<void> {
    const guardError = this.writeGuardError(priority);
    if (guardError !== undefined) return Promise.reject(guardError);
    const worldId = this.worldId!;
    return this.writeExec.enqueue(async () => {
      await this.backend.writeRecord(worldId, key, value);
    }, priority);
  }

  public readRecord(key: string): Promise<Uint8Array | undefined> {
    const guardError = this.readGuardError();
    if (guardError !== undefined) return Promise.reject(guardError);
    const worldId = this.worldId!;
    return this.readExec.enqueue(async () => this.backend.readRecord(worldId, key));
  }

  public deleteRecord(key: string, priority: number = WRITE_PRIORITY_BACKGROUND): Promise<void> {
    const guardError = this.writeGuardError(priority);
    if (guardError !== undefined) return Promise.reject(guardError);
    const worldId = this.worldId!;
    return this.writeExec.enqueue(async () => {
      await this.backend.deleteRecord(worldId, key);
    }, priority);
  }

  // --- forced save / barrier / lifecycle ---

  /**
   * Forced save (Save-and-Quit semantics). Marks the world closing (new
   * background writes and new reads are rejected), enqueues every dirty chunk at
   * forced priority, then awaits a flush barrier covering every write accepted
   * before it (forced + any earlier background writes). Rejects if any covered
   * write rejected — it never reports success merely because writes settled.
   */
  public async forcedSave(dirtyChunks: Iterable<Chunk>): Promise<void> {
    const guardError = this.openGuardError();
    if (guardError !== undefined) throw guardError;
    this.closing = true;
    this.notifyChange();
    for (const chunk of dirtyChunks) {
      if (!chunk.isPersistenceDirty()) continue;
      this.saveChunk(chunk, WRITE_PRIORITY_FORCED).catch(() => undefined);
    }
    // Rejects if any covered write failed; only reached on full success below.
    await this.writeExec.flushBarrier();
    this.clearLastError();
  }

  /** Resolves once every write accepted so far has settled; rejects on any covered failure. */
  public async flushBarrier(): Promise<void> {
    const start = performance.now();
    try {
      await this.writeExec.flushBarrier();
    } finally {
      this.performanceStats.lastFlushBarrierMs = performance.now() - start;
    }
  }

  /**
   * Abort-safe shutdown of this world session: reject new work, wait for
   * accepted writes and reads to settle, and flush the backend. The shared
   * backend is APPLICATION-OWNED and is NEVER closed here, so another world can
   * be opened afterwards.
   */
  public async close(): Promise<void> {
    if (this.closed) return;
    this.closing = true;
    this.closed = true;
    await this.writeExec.close();
    await this.readExec.close();
    await this.backend.flush();
    // Deliberately NOT this.backend.close(): the application owns the backend.
  }

  // --- world index passthroughs (backend owns the index) ---

  public listWorlds(): Promise<WorldSummary[]> {
    return this.backend.listWorlds();
  }

  public upsertWorld(summary: WorldSummary): Promise<void> {
    return this.backend.upsertWorld(summary);
  }

  // --- internals ---

  private openGuardError(): Error | undefined {
    if (this.closed) return new Error('WorldPersistenceService is closed');
    if (!this.opened) return new Error('WorldPersistenceService is not opened');
    return undefined;
  }

  private writeGuardError(priority: number): Error | undefined {
    const base = this.openGuardError();
    if (base !== undefined) return base;
    if (this.closing && priority < WRITE_PRIORITY_FORCED) {
      return new Error('WorldPersistenceService is closing; background writes are rejected');
    }
    return undefined;
  }

  private readGuardError(): Error | undefined {
    const base = this.openGuardError();
    if (base !== undefined) return base;
    if (this.closing) return new Error('WorldPersistenceService is closing; new reads are rejected');
    return undefined;
  }

  private async encodeChunkRecord(chunk: Chunk, revision: number): Promise<Uint8Array> {
    const entityTags = this.entityHooks?.serializeChunkEntities(chunk.chunkX, chunk.chunkZ) ?? [];
    const nbt = ChunkSerializer.encodeChunk(chunk, BigInt(this.simulationTickProvider()), entityTags);
    const nbtBytes = encodeNbt(nbt, '');
    const compressedPayload = await compressDeflate(nbtBytes);
    const record = buildChunkRecord({
      chunkX: chunk.chunkX,
      chunkZ: chunk.chunkZ,
      persistenceRevision: revision,
      savedAtMs: this.clock(),
      compressedPayload,
    });
    return encodeChunkRecord(record);
  }

  private async decodeChunkRecord(bytes: Uint8Array, expectedX: number, expectedZ: number, worldId: string): Promise<Chunk> {
    const record = decodeChunkRecord(bytes, { worldId, chunkX: expectedX, chunkZ: expectedZ });
    if (record.chunkX !== expectedX || record.chunkZ !== expectedZ) {
      throw new RecordCorruptionError('chunk', `coordinate mismatch (stored ${record.chunkX},${record.chunkZ}, requested ${expectedX},${expectedZ})`, {
        worldId,
        chunkX: record.chunkX,
        chunkZ: record.chunkZ,
        stage: 'coordinate',
      });
    }
    let nbtBytes: Uint8Array;
    try {
      nbtBytes = await decompressDeflate(record.payload);
    } catch (error) {
      throw new RecordCorruptionError('chunk', `failed to decompress payload (${error instanceof Error ? error.message : String(error)})`, {
        worldId,
        chunkX: expectedX,
        chunkZ: expectedZ,
        stage: 'decompression',
      });
    }
    let chunk: Chunk;
    try {
      const decoded = decodeNbt(nbtBytes);
      chunk = ChunkSerializer.decodeChunk(decoded.root, this.simulationTickProvider());
      if (this.entityHooks !== null && !this.entityHooks.hasParkedEntities(expectedX, expectedZ)) {
        const entityTags = ChunkSerializer.decodeEntities(decoded.root);
        if (entityTags.length > 0) this.entityHooks.loadChunkEntities(entityTags);
      }
    } catch (error) {
      if (error instanceof RecordCorruptionError) throw error;
      throw new RecordCorruptionError('chunk', `failed to decode chunk schema (${error instanceof Error ? error.message : String(error)})`, {
        worldId,
        chunkX: expectedX,
        chunkZ: expectedZ,
        stage: 'schema',
      });
    }
    chunk.markAsLoadedFromDisk();
    return chunk;
  }
}
