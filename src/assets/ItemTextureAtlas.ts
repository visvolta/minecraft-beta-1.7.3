import * as THREE from 'three';
import { ITEM_TEXTURE_LIST } from './itemTextureList';

export const ITEM_TILE_SIZE = 16;
const UV_EDGE_INSET = 0.01;

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
  texture.flipY = false;
  texture.needsUpdate = true;
}

/**
 * An animated item icon: a vertical strip of 16x16 frames (Beta ships clock
 * and compass this way). Only one frame occupies the atlas at a time; the
 * remaining frames stay in the source image and are blitted on demand.
 */
interface AnimatedIcon {
  readonly image: HTMLImageElement;
  readonly frameCount: number;
  /** Destination pixel origin of this icon's tile in the atlas. */
  readonly pixelX: number;
  readonly pixelY: number;
  currentFrame: number;
}

export class ItemTextureAtlas {
  public readonly texture: THREE.CanvasTexture;
  private readonly uvByName = new Map<string, AtlasUvRect>();
  private readonly animated = new Map<string, AnimatedIcon>();
  private readonly context: CanvasRenderingContext2D;

  private constructor(
    canvas: HTMLCanvasElement,
    uvByName: Map<string, AtlasUvRect>,
    animated: Map<string, AnimatedIcon>,
    context: CanvasRenderingContext2D,
  ) {
    this.uvByName = uvByName;
    this.animated = animated;
    this.context = context;
    this.texture = new THREE.CanvasTexture(canvas);
    configureAtlasTexture(this.texture);
  }

  /**
   * Selects which frame of an animated icon is shown. Beta drives the compass
   * from the angle to spawn and the clock from world time; both map onto a
   * frame index here. No-op for static icons, and skipped when the frame is
   * unchanged so the texture is only re-uploaded when it actually differs.
   */
  public setAnimationFrame(name: string, frame: number): void {
    const icon = this.animated.get(name);
    if (icon === undefined) return;
    const wrapped = ((frame % icon.frameCount) + icon.frameCount) % icon.frameCount;
    if (wrapped === icon.currentFrame) return;
    icon.currentFrame = wrapped;
    this.context.clearRect(icon.pixelX, icon.pixelY, ITEM_TILE_SIZE, ITEM_TILE_SIZE);
    this.context.drawImage(
      icon.image,
      0, wrapped * ITEM_TILE_SIZE, ITEM_TILE_SIZE, ITEM_TILE_SIZE,
      icon.pixelX, icon.pixelY, ITEM_TILE_SIZE, ITEM_TILE_SIZE,
    );
    this.texture.needsUpdate = true;
  }

  /** Frame count for an animated icon, or 1 when the icon is static. */
  public getFrameCount(name: string): number {
    return this.animated.get(name)?.frameCount ?? 1;
  }

  public isAnimated(name: string): boolean {
    return this.animated.has(name);
  }

  public static async load(): Promise<ItemTextureAtlas> {
    const images = new Map<string, HTMLImageElement>();
    const loadPromises = ITEM_TEXTURE_LIST.map((name) => {
      const url = `/textures/items/${name}.png`;
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          images.set(name, img);
          resolve();
        };
        img.onerror = () => {
          console.warn(`Failed to load item texture: ${url}`);
          resolve(); // Resolve anyway so a missing texture doesn't block startup
        };
        img.src = url;
      });
    });

    await Promise.all(loadPromises);

    const names = Array.from(images.keys());
    names.sort();
    const tileCount = names.length;
    const columns = Math.max(1, Math.ceil(Math.sqrt(tileCount)));
    const rows = Math.max(1, Math.ceil(tileCount / columns));

    const canvas = document.createElement('canvas');
    canvas.width = columns * ITEM_TILE_SIZE;
    canvas.height = rows * ITEM_TILE_SIZE;

    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('Failed to acquire 2D context for item texture atlas.');
    }
    context.imageSmoothingEnabled = false;

    const uvByName = new Map<string, AtlasUvRect>();
    const animated = new Map<string, AnimatedIcon>();

    names.forEach((name, index) => {
      const image = images.get(name)!;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const pixelX = column * ITEM_TILE_SIZE;
      const pixelY = row * ITEM_TILE_SIZE;

      // Copy exactly one tile from the source. Animated icons (clock,
      // compass) ship as tall vertical strips of 16x16 frames; drawing them
      // unclipped would paint the whole strip down the atlas and overwrite
      // every tile beneath, so the source rectangle is always constrained to
      // frame 0 and later frames are swapped in by setAnimationFrame.
      const frameCount = image.height > ITEM_TILE_SIZE && image.width === ITEM_TILE_SIZE
        ? Math.floor(image.height / ITEM_TILE_SIZE)
        : 1;

      context.drawImage(
        image,
        0, 0, ITEM_TILE_SIZE, ITEM_TILE_SIZE,
        pixelX, pixelY, ITEM_TILE_SIZE, ITEM_TILE_SIZE,
      );

      if (frameCount > 1) {
        animated.set(name, { image, frameCount, pixelX, pixelY, currentFrame: 0 });
      }

      const atlasWidth = canvas.width;
      const atlasHeight = canvas.height;
      const inset = UV_EDGE_INSET;

      uvByName.set(name, {
        u0: (pixelX + inset) / atlasWidth,
        v0: (pixelY + inset) / atlasHeight,
        u1: (pixelX + ITEM_TILE_SIZE - inset) / atlasWidth,
        v1: (pixelY + ITEM_TILE_SIZE - inset) / atlasHeight,
      });
    });

    return new ItemTextureAtlas(canvas, uvByName, animated, context);
  }

  public getUvRect(name: string): AtlasUvRect | undefined {
    return this.uvByName.get(name);
  }

  public dispose(): void {
    this.texture.dispose();
  }
}
