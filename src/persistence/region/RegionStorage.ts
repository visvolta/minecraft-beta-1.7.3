import type { WorldStorage } from '../storage/WorldStorage.ts';
import { RegionFileCodec } from './RegionFileCodec.ts';

export class RegionStorage {
  public constructor(
    private readonly storage: WorldStorage,
    private readonly worldId: string,
    private readonly regionX: number,
    private readonly regionZ: number,
    private readonly codec: RegionFileCodec,
  ) {}

  public static async open(storage: WorldStorage, worldId: string, regionX: number, regionZ: number): Promise<RegionStorage> {
    const key = `region/r.${regionX}.${regionZ}.mcr`;
    const data = await storage.get(worldId, key);
    const codec = new RegionFileCodec(data);
    return new RegionStorage(storage, worldId, regionX, regionZ, codec);
  }

  public async getChunkData(localX: number, localZ: number): Promise<Uint8Array | undefined> {
    return this.codec.getChunkData(localX, localZ);
  }

  public async setChunkData(localX: number, localZ: number, data: Uint8Array, timestamp: number): Promise<void> {
    await this.codec.setChunkData(localX, localZ, data, timestamp);
  }

  public async save(): Promise<void> {
    const key = `region/r.${this.regionX}.${this.regionZ}.mcr`;
    await this.storage.put(this.worldId, key, this.codec.getRawBuffer());
  }
}
