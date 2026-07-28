/**
 * Beta 1.7.3 BlockTallGrass metadata:
 *   0 = dead-bush lookalike (untinted in Beta)
 *   1 = tall grass
 *   2 = fern
 *
 * This project stores meta on Chunk.metadata and uses greyscale fern.png for meta 2.
 */

export const TALL_GRASS_META_DEAD = 0;
export const TALL_GRASS_META_GRASS = 1;
export const TALL_GRASS_META_FERN = 2;

export function isFernMeta(metadata: number): boolean {
  return (metadata & 0xf) === TALL_GRASS_META_FERN;
}

export function isTallGrassPlantMeta(metadata: number): boolean {
  const m = metadata & 0xf;
  return m === TALL_GRASS_META_GRASS || m === TALL_GRASS_META_FERN;
}
