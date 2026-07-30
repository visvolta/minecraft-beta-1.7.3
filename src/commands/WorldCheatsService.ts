/**
 * End-to-end cheats persistence service.
 * Reads cheatsEnabled from world metadata, writes back on change.
 */

import type { WorldPersistenceService } from '../persistence2/WorldPersistenceService';
import { CheatsState } from './CheatsState';

export class WorldCheatsService {
  private loaded = false;

  public constructor(
    private readonly service: WorldPersistenceService,
    private readonly cheats: CheatsState,
  ) {}

  public async loadFromWorld(): Promise<void> {
    try {
      const metadata = await this.service.loadMetadata();
      if (metadata !== undefined && typeof metadata.cheatsEnabled === 'boolean') {
        this.cheats.setEnabled(metadata.cheatsEnabled);
        this.loaded = true;
      } else {
        // Backward-compatible default for old saves
        this.cheats.setEnabled(false);
        this.loaded = true;
      }
    } catch {
      this.cheats.setEnabled(false);
      this.loaded = true;
    }
  }

  public async saveToWorld(): Promise<void> {
    if (!this.loaded) return;
    try {
      const metadata = await this.service.loadMetadata();
      if (metadata !== undefined) {
        const updated = { ...metadata, cheatsEnabled: this.cheats.isEnabled() };
        await this.service.saveMetadata(updated, 1);
      }
    } catch {
      // Best-effort persistence; don't break gameplay on save failure
    }
  }

  public isLoaded(): boolean {
    return this.loaded;
  }
}
