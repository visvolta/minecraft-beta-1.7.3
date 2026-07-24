import type { WorldStorage } from './WorldStorage';
import { getActiveSaveTrace } from '../debug/SavePipelineTrace';

const DB_VERSION = 1;
const STORE = 'worldRecords';

interface RecordValue {
  readonly id: string;
  readonly bytes: ArrayBuffer;
}

/** Durable browser backend. Region bytes can later use the same record space without coupling encoding to IDB. */
export class IndexedDbWorldStorage implements WorldStorage {
  private constructor(private readonly db: IDBDatabase) {}

  public static async open(name = 'minecraft-beta-1.7.3-worlds'): Promise<IndexedDbWorldStorage> {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    });
    return new IndexedDbWorldStorage(db);
  }

  public async get(worldId: string, key: string): Promise<Uint8Array | undefined> {
    const value = await this.request<RecordValue | undefined>('readonly', `${worldId}/${key}`, 'get', (store) => store.get(`${worldId}/${key}`));
    return value === undefined ? undefined : new Uint8Array(value.bytes.slice(0));
  }

  public async put(worldId: string, key: string, value: Uint8Array): Promise<void> {
    const bytes = value.slice().buffer;
    await this.request('readwrite', `${worldId}/${key}`, 'put', (store) => store.put({ id: `${worldId}/${key}`, bytes }));
  }

  public async delete(worldId: string, key: string): Promise<void> {
    await this.request('readwrite', `${worldId}/${key}`, 'delete', (store) => store.delete(`${worldId}/${key}`));
  }

  public async deleteWorld(worldId: string): Promise<void> {
    const prefix = `${worldId}/`;
    await new Promise<void>((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      const trace = getActiveSaveTrace();
      const span = trace?.beginSpan('save.storage.indexeddb.delete_world', { worldId, prefix, mode: 'readwrite' });
      const store = tx.objectStore(STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => {
        span?.fail(request.error ?? new Error('IndexedDB cursor failed'));
        reject(request.error ?? new Error('IndexedDB cursor failed'));
      };
      tx.oncomplete = () => {
        trace?.mark('save.storage.indexeddb.transaction_complete', { worldId, prefix, mode: 'readwrite', operation: 'deleteWorld' });
        span?.end();
        resolve();
      };
      tx.onerror = () => {
        span?.fail(tx.error ?? new Error('IndexedDB delete world failed'));
        reject(tx.error ?? new Error('IndexedDB delete world failed'));
      };
    });
  }

  public async close(): Promise<void> {
    this.db.close();
  }

  private request<T>(
    mode: IDBTransactionMode,
    traceKey: string,
    operationName: string,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const trace = getActiveSaveTrace();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, mode);
      const span = trace?.beginSpan('save.storage.indexeddb.request', {
        key: traceKey,
        mode,
        operation: operationName,
      });
      const request = operation(tx.objectStore(STORE));
      request.onsuccess = () => {
        trace?.mark('save.storage.indexeddb.request_success', {
          key: traceKey,
          mode,
          operation: operationName,
        });
        span?.annotate({ requestSucceeded: true });
        resolve(request.result);
      };
      request.onerror = () => {
        span?.fail(request.error ?? new Error('IndexedDB request failed'));
        reject(request.error ?? new Error('IndexedDB request failed'));
      };
      tx.oncomplete = () => {
        trace?.mark('save.storage.indexeddb.transaction_complete', {
          key: traceKey,
          mode,
          operation: operationName,
        });
        span?.end({ transactionCompleted: true });
      };
      tx.onerror = () => {
        span?.fail(tx.error ?? new Error('IndexedDB transaction failed'));
        reject(tx.error ?? new Error('IndexedDB transaction failed'));
      };
    });
  }
}
