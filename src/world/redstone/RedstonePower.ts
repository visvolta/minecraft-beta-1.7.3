import type { BlockId } from '../../blocks/BlockId';
import type { FaceDirection } from '../../blocks/BlockFace';
import type { BlockPosition } from '../BlockDirections';

export const REDSTONE_POWER_MIN = 0;
export const REDSTONE_POWER_MAX = 15;

declare const redstonePowerBrand: unique symbol;
export type RedstonePower = number & { readonly [redstonePowerBrand]: true };

export function clampRedstonePower(value: number): RedstonePower {
  if (!Number.isFinite(value)) return REDSTONE_POWER_MIN as RedstonePower;
  return Math.max(REDSTONE_POWER_MIN, Math.min(REDSTONE_POWER_MAX, Math.trunc(value))) as RedstonePower;
}

export const NO_REDSTONE_POWER = REDSTONE_POWER_MIN as RedstonePower;
export const FULL_REDSTONE_POWER = REDSTONE_POWER_MAX as RedstonePower;

export interface ReadonlyPowerWorld {
  getBlock(x: number, y: number, z: number): BlockId;
  getBlockMetadata(x: number, y: number, z: number): number;
  isLoaded(x: number, z: number): boolean;
  isNormalCube(x: number, y: number, z: number): boolean;
}

export interface PowerQueryContext {
  readonly world: ReadonlyPowerWorld;
  readonly receiverPosition: BlockPosition;
  readonly sourcePosition: BlockPosition;
  /** Direction from receiver to the neighbouring source. */
  readonly directionToSource: FaceDirection;
  /** Outward face of the source that points toward the receiver. */
  readonly sourceOutputFace: FaceDirection;
  readonly sourceBlockId: BlockId;
  readonly sourceMetadata: number;
}
