import type { WorldStorage } from '../storage/WorldStorage.ts';
import { RegionStorage } from '../region/RegionStorage.ts';
import { measureSaveAsync } from '../debug/SavePipelineTrace.ts';

/**
 * Opens a region's backing store. Injectable so tests can observe/coalesce
 * region opens without widening production counters; defaults to the durable
 * `RegionStorage.open`.
 */
export type RegionOpener = (
  storage: WorldStorage,
  worldId: string,
  regionX: number,
  regionZ: number,
) => Promise<RegionStorage>;

export class RegionCoordinator {
  private readonly regions = new Map<string, RegionStorage>();
  private readonly pendingOpens = new Map<string, Promise<RegionStorage>>();
  private readonly pendingSaves = new Map<string, Promise<void>>();

  public constructor(
    private readonly storage: WorldStorage,
    private readonly worldId: string,
    private readonly openRegion: RegionOpener = RegionStorage.open,
  ) {}

  public getStats(): { readonly openRegions: number; readonly pendingSaves: number; } {
    return {
      openRegions: this.regions.size,
      pendingSaves: this.pendingSaves.size,
    };
  }

  public getRegion(regionX: number, regionZ: number): Promise<RegionStorage> {
    const key = `${regionX},${regionZ}`;
    const cached = this.regions.get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    // In-flight dedup: concurrent callers for the same uncached region share a
    // single open instead of each starting its own backing-store transaction
    // (and constructing duplicate RegionStorage instances).
    const pending = this.pendingOpens.get(key);
    if (pending !== undefined) return pending;

    const opening = this.openRegion(this.storage, this.worldId, regionX, regionZ)
      .then((region) => {
        this.regions.set(key, region);
        return region;
      })
      .finally(() => {
        // Always clear the in-flight entry so a failed open can be retried by a
        // later caller (a cached region is only stored on success above).
        this.pendingOpens.delete(key);
      });
    this.pendingOpens.set(key, opening);
    return opening;
  }

  public async commitRegion(regionX: number, regionZ: number): Promise<void> {
    const key = `${regionX},${regionZ}`;
    const region = this.regions.get(key);
    if (!region) return;

    let pending = this.pendingSaves.get(key);
    if (pending) return pending;

    pending = measureSaveAsync('save.region.commit_region', {
      key,
      regionX,
      regionZ,
      openRegions: this.regions.size,
      pendingSaves: this.pendingSaves.size,
    }, async () => {
      try {
        await region.save();
      } finally {
        this.pendingSaves.delete(key);
      }
    });
    this.pendingSaves.set(key, pending);
    return pending;
  }

  public async commitAll(): Promise<void> {
    await measureSaveAsync('save.region.commit_all', {
      openRegions: this.regions.size,
      pendingSaves: this.pendingSaves.size,
    }, async () => {
      const promises: Promise<void>[] = [];
      for (const key of this.regions.keys()) {
        const [rx, rz] = key.split(',').map(Number) as [number, number];
        promises.push(this.commitRegion(rx, rz));
      }
      await Promise.all(promises);
    });
  }
}
