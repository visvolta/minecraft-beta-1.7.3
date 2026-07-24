import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockRegistry } from '../../blocks/BlockRegistry';

export const enum ChunkPassMask {
  None = 0,
  Terrain = 1 << 0,
  Water = 1 << 1,
  Lava = 1 << 2,
  Cutout = 1 << 3,
  Fire = 1 << 4,
  Translucent = 1 << 5,
}

function isWater(blockId: BlockId): boolean {
  return blockId === BlockIds.WaterFlowing || blockId === BlockIds.WaterStill;
}

function isLava(blockId: BlockId): boolean {
  return blockId === BlockIds.LavaFlowing || blockId === BlockIds.LavaStill;
}

function isTranslucentSolid(blockId: BlockId): boolean {
  return blockId === BlockIds.Ice || blockId === 20;
}

export function classifyBlockPassMask(blockId: BlockId, registry: BlockRegistry): number {
  if (blockId === 0) return ChunkPassMask.None;
  if (isWater(blockId)) return ChunkPassMask.Water;
  if (isLava(blockId)) return ChunkPassMask.Lava;
  if (blockId === BlockIds.Fire) return ChunkPassMask.Fire;
  if (isTranslucentSolid(blockId)) return ChunkPassMask.Translucent;
  const renderType = registry.getById(blockId)?.renderType;
  if (renderType === 'opaque') return ChunkPassMask.Terrain;
  if (
    renderType === 'cutout'
    || renderType === 'leaves'
    || renderType === 'cross'
    || renderType === 'cactus'
    || renderType === 'snow'
    || renderType === 'redstone_wire'
  ) {
    return ChunkPassMask.Cutout;
  }
  return ChunkPassMask.None;
}

export function computeChunkPassMask(blocks: Uint8Array, registry: BlockRegistry): number {
  let mask = ChunkPassMask.None;
  for (let i = 0; i < blocks.length; i++) {
    mask |= classifyBlockPassMask(blocks[i] as BlockId, registry);
    if (mask === (ChunkPassMask.Terrain | ChunkPassMask.Water | ChunkPassMask.Lava | ChunkPassMask.Cutout | ChunkPassMask.Fire | ChunkPassMask.Translucent)) {
      break;
    }
  }
  return mask;
}

export function hasChunkPass(mask: number, flag: ChunkPassMask): boolean {
  return (mask & flag) !== 0;
}
