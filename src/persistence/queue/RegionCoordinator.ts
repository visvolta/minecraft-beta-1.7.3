import type { WorldStorage } from '../storage/WorldStorage.ts';
import { RegionStorage } from '../region/RegionStorage.ts';

export class RegionCoordinator {
  private readonly regions = new Map<string, RegionStorage>();
  private readonly pendingSaves = new Map<string, Promise<void>>();

  public constructor(
    private readonly storage: WorldStorage,
    private readonly worldId: string,
  ) {}

  public async getRegion(regionX: number, regionZ: number): Promise<RegionStorage> {
    const key = `${regionX},${regionZ}`;
    let region = this.regions.get(key);
    if (!region) {
      region = await RegionStorage.open(this.storage, this.worldId, regionX, regionZ);
      this.regions.set(key, region);
    }
    return region;
  }

  public async commitRegion(regionX: number, regionZ: number): Promise<void> {
    const key = `${regionX},${regionZ}`;
    const region = this.regions.get(key);
    if (!region) return;

    let pending = this.pendingSaves.get(key);
    if (pending) return pending;

    pending = (async () => {
      try {
        await region.save();
      } finally {
        this.pendingSaves.delete(key);
      }
    })();
    this.pendingSaves.set(key, pending);
    return pending;
  }

  public async commitAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const key of this.regions.keys()) {
      const [rx, rz] = key.split(',').map(Number) as [number, number];
      promises.push(this.commitRegion(rx, rz));
    }
    await Promise.all(promises);
  }
}
