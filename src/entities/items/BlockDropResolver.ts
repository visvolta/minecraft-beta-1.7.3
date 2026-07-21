import { BlockIds } from '../../blocks/BlockId';

export interface Drop {
  readonly type: 'block' | 'item';
  readonly id: number | string; // BlockId (for block type) or item texture name (for item type)
  readonly count: number;
  readonly metadata:number;
  readonly damage?:number;
}

export function resolveBlockDrops(blockId:number,blockMetadata=0,canHarvest=true):Drop[]{
  if(!canHarvest)return[];
  const random = Math.random();

  switch (blockId) {
    case BlockIds.Stone:
      return [{ type: 'block', id: BlockIds.Cobblestone, count: 1, metadata: 0 }];

    case BlockIds.Grass:
      return [{ type: 'block', id: BlockIds.Dirt, count: 1, metadata: 0 }];

    case BlockIds.Glass:
    case BlockIds.Ice:
      return []; // Glass and Ice drop nothing in Beta 1.7.3 when broken by hand

    case BlockIds.Bedrock:
    case BlockIds.Spawner:
      return []; // Unobtainable blocks drop nothing

    // Leaves have a 5% chance to drop 1 Sapling (with appropriate metadata representing species)
    case BlockIds.Leaves:
      return random < 0.05 ? [{ type: 'block', id: BlockIds.Sapling, count: 1, metadata: 0 }] : [];
    case BlockIds.SpruceLeaves:
      return random < 0.05 ? [{ type: 'block', id: BlockIds.Sapling, count: 1, metadata: 1 }] : [];
    case 250: // BirchLeaves
      return random < 0.05 ? [{ type: 'block', id: BlockIds.Sapling, count: 1, metadata: 2 }] : [];

    // Ores
    case BlockIds.CoalOre:
      return [{ type: 'item', id: 'coal', count: 1, metadata: 0 }];

    case BlockIds.DiamondOre:
      return [{ type: 'item', id: 'diamond', count: 1, metadata: 0 }];

    case BlockIds.RedstoneOre:
      // drops 4 to 5 redstone dust items
      const redstoneCount = 4 + Math.floor(Math.random() * 2);
      return [{ type: 'item', id: 'redstone_dust', count: redstoneCount, metadata: 0 }];

    case BlockIds.LapisOre:
      // drops 4 to 8 lapis lazuli (lapis lazuli is blue dye powder, metadata value 4)
      const lapisCount = 4 + Math.floor(Math.random() * 5);
      return [{ type: 'item', id: 'dye_powder_blue', count: lapisCount, metadata: 4 }];

    case BlockIds.DoubleSlab:
      return [{ type: 'block', id: BlockIds.Slab, count: 2, metadata: blockMetadata }];

    case BlockIds.WoodDoor:
      if ((blockMetadata & 8) !== 0) return []; // Upper half drops nothing
      return [{ type: 'item', id: 'door_wood', count: 1, metadata: 0 }];

    case BlockIds.IronDoor:
      if ((blockMetadata & 8) !== 0) return []; // Upper half drops nothing
      return [{ type: 'item', id: 'door_iron', count: 1, metadata: 0 }];

    case BlockIds.SignPost:
    case BlockIds.WallSign:
      return [{ type: 'item', id: 'sign', count: 1, metadata: 0 }];

    // Non-full blocks / Crops / Special drops
    case BlockIds.Crops:
      return [{ type: 'item', id: 'wheat', count: 1, metadata: 0 }];

    default:
      // Most blocks (dirt, sand, gravel, log, planks, chest, cactus, etc.) drop themselves
      return [{ type: 'block', id: blockId, count: 1, metadata: blockMetadata }];
  }
}
