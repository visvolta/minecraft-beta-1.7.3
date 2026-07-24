import {
  chunkRecordKey,
  worldRecordKey,
  type StorageBackend,
  type WorldSummary,
} from './StorageBackend.ts';
import { BackendError } from '../codec/PersistenceError.ts';

/**
 * Production IndexedDB backend.
 *
 * Uses a brand-new database (`minecraft-beta-1.7.3.v2`) and object-store layout
 * that is completely separate from the legacy `minecraft-beta-1.7.3-worlds`
 * database, so old records are never interpreted as new-format data and the old
 * database is left untouched.
 *
 * Stores:
 *   - `chunks`  (keyPath `id` = chunkRecordKey)   — opaque chunk record bytes
 *   - `records` (keyPath `id` = worldRecordKey)   — metadata / player / other
 *   - `worlds`  (keyPath `worldId`)               — world index summaries
 *
 * Each operation uses one bounded transaction; transaction ownership stays
 * inside this class (raw `IDBTransaction` is never exposed). Writes are
 * serialized by the persistence service's write executor, so transactions never
 * pile up. There are no timers and no fire-and-forget writes here.
 */

export const DEFAULT_IDB_DB_NAME = 'minecraft-beta-1.7.3.v2';
export const IDB_DB_VERSION = 1;

const CHUNKS_STORE = 'chunks';
const RECORDS_STORE = 'records';
const WORLDS_STORE = 'worlds';

export interface IdbStorageBackendOptions {
  dbName?: string;
  dbVersion?: number;
}

interface StoredBlob {
  id: string;
  bytes: ArrayBuffer;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

function toBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer.slice(0));
}

export class IdbStorageBackend implements StorageBackend {
  private readonly dbName: string;
  private readonly dbVersion: number;
  private db: IDBDatabase | null = null;
  private closed = false;
  private readonly inFlight = new Set<Promise<unknown>>();

  public constructor(options: IdbStorageBackendOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_IDB_DB_NAME;
    this.dbVersion = options.dbVersion ?? IDB_DB_VERSION;
  }

  public async open(): Promise<void> {
    if (this.db !== null) return;
    if (this.closed) throw new BackendError('IdbStorageBackend is closed');
    if (typeof indexedDB === 'undefined') throw new BackendError('IndexedDB is unavailable');
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CHUNKS_STORE)) db.createObjectStore(CHUNKS_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(RECORDS_STORE)) db.createObjectStore(RECORDS_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(WORLDS_STORE)) db.createObjectStore(WORLDS_STORE, { keyPath: 'worldId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new BackendError('Failed to open IndexedDB', request.error ?? undefined));
      request.onblocked = () => reject(new BackendError('IndexedDB open blocked'));
    });
  }

  private track(promise: Promise<unknown>): void {
    // Track a rejection-swallowing mirror so in-flight bookkeeping never causes
    // an unhandled rejection; callers receive the original promise.
    const settled = promise.then(
      () => undefined,
      () => undefined,
    );
    this.inFlight.add(settled);
    void settled.then(() => {
      this.inFlight.delete(settled);
    });
  }

  private runRequest<T>(storeName: string, mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    if (this.closed) return Promise.reject(new BackendError(`IdbStorageBackend is closed (store=${storeName})`));
    const db = this.db;
    if (db === null) return Promise.reject(new BackendError(`IdbStorageBackend not opened (store=${storeName})`));
    const promise = new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(storeName, mode);
      } catch (err) {
        reject(new BackendError('Failed to open IDB transaction', err));
        return;
      }
      const request = op(tx.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new BackendError('IDB request failed', request.error ?? undefined));
      tx.onabort = () => reject(new BackendError('IDB transaction aborted', tx.error ?? undefined));
    });
    this.track(promise);
    return promise;
  }

  public async readChunk(worldId: string, chunkX: number, chunkZ: number): Promise<Uint8Array | undefined> {
    const id = chunkRecordKey(worldId, chunkX, chunkZ);
    const stored = await this.runRequest<StoredBlob | undefined>(CHUNKS_STORE, 'readonly', (store) => store.get(id));
    return stored === undefined ? undefined : toBytes(stored.bytes);
  }

  public async writeChunk(worldId: string, chunkX: number, chunkZ: number, record: Uint8Array): Promise<void> {
    const id = chunkRecordKey(worldId, chunkX, chunkZ);
    await this.runRequest<IDBValidKey>(CHUNKS_STORE, 'readwrite', (store) => store.put({ id, bytes: toArrayBuffer(record) }));
  }

  public async deleteChunk(worldId: string, chunkX: number, chunkZ: number): Promise<void> {
    const id = chunkRecordKey(worldId, chunkX, chunkZ);
    await this.runRequest<undefined>(CHUNKS_STORE, 'readwrite', (store) => store.delete(id));
  }

  public async readRecord(worldId: string, key: string): Promise<Uint8Array | undefined> {
    const id = worldRecordKey(worldId, key);
    const stored = await this.runRequest<StoredBlob | undefined>(RECORDS_STORE, 'readonly', (store) => store.get(id));
    return stored === undefined ? undefined : toBytes(stored.bytes);
  }

  public async writeRecord(worldId: string, key: string, value: Uint8Array): Promise<void> {
    const id = worldRecordKey(worldId, key);
    await this.runRequest<IDBValidKey>(RECORDS_STORE, 'readwrite', (store) => store.put({ id, bytes: toArrayBuffer(value) }));
  }

  public async deleteRecord(worldId: string, key: string): Promise<void> {
    const id = worldRecordKey(worldId, key);
    await this.runRequest<undefined>(RECORDS_STORE, 'readwrite', (store) => store.delete(id));
  }

  public async listWorlds(): Promise<WorldSummary[]> {
    const summaries = await this.runRequest<WorldSummary[]>(WORLDS_STORE, 'readonly', (store) => store.getAll());
    return summaries.map((summary) => ({ ...summary }));
  }

  public async upsertWorld(summary: WorldSummary): Promise<void> {
    await this.runRequest<IDBValidKey>(WORLDS_STORE, 'readwrite', (store) => store.put({ ...summary }));
  }

  public async deleteWorld(worldId: string): Promise<void> {
    await this.runRequest<undefined>(WORLDS_STORE, 'readwrite', (store) => store.delete(worldId));
    // Best-effort removal of the world's chunk/record namespaces via cursors.
    await this.deleteByPrefix(CHUNKS_STORE, `world/${worldId}/`);
    await this.deleteByPrefix(RECORDS_STORE, `world/${worldId}/`);
  }

  private deleteByPrefix(storeName: string, prefix: string): Promise<void> {
    if (this.closed || this.db === null) return Promise.resolve();
    const promise = new Promise<void>((resolve, reject) => {
      const db = this.db;
      if (db === null) {
        resolve();
        return;
      }
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null) return;
        const key = cursor.key;
        if (typeof key === 'string' && key.startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(new BackendError('IDB cursor failed', request.error ?? undefined));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new BackendError('IDB cursor transaction aborted', tx.error ?? undefined));
    });
    this.track(promise);
    return promise;
  }

  public async flush(): Promise<void> {
    const pending = [...this.inFlight];
    await Promise.all(pending);
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    await this.flush();
    this.closed = true;
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
  }
}
