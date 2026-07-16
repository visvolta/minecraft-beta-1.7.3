import * as THREE from 'three';

/** Every supplied block texture is this size (Beta 1.7.3 convention). */
export const ATLAS_TILE_SIZE = 16;

/**
 * Inset applied to each tile's UV rectangle, in UV units, to avoid
 * sampling neighbouring tiles at texture edges (mipmap/filter bleeding).
 * Kept tiny relative to a tile so it has no visible effect with nearest
 * filtering, while still being safe if filtering ever changes.
 */
const UV_EDGE_INSET = 0.01;

/** UV rectangle (0–1 atlas space) for one texture's tile. */
export interface AtlasUvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

function configureAtlasTexture(texture: THREE.CanvasTexture): void {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  // Sample V in the same top-to-bottom order the source PNGs are drawn in,
  // so face UV corners (see ChunkMesher) can use v=0 for a tile's top row
  // without an extra mental flip.
  texture.flipY = false;
  texture.needsUpdate = true;
}

/**
 * Packs same-size block textures into a single square grid atlas and
 * exposes UV lookup by texture name.
 *
 * Packing only: does not load images or know about blocks/rendering.
 */
export class TextureAtlas {
  public readonly texture: THREE.CanvasTexture;
  /**
   * Debug-only atlas variant with pure-white RGB and the original source
   * alpha preserved. Used by F4 raw-light mode so cutouts/fluids keep
   * their transparency masks while all colour information is removed.
   */
  public readonly debugTexture: THREE.CanvasTexture;

  private readonly uvByName = new Map<string, AtlasUvRect>();

  private constructor(
    canvas: HTMLCanvasElement,
    debugCanvas: HTMLCanvasElement,
    uvByName: Map<string, AtlasUvRect>,
  ) {
    this.uvByName = uvByName;

    this.texture = new THREE.CanvasTexture(canvas);
    configureAtlasTexture(this.texture);

    this.debugTexture = new THREE.CanvasTexture(debugCanvas);
    configureAtlasTexture(this.debugTexture);
  }

  /**
   * Builds an atlas from loaded images, packed into a uniform grid of
   * ATLAS_TILE_SIZE x ATLAS_TILE_SIZE tiles (all supplied images must be
   * that size). Grid dimensions grow to fit any number of textures, so
   * adding new blocks later requires no manual atlas layout.
   */
  public static build(images: ReadonlyMap<string, HTMLImageElement>): TextureAtlas {
    const names = Array.from(images.keys());
    const tileCount = names.length;
    const columns = Math.max(1, Math.ceil(Math.sqrt(tileCount)));
    const rows = Math.max(1, Math.ceil(tileCount / columns));

    const canvas = document.createElement('canvas');
    canvas.width = columns * ATLAS_TILE_SIZE;
    canvas.height = rows * ATLAS_TILE_SIZE;

    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('Failed to acquire 2D context for texture atlas.');
    }
    context.imageSmoothingEnabled = false;

    const debugCanvas = document.createElement('canvas');
    debugCanvas.width = canvas.width;
    debugCanvas.height = canvas.height;

    const debugContext = debugCanvas.getContext('2d');
    if (debugContext === null) {
      throw new Error('Failed to acquire 2D context for debug texture atlas.');
    }
    debugContext.imageSmoothingEnabled = false;

    const uvByName = new Map<string, AtlasUvRect>();

    names.forEach((name, index) => {
      const image = images.get(name)!;

      if (image.width !== ATLAS_TILE_SIZE || image.height !== ATLAS_TILE_SIZE) {
        throw new Error(
          `Texture "${name}" is ${image.width}x${image.height}; expected ${ATLAS_TILE_SIZE}x${ATLAS_TILE_SIZE}.`,
        );
      }

      const column = index % columns;
      const row = Math.floor(index / columns);
      const pixelX = column * ATLAS_TILE_SIZE;
      const pixelY = row * ATLAS_TILE_SIZE;

      context.drawImage(image, pixelX, pixelY);

      // Build the debug atlas tile as solid white with the source alpha
      // preserved exactly (no recoloured asset file on disk; debug-only,
      // runtime-generated data for F4 mode).
      debugContext.fillStyle = '#ffffff';
      debugContext.fillRect(pixelX, pixelY, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE);
      debugContext.globalCompositeOperation = 'destination-in';
      debugContext.drawImage(image, pixelX, pixelY);
      debugContext.globalCompositeOperation = 'source-over';

      const atlasWidth = canvas.width;
      const atlasHeight = canvas.height;
      const inset = UV_EDGE_INSET;

      uvByName.set(name, {
        u0: (pixelX + inset) / atlasWidth,
        v0: (pixelY + inset) / atlasHeight,
        u1: (pixelX + ATLAS_TILE_SIZE - inset) / atlasWidth,
        v1: (pixelY + ATLAS_TILE_SIZE - inset) / atlasHeight,
      });
    });

    return new TextureAtlas(canvas, debugCanvas, uvByName);
  }

  /**
   * Returns the UV rectangle for a texture name, or undefined if it was
   * not included when the atlas was built.
   */
  public getUvRect(name: string): AtlasUvRect | undefined {
    return this.uvByName.get(name);
  }

  public getAllUvRects(): ReadonlyArray<readonly [string, AtlasUvRect]> {
    return Array.from(this.uvByName.entries());
  }

  public dispose(): void {
    this.texture.dispose();
    this.debugTexture.dispose();
  }
}
