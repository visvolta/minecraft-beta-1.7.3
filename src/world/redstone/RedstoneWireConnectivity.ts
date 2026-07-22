import type { BlockId } from '../../blocks/BlockId';
import { BlockIds } from '../../blocks/BlockId';

export interface ConnectivityWorld {
  getBlock(x: number, y: number, z: number): BlockId;
  isNormalCube(x: number, y: number, z: number): boolean;
}

export enum WireConnection {
  NONE = 0,
  SIDE = 1,
  UP = 2,
  DOWN = 3,
}

export interface WireConnections {
  north: WireConnection;
  south: WireConnection;
  east: WireConnection;
  west: WireConnection;
}

/**
 * Beta 1.7.3 Redstone Wire connection algorithm.
 * 
 * Rules:
 * 1. Connects to any block that can provide redstone power (Wire, Torch, Lever, etc).
 * 2. Connects horizontally (SIDE) if same level.
 * 3. Connects UP if neighbor block at same level is NOT a normal cube, but neighbor block ONE UP is a Wire.
 * 4. Connects DOWN if same level neighbor is NOT a normal cube, but neighbor block ONE DOWN is a Wire.
 */
export function getWireConnections(
  world: ConnectivityWorld,
  x: number, y: number, z: number,
  isPowerProvider: (blockId: BlockId) => boolean
): WireConnections {
  return {
    north: getDirectionalConnection(world, x, y, z, 0, -1, isPowerProvider),
    south: getDirectionalConnection(world, x, y, z, 0, 1, isPowerProvider),
    east: getDirectionalConnection(world, x, y, z, 1, 0, isPowerProvider),
    west: getDirectionalConnection(world, x, y, z, -1, 0, isPowerProvider),
  };
}

function getDirectionalConnection(
  world: ConnectivityWorld,
  x: number, y: number, z: number,
  dx: number, dz: number,
  isPowerProvider: (blockId: BlockId) => boolean
): WireConnection {
  const nx = x + dx;
  const nz = z + dz;
  const neighborId = world.getBlock(nx, y, nz);

  // 1. Same level
  if (isPowerProvider(neighborId)) {
    return WireConnection.SIDE;
  }

  // 2. Upward (climbing)
  // Beta: connects UP if the block above the CURRENT wire is not a normal cube AND the neighbor one-up is a wire.
  if (!world.isNormalCube(x, y + 1, z)) {
    if (world.isNormalCube(nx, y, nz) && world.getBlock(nx, y + 1, nz) === BlockIds.RedstoneWire) {
      return WireConnection.UP;
    }
  }

  // 3. Downward
  // Beta: connects DOWN if the neighbor block at the SAME level is not a normal cube AND neighbor one-down is a wire.
  if (!world.isNormalCube(nx, y, nz)) {
    if (world.getBlock(nx, y - 1, nz) === BlockIds.RedstoneWire) {
      return WireConnection.DOWN;
    }
  }

  return WireConnection.NONE;
}

/** 
 * Shared Beta 1.7.3 Redstone color interpolation.
 * Matches RenderBlocks.renderBlockRedstoneWire exactly.
 */
export function getRedstoneColor(metadata: number): [number, number, number] {
  const power = metadata / 15.0;
  let r = power * 0.6 + 0.4;
  if (metadata === 0) r = 0.3;
  const g = Math.max(0, power * power * 0.7 - 0.5);
  const b = Math.max(0, power * power * 0.6 - 0.7);
  return [r, g, b];
}
