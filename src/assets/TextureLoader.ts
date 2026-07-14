/**
 * Loads block texture images from static files.
 * Knows nothing about the atlas layout, blocks, or rendering.
 */

/** Base path where block textures are served from (see public/textures/blocks). */
const BLOCK_TEXTURE_BASE_PATH = '/textures/blocks';

/**
 * Loads a single named texture (e.g. "stone" -> /textures/blocks/stone.png).
 */
export function loadBlockTextureImage(name: string): Promise<HTMLImageElement> {
  const url = `${BLOCK_TEXTURE_BASE_PATH}/${name}.png`;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = (): void => resolve(image);
    image.onerror = (): void =>
      reject(new Error(`Failed to load block texture: ${url}`));
    image.src = url;
  });
}

/**
 * Loads every named texture in parallel.
 * Returns a Map from texture name to its loaded image.
 */
export async function loadBlockTextureImages(
  names: ReadonlySet<string>,
): Promise<Map<string, HTMLImageElement>> {
  const entries = await Promise.all(
    Array.from(names, async (name) => {
      const image = await loadBlockTextureImage(name);
      return [name, image] as const;
    }),
  );

  return new Map(entries);
}
