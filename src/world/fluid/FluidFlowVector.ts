import type { BlockId } from '../../blocks/BlockId';
import { BlockIds } from '../../blocks/BlockId';
import { getFluidLevel, isFallingFluid } from './FluidMetadata';

export interface FluidSampleAccess {
  getBlock(x: number, y: number, z: number): BlockId;
  getMetadata(x: number, y: number, z: number): number;
  isSolid(blockId: BlockId): boolean;
}

export interface FluidFlowVector {
  readonly x: number;
  readonly z: number;
  readonly falling: boolean;
}

function sameFluid(a: BlockId, b: BlockId): boolean {
  const waterA = a === BlockIds.WaterFlowing || a === BlockIds.WaterStill;
  const waterB = b === BlockIds.WaterFlowing || b === BlockIds.WaterStill;
  const lavaA = a === BlockIds.LavaFlowing || a === BlockIds.LavaStill;
  const lavaB = b === BlockIds.LavaFlowing || b === BlockIds.LavaStill;
  return (waterA && waterB) || (lavaA && lavaB);
}

function effectiveLevel(metadata: number): number {
  return isFallingFluid(metadata) ? 0 : getFluidLevel(metadata);
}

/** Beta-style horizontal fluid flow vector from neighbouring fluid levels. */
export function computeFluidFlowVector(
  access: FluidSampleAccess,
  x: number,
  y: number,
  z: number,
  blockId: BlockId,
): FluidFlowVector {
  const currentLevel = effectiveLevel(access.getMetadata(x, y, z));
  let vx = 0;
  let vz = 0;

  const directions: ReadonlyArray<readonly [number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const [dx, dz] of directions) {
    const neighbourId = access.getBlock(x + dx, y, z + dz);
    if (sameFluid(blockId, neighbourId)) {
      const diff = effectiveLevel(access.getMetadata(x + dx, y, z + dz)) - currentLevel;
      vx += dx * diff;
      vz += dz * diff;
      continue;
    }

    if (!access.isSolid(neighbourId)) {
      const belowId = access.getBlock(x + dx, y - 1, z + dz);
      if (sameFluid(blockId, belowId)) {
        const diff = effectiveLevel(access.getMetadata(x + dx, y - 1, z + dz)) - (currentLevel - 8);
        vx += dx * diff;
        vz += dz * diff;
      }
    }
  }

  let falling = isFallingFluid(access.getMetadata(x, y, z));
  if (!falling) {
    for (const [dx, dz] of directions) {
      if (access.isSolid(access.getBlock(x + dx, y, z + dz)) || access.isSolid(access.getBlock(x + dx, y + 1, z + dz))) {
        falling = true;
        break;
      }
    }
  }

  const len = Math.hypot(vx, vz);
  if (len > 1e-6) {
    vx /= len;
    vz /= len;
  }

  return { x: vx, z: vz, falling };
}
