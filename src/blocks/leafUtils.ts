/**
 * Leaf decay helpers — centralises Beta species + decay flag handling.
 * Preserves all metadata bits except bit 8 when setting/clearing decay.
 * Supports both temporary separate IDs (Oak 18, Spruce 253, Birch 250) and
 * future single-ID + metadata model via meta &3 fallback.
 */

import { BlockIds } from './BlockId';
import type { BlockId } from './BlockId';

export const LEAF_DECAY_FLAG = 8;
export const LEAF_SPECIES_MASK = 3;

// Species constants matching Beta: 0 = Oak, 1 = Pine/Spruce, 2 = Birch
export const LEAF_SPECIES_OAK = 0;
export const LEAF_SPECIES_SPRUCE = 1;
export const LEAF_SPECIES_BIRCH = 2;

function isId(id: BlockId, ...candidates: (number | undefined)[]): boolean {
  for (const c of candidates) {
    if (c !== undefined && id === c) return true;
  }
  return false;
}

export function isLeafBlock(blockId: BlockId): boolean {
  return isId(
    blockId,
    BlockIds.Leaves,
    (BlockIds as any).SpruceLeaves,
    (BlockIds as any).BirchLeaves,
    250, // BirchLeaves temp fallback
    253, // SpruceLeaves temp fallback
  );
}

export function isLogBlock(blockId: BlockId): boolean {
  return isId(
    blockId,
    BlockIds.Log,
    (BlockIds as any).SpruceLog,
    (BlockIds as any).BirchLog,
    251, // BirchLog temp fallback
    252, // SpruceLog temp fallback
  );
}

export function getLeafSpecies(blockId: BlockId, metadata: number): number {
  // Primary: ID mapping (temporary IDs)
  if (isId(blockId, BlockIds.Leaves)) return LEAF_SPECIES_OAK;
  if (isId(blockId, (BlockIds as any).SpruceLeaves, 253)) return LEAF_SPECIES_SPRUCE;
  if (isId(blockId, (BlockIds as any).BirchLeaves, 250)) return LEAF_SPECIES_BIRCH;
  // Fallback: metadata bits 0-1
  return metadata & LEAF_SPECIES_MASK;
}

export function getLogSpecies(blockId: BlockId, metadata: number): number {
  if (isId(blockId, BlockIds.Log)) return LEAF_SPECIES_OAK;
  if (isId(blockId, (BlockIds as any).SpruceLog, 252)) return LEAF_SPECIES_SPRUCE;
  if (isId(blockId, (BlockIds as any).BirchLog, 251)) return LEAF_SPECIES_BIRCH;
  return metadata & LEAF_SPECIES_MASK;
}

export function hasLeafDecayFlag(metadata: number): boolean {
  return (metadata & LEAF_DECAY_FLAG) !== 0;
}

export function setLeafDecayFlag(metadata: number, enabled: boolean): number {
  // Preserve all bits except bit 8 — do NOT mask with &3
  return enabled ? (metadata | LEAF_DECAY_FLAG) : (metadata & ~LEAF_DECAY_FLAG);
}

export function getLeafSpeciesFromBlock(blockId: BlockId, metadata: number): number {
  return getLeafSpecies(blockId, metadata);
}

export function getSaplingMetadataForLeafSpecies(species: number): number {
  // Sapling species metadata matches leaf species (0 oak,1 spruce,2 birch)
  return species & LEAF_SPECIES_MASK;
}
