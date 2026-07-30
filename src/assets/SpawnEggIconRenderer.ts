/**
 * Spawn Egg icon rendering — runtime base + overlay tinting.
 *
 * Both `spawn_egg.png` (base) and `spawn_egg_overlay.png` (overlay) are
 * composited independently with primary/secondary colors using canvas
 * multiply/composite operations, preserving texture detail (not flat
 * silhouettes).
 */

export interface SpawnEggIconOptions {
  readonly primaryColor: string;   // hex, base tint
  readonly secondaryColor: string; // hex, overlay tint
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return { r: isNaN(r) ? 255 : r, g: isNaN(g) ? 255 : g, b: isNaN(b) ? 255 : b };
}

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

export function renderSpawnEggIcon(
  baseImg: HTMLImageElement,
  overlayImg: HTMLImageElement,
  options: SpawnEggIconOptions,
  size: number = 16,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context for spawn egg icon');

  const primary = hexToRgb(options.primaryColor);
  const secondary = hexToRgb(options.secondaryColor);

  // Draw base image with primary tint using multiply blend
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(baseImg, 0, 0, size, size);

  // Apply primary tint via color overlay with multiply
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${primary.r}, ${primary.g}, ${primary.b})`;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // Draw overlay image with secondary tint
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(overlayImg, 0, 0, size, size);

  // Apply secondary tint via multiply blend over overlay
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${secondary.r}, ${secondary.g}, ${secondary.b})`;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  return canvas;
}
