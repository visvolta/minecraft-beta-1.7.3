import type { BlockDefinition } from '../../blocks/BlockDefinition';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { BlockId } from '../../blocks/BlockId';

/**
 * Beta 1.7.3 precipitation-height blocking rule.
 *
 * Vanilla uses Chunk.precipitationHeightMap, scanning downward until it
 * finds a block whose Material is solid or liquid. This is deliberately
 * separate from the normal terrain/tree heightmap: water, ice, glass,
 * leaves, slabs, panes, etc. can stop weather even when they are not the
 * same thing other systems consider opaque.
 */
export function blockBlocksWeather(definition: BlockDefinition | undefined): boolean {
  return definition?.blocksWeather ?? false;
}

/** True for blocks whose Beta material behaves as liquid for weather blocking. */
export function blockIsLiquid(definition: BlockDefinition | undefined): boolean {
  return definition?.isLiquid ?? false;
}

export function blockIdBlocksWeather(registry: BlockRegistry, blockId: BlockId): boolean {
  return blockBlocksWeather(registry.getById(blockId));
}
