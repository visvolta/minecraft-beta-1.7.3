/**
 * Panorama registry for main-menu background customization.
 * Explicit face mapping with rotation per face.
 */

export interface PanoramaFace {
  readonly texture: string;
  readonly rotation?: number; // degrees, clockwise, applied to texture
}

export interface PanoramaDefinition {
  readonly id: string;
  readonly faces: {
    readonly left: PanoramaFace;
    readonly right: PanoramaFace;
    readonly front: PanoramaFace;
    readonly back: PanoramaFace;
    readonly top: PanoramaFace;
    readonly bottom: PanoramaFace;
  };
  readonly rotationSpeed?: number; // degrees per second, default 0.05 (slow)
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
  faces: {
    left: { texture: 'panorama_0.png', rotation: 0 },
    right: { texture: 'panorama_1.png', rotation: 0 },
    front: { texture: 'panorama_3.png', rotation: 180 },
    back: { texture: 'panorama_2.png', rotation: 0 },
    top: { texture: 'panorama_4.png', rotation: 90 },
    bottom: { texture: 'panorama_5.png', rotation: 270 },
  },
  rotationSpeed: 0.05,
  overlayOpacity: 0.35,
};
