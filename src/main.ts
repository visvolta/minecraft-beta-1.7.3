import './style.scss';
import { BlockRegistry } from './blocks/BlockRegistry';
import { registerDefaultBlocks } from './blocks/registerDefaultBlocks';
import { AssetManager } from './assets/AssetManager';
import { Engine } from './engine/Engine';
import { openDefaultWorld } from './persistence/WorldPersistence';
import { PlayerSkinManager } from './player/PlayerSkinManager';
import { ItemTextureAtlas } from './assets/ItemTextureAtlas';

async function bootstrap(): Promise<void> {
  const blockRegistry = new BlockRegistry();
  registerDefaultBlocks(blockRegistry);

  // Nothing renders until the block texture atlas has finished loading.
  const atlas = await AssetManager.loadBlockAtlas(blockRegistry);

  // Load flat items texture atlas asynchronously before startup
  const itemAtlas = await ItemTextureAtlas.load();

  // Instantiate and preload the player skin
  const skinManager = new PlayerSkinManager();
  await skinManager.loadSkin();

  const { coordinator: saveCoordinator, storage } = await openDefaultWorld();
  const engine = new Engine(blockRegistry, atlas, itemAtlas, saveCoordinator, storage, skinManager);
  engine.start();
}

void bootstrap();