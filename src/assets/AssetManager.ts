import type { BlockRegistry } from '../blocks/BlockRegistry';
import { loadBlockTextureImages } from './TextureLoader';
import { TextureAtlas } from './TextureAtlas';
import { EntityTextureAssets } from './EntityTextureAssets';
import { collectBlockAtlasTextureNames } from './blockAtlasTextureNames';

/**
 * Orchestrates the asset-loading pipeline: figures out which block
 * textures are needed, loads them, and builds the shared atlas.
 *
 * Rendering code only ever receives the finished TextureAtlas from here;
 * it never loads images or knows about the asset pipeline.
 */
export class AssetManager {
  public static loadEntityTextures(): Promise<EntityTextureAssets> { return EntityTextureAssets.load(); }

  /**
   * Collects every distinct texture name the mesher can request — the names
   * reachable from block definitions plus the mesh-time-only names — loads
   * them, and packs them into one TextureAtlas.
   */
  public static async loadBlockAtlas(
    blockRegistry: BlockRegistry,
  ): Promise<TextureAtlas> {
    const textureNames = collectBlockAtlasTextureNames(blockRegistry);
    const images = await loadBlockTextureImages(textureNames);
    return TextureAtlas.build(images);
  }
}
