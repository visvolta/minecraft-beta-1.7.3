/**
 * Panorama registry for main-menu background customization.
 */

import { DEFAULT_PANORAMA_BLUR, type PanoramaBlur } from './PanoramaBlur';

export interface PanoramaDefinition {
  readonly id: string;
  /**
   * The six face images in Beta's own file order (`panorama_0` … `panorama_5`):
   * 0 = north, 1 = east, 2 = south, 3 = west, 4 = up, 5 = down.
   *
   * This is *not* the order three.js wants — {@link PANORAMA_FACES} maps these
   * onto cube-material slots — so a panorama pack can keep Beta's naming.
   */
  readonly images: readonly string[];
  /** Degrees per second of horizontal pan. */
  readonly rotationSpeed?: number;
  /** Default blur when the panorama is first selected. */
  readonly defaultBlur?: PanoramaBlur;
}

/**
 * How each three.js cube-material slot is filled.
 *
 * three.js `BoxGeometry` orders its material slots +X, -X, +Y, -Y, +Z, -Z,
 * which does not match Beta's `panorama_N` numbering. Each entry names the
 * source image for that slot plus the transform needed to orient it correctly
 * when viewed from inside the cube (`BackSide`).
 *
 * The side faces are mirrored in X because viewing a texture from behind
 * reverses its horizontal axis. The up and down faces additionally need a
 * quarter turn to line their seams up with the four sides.
 */
export interface PanoramaFaceMapping {
  /** Index into {@link PanoramaDefinition.images}. */
  readonly imageIndex: number;
  readonly rotationDegrees: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export const PANORAMA_FACES: readonly PanoramaFaceMapping[] = [
  // +X — east (panorama_1)
  { imageIndex: 1, rotationDegrees: 0, flipX: true, flipY: false },
  // -X — west (panorama_3).
  //
  // This face previously appeared upside down. The source PNG is correct and
  // needs no rotation: the bug was that the old renderer fed the image array
  // straight into three.js's material slots, whose order (+X, -X, +Y, -Y, +Z,
  // -Z) does not match Beta's panorama_0..5 file order. panorama_3 therefore
  // landed in the -Y (floor) slot, where it read as inverted. Routing it to
  // the -X slot here fixes it with the same transform the other sides use.
  { imageIndex: 3, rotationDegrees: 0, flipX: true, flipY: false },
  // +Y — up (panorama_4)
  { imageIndex: 4, rotationDegrees: 90, flipX: true, flipY: false },
  // -Y — down (panorama_5)
  { imageIndex: 5, rotationDegrees: 90, flipX: true, flipY: false },
  // +Z — south (panorama_2)
  { imageIndex: 2, rotationDegrees: 0, flipX: true, flipY: false },
  // -Z — north (panorama_0)
  { imageIndex: 0, rotationDegrees: 0, flipX: true, flipY: false },
];

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
    'panorama_0.png', // north
    'panorama_1.png', // east
    'panorama_2.png', // south
    'panorama_3.png', // west
    'panorama_4.png', // up
    'panorama_5.png', // down
  ],
  // Beta pans the menu panorama slowly; ~3°/s matches its feel.
  rotationSpeed: 2,
  defaultBlur: DEFAULT_PANORAMA_BLUR,
};

/**
 * The shared registry. A single instance means the main menu and the picker
 * always agree on which panoramas exist and which is selected.
 */
export const PANORAMA_REGISTRY = new PanoramaRegistry();
PANORAMA_REGISTRY.register(DEFAULT_PANORAMA);
