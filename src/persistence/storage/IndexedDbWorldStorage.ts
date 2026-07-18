import type { WorldStorage } from './WorldStorage';
const DB_VERSION = 1;
const STORE = 'worldRecords';
interface RecordValue { readonly id: string; readonly bytes: ArrayBuffer; }
/** Durable browser backend. Region bytes can later use the same record space without coupling encoding to IDB. */
export class IndexedDbWorldStorage implements WorldStorage {
  private constructor(private readonly db: IDBDatabase) {}
  public static async open(name = 'minecraft-beta-1.7.3-worlds'): Promise<IndexedDbWorldStorage> {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request=indexedDB.open(name, DB_VERSION); request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'});}; request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error ?? new Error('IndexedDB open failed')); });
    return new IndexedDbWorldStorage(db);
  }
  public async get(worldId: string, key: string): Promise<Uint8Array | undefined> { const value=await this.request<RecordValue | undefined>('readonly', store=>store.get(`${worldId}/${key}`)); return value === undefined ? undefined : new Uint8Array(value.bytes.slice(0)); }
  public async put(worldId: string, key: string, value: Uint8Array): Promise<void> { const bytes=value.slice().buffer; await this.request('readwrite', store=>store.put({id:`${worldId}/${key}`,bytes})); }
  public async close(): Promise<void> { this.db.close(); }
  private request<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> { return new Promise((resolve,reject)=>{ const tx=this.db.transaction(STORE,mode); const request=operation(tx.objectStore(STORE)); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error ?? new Error('IndexedDB request failed')); tx.onerror=()=>reject(tx.error ?? new Error('IndexedDB transaction failed')); }); }
}
