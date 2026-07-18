import './style.scss';
import { BlockRegistry } from './blocks/BlockRegistry';
import { registerDefaultBlocks } from './blocks/registerDefaultBlocks';
import { AssetManager } from './assets/AssetManager';
import { Engine } from './engine/Engine';
import { openDefaultWorld } from './persistence/WorldPersistence';

async function bootstrap(): Promise<void> {
  const blockRegistry = new BlockRegistry();
  registerDefaultBlocks(blockRegistry);

  // Nothing renders until the block texture atlas has finished loading.
  const atlas = await AssetManager.loadBlockAtlas(blockRegistry);

  const { coordinator: saveCoordinator, storage } = await openDefaultWorld();
  const engine = new Engine(blockRegistry, atlas, saveCoordinator, storage);
  engine.start();
}

void bootstrap();