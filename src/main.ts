import './style.scss';
import { BlockRegistry } from './blocks/BlockRegistry';
import { registerDefaultBlocks } from './blocks/registerDefaultBlocks';
import { AssetManager } from './assets/AssetManager';
import { PlayerSkinManager } from './player/PlayerSkinManager';
import { ItemTextureAtlas } from './assets/ItemTextureAtlas';
import { ArmourTextureAssets } from './assets/ArmourTextureAssets';
import { ApplicationController } from './app/ApplicationController';

async function bootstrap(): Promise<void> {
  const blockRegistry = new BlockRegistry();
  registerDefaultBlocks(blockRegistry);

  const atlas = await AssetManager.loadBlockAtlas(blockRegistry);
  const [itemAtlas, entityTextures, armourTextures] = await Promise.all([
    ItemTextureAtlas.load(),
    AssetManager.loadEntityTextures(),
    ArmourTextureAssets.load(),
  ]);

  const skinManager = new PlayerSkinManager();
  await skinManager.loadSkin();

  const app = new ApplicationController(blockRegistry, atlas, itemAtlas, entityTextures, armourTextures, skinManager);
  await app.start();
}

void bootstrap();
