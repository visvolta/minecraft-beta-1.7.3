/**
 * Spawn Egg icon rendering — runtime base + overlay tinting.
 *
 * `spawn_egg.png` is tinted with the descriptor's primary colour and
 * `spawn_egg_overlay.png` with its secondary colour; the two tinted layers are
 * then composited into a single icon. The layers are tinted independently, so
 * the spots keep their own colour instead of collapsing into one flat tint.
 *
 * Tinting uses `source-in` against an offscreen layer rather than `multiply`
 * over the whole canvas. `multiply` with a full-canvas `fillRect` also
 * multiplies the fully transparent pixels outside the egg silhouette, which is
 * what previously turned the surrounding area into an opaque colour block and
 * destroyed the alpha channel.
 *
 * The source PNGs are never modified.
 */

import { DEFAULT_SPAWN_EGG_DESCRIPTORS, type SpawnEggDescriptor } from '../entities/SpawnEggDescriptor';

export interface SpawnEggIconOptions {
  readonly primaryColor: string;   // hex, base tint
  readonly secondaryColor: string; // hex, overlay tint
}

/** Icon edge length in pixels. Beta item icons are 16×16. */
const ICON_SIZE = 16;

export async function loadSpawnEggImages(): Promise<{ base: HTMLImageElement; overlay: HTMLImageElement }> {
  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });

  const [base, overlay] = await Promise.all([
    loadImage('/textures/items/spawn_egg.png'),
    loadImage('/textures/items/spawn_egg_overlay.png'),
  ]);
  return { base, overlay };
}

/**
 * Draws one layer tinted by `color`, preserving the layer's own alpha and
 * luminance. Returns a canvas the caller composites onto the icon.
 */
function tintLayer(image: HTMLImageElement, color: string, size: number): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = size;
  layer.height = size;
  const ctx = layer.getContext('2d');
  if (ctx === null) throw new Error('Failed to get 2D context for spawn egg layer');

  ctx.imageSmoothingEnabled = false;
  // Greyscale source detail first.
  ctx.drawImage(image, 0, 0, size, size);
  // `multiply` keeps the shading; clipped to the sprite so alpha survives.
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  // Re-apply the source alpha, discarding the tint that spilled onto
  // transparent pixels during the multiply pass.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(image, 0, 0, size, size);

  return layer;
}

export function renderSpawnEggIcon(
  baseImg: HTMLImageElement,
  overlayImg: HTMLImageElement,
  options: SpawnEggIconOptions,
  size: number = ICON_SIZE,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Failed to get 2D context for spawn egg icon');

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tintLayer(baseImg, options.primaryColor, size), 0, 0);
  ctx.drawImage(tintLayer(overlayImg, options.secondaryColor, size), 0, 0);

  return canvas;
}

/**
 * Shared spawn-egg icon cache.
 *
 * Every surface that shows a spawn egg — creative inventory, survival
 * inventory, hotbar, tooltips and dropped-item rendering — resolves through
 * this one instance, so they cannot disagree about an egg's appearance.
 * Icons are composited once per mob and reused as data URLs.
 */
export class SpawnEggIconCache {
  private readonly byEntityId = new Map<number, string>();
  private images: { base: HTMLImageElement; overlay: HTMLImageElement } | undefined;
  private loading: Promise<void> | undefined;

  /** Loads the two source textures and composites every registered egg. */
  public async load(): Promise<void> {
    if (this.loading !== undefined) return this.loading;
    this.loading = (async () => {
      this.images = await loadSpawnEggImages();
      for (const descriptor of Object.values(DEFAULT_SPAWN_EGG_DESCRIPTORS)) {
        this.byEntityId.set(descriptor.entityNumericId as number, this.compose(descriptor));
      }
    })();
    return this.loading;
  }

  private compose(descriptor: SpawnEggDescriptor): string {
    const images = this.images;
    if (images === undefined) throw new Error('Spawn egg images not loaded');
    return renderSpawnEggIcon(images.base, images.overlay, {
      primaryColor: descriptor.primaryColor,
      secondaryColor: descriptor.secondaryColor,
    }).toDataURL();
  }

  /**
   * The composited icon for a spawn egg whose metadata is `entityNumericId`,
   * or `undefined` if the textures have not loaded or the id is unknown (in
   * which case the caller falls back to the plain `spawn_egg` texture).
   */
  public get(entityNumericId: number): string | undefined {
    return this.byEntityId.get(entityNumericId);
  }

  public isLoaded(): boolean {
    return this.images !== undefined;
  }
}

/** Process-wide cache shared by every spawn-egg consumer. */
export const SPAWN_EGG_ICONS = new SpawnEggIconCache();
