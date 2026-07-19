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
  if (name === 'missing_texture') {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = (): void => resolve(image);
      image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="8" height="8" fill="#f0f"/><rect x="8" width="8" height="8" fill="#000"/><rect y="8" width="8" height="8" fill="#000"/><rect x="8" y="8" width="8" height="8" fill="#f0f"/></svg>');
    });
  }

  const url = `${BLOCK_TEXTURE_BASE_PATH}/${name}.png`;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = (): void => resolve(image);
    image.onerror = (): void => {
      console.warn(`Failed to load block texture: ${url}. Using missing_texture fallback.`);
      loadBlockTextureImage('missing_texture').then(resolve).catch(reject);
    };
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
