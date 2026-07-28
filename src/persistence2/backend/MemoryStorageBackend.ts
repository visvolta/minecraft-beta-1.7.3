import type { DimensionId } from '../../world/dimension/DimensionId';
import {
  chunkRecordKey,
  worldRecordKey,
  type StorageBackend,
  type WorldSummary,
} from './StorageBackend.ts';
import { BackendError } from '../codec/PersistenceError.ts';

export type MemoryOp =
  | 'readChunk'
  | 'writeChunk'
  | 'deleteChunk'
  | 'readRecord'
  | 'writeRecord'
  | 'deleteRecord'
  | 'listWorlds'
  | 'upsertWorld'
  | 'deleteWorld'
  | 'flush'
  | 'close';

/** Returns an Error to fail the operation, or undefined to let it proceed. */
export type FailureInjector = (op: MemoryOp, key: string) => Error | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deterministic in-memory backend for Node tests. Implements the exact same
 * completion/failure semantics as `IdbStorageBackend`: every operation settles,
 * `flush` resolves once accepted writes settle, and `close` rejects subsequent
 * work. Test-only hooks inject failures and artificial delays.
 */
export class MemoryStorageBackend implements StorageBackend {
  private readonly chunks = new Map<string, Uint8Array>();
  private readonly records = new Map<string, Uint8Array>();
  private readonly worlds = new Map<string, WorldSummary>();
  private opened = false;
  private closed = false;
  private failureInjector: FailureInjector | null = null;
  private delayMs = 0;

  public setFailureInjector(injector: FailureInjector | null): void {
    this.failureInjector = injector;
  }

  public setDelay(ms: number): void {
    this.delayMs = ms;
  }

  /** Test helper: wipe all stored data. */
  public reset(): void {
    this.chunks.clear();
    this.records.clear();
    this.worlds.clear();
  }

  public async open(): Promise<void> {
    if (this.closed) throw new BackendError('MemoryStorageBackend is closed');
    this.opened = true;
  }

  private async guard(op: MemoryOp, key: string): Promise<void> {
    if (this.closed) throw new BackendError(`MemoryStorageBackend is closed (op=${op}, key=${key})`);
    if (!this.opened) throw new BackendError(`MemoryStorageBackend not opened (op=${op}, key=${key})`);
    if (this.delayMs > 0) await sleep(this.delayMs);
    const injected = this.failureInjector?.(op, key);
    if (injected !== undefined) throw injected;
  }

  public async readChunk(worldId: string, chunkX: number, chunkZ: number, dimension?: DimensionId): Promise<Uint8Array | undefined> {
    const key = chunkRecordKey(worldId, chunkX, chunkZ, dimension);
    await this.guard('readChunk', key);
    const value = this.chunks.get(key);
    return value === undefined ? undefined : value.slice();
  }

  public async writeChunk(worldId: string, chunkX: number, chunkZ: number, record: Uint8Array, dimension?: DimensionId): Promise<void> {
    const key = chunkRecordKey(worldId, chunkX, chunkZ, dimension);
    await this.guard('writeChunk', key);
    this.chunks.set(key, record.slice());
  }

  public async deleteChunk(worldId: string, chunkX: number, chunkZ: number, dimension?: DimensionId): Promise<void> {
    const key = chunkRecordKey(worldId, chunkX, chunkZ, dimension);
    await this.guard('deleteChunk', key);
    this.chunks.delete(key);
  }

  public async readRecord(worldId: string, key: string, dimension?: DimensionId): Promise<Uint8Array | undefined> {
    const fullKey = worldRecordKey(worldId, key, dimension);
    await this.guard('readRecord', fullKey);
    const value = this.records.get(fullKey);
    return value === undefined ? undefined : value.slice();
  }

  public async writeRecord(worldId: string, key: string, value: Uint8Array, dimension?: DimensionId): Promise<void> {
    const fullKey = worldRecordKey(worldId, key, dimension);
    await this.guard('writeRecord', fullKey);
    this.records.set(fullKey, value.slice());
  }

  public async deleteRecord(worldId: string, key: string, dimension?: DimensionId): Promise<void> {
    const fullKey = worldRecordKey(worldId, key, dimension);
    await this.guard('deleteRecord', fullKey);
    this.records.delete(fullKey);
  }

  public async listWorlds(): Promise<WorldSummary[]> {
    await this.guard('listWorlds', '');
    return [...this.worlds.values()].map((summary) => ({ ...summary }));
  }

  public async upsertWorld(summary: WorldSummary): Promise<void> {
    await this.guard('upsertWorld', summary.worldId);
    this.worlds.set(summary.worldId, { ...summary });
  }

  public async deleteWorld(worldId: string): Promise<void> {
    await this.guard('deleteWorld', worldId);
    this.worlds.delete(worldId);
    // Remove all records belonging to the world (chunk + record namespaces).
    const prefix = `world/${worldId}/`;
    for (const key of [...this.chunks.keys()]) if (key.startsWith(prefix)) this.chunks.delete(key);
    for (const key of [...this.records.keys()]) if (key.startsWith(prefix)) this.records.delete(key);
  }

  public async flush(): Promise<void> {
    await this.guard('flush', '');
    // Writes are applied synchronously when awaited, so nothing is outstanding.
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    if (this.delayMs > 0) await sleep(this.delayMs);
    this.closed = true;
  }
}
