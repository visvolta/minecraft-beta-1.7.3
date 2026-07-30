/**
 * Panorama registry for main-menu background customization.
 */

export interface PanoramaDefinition {
  readonly id: string;
  readonly images: readonly string[]; // file names, ordered for cubemap mapping
  readonly rotationSpeed?: number; // degrees per second, default 0.1
  readonly overlayOpacity?: number; // 0 to 1, default 0.35
}

export class PanoramaRegistry {
  private readonly definitions = new Map<string, PanoramaDefinition>();
  private activeId = 'default';

  public register(def: PanoramaDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`Panorama '${def.id}' already registered`);
    }
    this.definitions.set(def.id, def);
  }

  public select(id: string): boolean {
    if (!this.definitions.has(id)) return false;
    this.activeId = id;
    return true;
  }

  public getActive(): PanoramaDefinition | undefined {
    return this.definitions.get(this.activeId);
  }

  public get(id: string): PanoramaDefinition | undefined {
    return this.definitions.get(id);
  }

  public listIds(): readonly string[] {
    return Array.from(this.definitions.keys()).sort();
  }
}

export const DEFAULT_PANORAMA: PanoramaDefinition = {
  id: 'default',
  images: [
    'panorama_0.png', // left
    'panorama_1.png', // right
    'panorama_2.png', // back
    'panorama_3.png', // front
    'panorama_4.png', // top / sky
    'panorama_5.png', // bottom / ground
  ],
  rotationSpeed: 0.08,
  overlayOpacity: 0.35,
};
