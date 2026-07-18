/** Browser-independent asynchronous storage boundary. Values are immutable snapshots. */
export interface WorldStorage {
  get(worldId: string, key: string): Promise<Uint8Array | undefined>;
  put(worldId: string, key: string, value: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export class MemoryWorldStorage implements WorldStorage {
  private readonly records = new Map<string, Uint8Array>();
  public async get(worldId: string, key: string): Promise<Uint8Array | undefined> {
    const value = this.records.get(`${worldId}/${key}`);
    return value?.slice();
  }
  public async put(worldId: string, key: string, value: Uint8Array): Promise<void> { this.records.set(`${worldId}/${key}`, value.slice()); }
  public async close(): Promise<void> {}
}
