import type { BlockRegistry } from '../blocks/BlockRegistry';
import { loadBlockTextureImages } from './TextureLoader';
import { TextureAtlas } from './TextureAtlas';

/**
 * Orchestrates the asset-loading pipeline: figures out which block
 * textures are needed, loads them, and builds the shared atlas.
 *
 * Rendering code only ever receives the finished TextureAtlas from here;
 * it never loads images or knows about the asset pipeline.
 */
export class AssetManager {
  /**
   * Collects every distinct texture name referenced by the registry's
   * block definitions (across all/top/bottom/side), loads them, and
   * packs them into one TextureAtlas.
   */
  public static async loadBlockAtlas(
    blockRegistry: BlockRegistry,
  ): Promise<TextureAtlas> {
    const textureNames = new Set<string>();

    for (const definition of blockRegistry.values()) {
      const { all, top, bottom, side, front } = definition.textures;

      for (const name of [all, top, bottom, side, front]) {
        if (name !== undefined) {
          textureNames.add(name);
        }
      }
    }

    // Snow-covered grass side texture (Beta texture 68).
    // Used by ChunkMesher when a Grass block has Snow above it.
    // Not referenced by any block definition directly.
    textureNames.add('grass_side_snowed');

    // Add destruction stage textures to the atlas.
    for (let i = 0; i < 10; i++) {
      textureNames.add(`destroy_stage_${i}`);
    }

    // Authoritative missing-texture fallback region in atlas (`not the first atlas region`).
    textureNames.add('missing_texture');

    const images = await loadBlockTextureImages(textureNames);
    return TextureAtlas.build(images);
  }
}
