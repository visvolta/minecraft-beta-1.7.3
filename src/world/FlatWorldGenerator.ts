import { BlockIds } from '../blocks/BlockId';
import type { Chunk } from './Chunk';

/** Grass surface height for the temporary flat world. */
export const FLAT_SURFACE_Y = 64;

/**
 * Temporary deterministic flat-world population.
 * Replace later with Beta terrain generation.
 */
export class FlatWorldGenerator {
  /**
   * Fills a chunk with the flat layer stack.
   * Same result for every chunk coordinate.
   *
   * Y=0 bedrock; Y=1–60 stone; Y=61–63 dirt; Y=64 grass; Y=65–127 air.
   */
  public populate(chunk: Chunk): void {
    chunk.setLayer(0, BlockIds.Bedrock);

    for (let y = 1; y <= FLAT_SURFACE_Y - 4; y++) {
      chunk.setLayer(y, BlockIds.Stone);
    }

    for (let y = FLAT_SURFACE_Y - 3; y <= FLAT_SURFACE_Y - 1; y++) {
      chunk.setLayer(y, BlockIds.Dirt);
    }

    chunk.setLayer(FLAT_SURFACE_Y, BlockIds.Grass);

    // Above surface remains Air (chunk defaults to 0).
  }
}
