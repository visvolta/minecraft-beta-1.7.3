import type { BlockRegistry } from './BlockRegistry';
import { BlockIds } from './BlockId';

/**
 * Registers the initial Beta 1.7.3 blocks required for this stage.
 */
export function registerDefaultBlocks(registry: BlockRegistry): void {
  registry.register({
    id: BlockIds.Air,
    name: 'air',
    displayName: 'Air',
    solid: false,
    transparent: true,
    replaceable: true,
    textures: {},
  });

  registry.register({
    id: BlockIds.Stone,
    name: 'stone',
    displayName: 'Stone',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'stone' },
  });

  registry.register({
    id: BlockIds.Grass,
    name: 'grass',
    displayName: 'Grass Block',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: {
      top: 'grass_top',
      bottom: 'dirt',
      side: 'grass_side',
    },
  });

  registry.register({
    id: BlockIds.Dirt,
    name: 'dirt',
    displayName: 'Dirt',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'dirt' },
  });

  registry.register({
    id: BlockIds.Cobblestone,
    name: 'cobblestone',
    displayName: 'Cobblestone',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'cobblestone' },
  });

  registry.register({
    id: BlockIds.Bedrock,
    name: 'bedrock',
    displayName: 'Bedrock',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'bedrock' },
  });
}
