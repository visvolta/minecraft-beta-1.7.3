import { FaceDirection } from '../blocks/BlockFace';

export interface BlockPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DirectionOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Beta World.notifyBlocksOfNeighborChange order. */
export const ALL_BLOCK_DIRECTIONS: readonly FaceDirection[] = [
  FaceDirection.WEST,
  FaceDirection.EAST,
  FaceDirection.BOTTOM,
  FaceDirection.TOP,
  FaceDirection.NORTH,
  FaceDirection.SOUTH,
];

export const HORIZONTAL_BLOCK_DIRECTIONS: readonly FaceDirection[] = [
  FaceDirection.WEST,
  FaceDirection.EAST,
  FaceDirection.NORTH,
  FaceDirection.SOUTH,
];

const OFFSETS: Readonly<Record<FaceDirection, DirectionOffset>> = {
  [FaceDirection.TOP]: { x: 0, y: 1, z: 0 },
  [FaceDirection.BOTTOM]: { x: 0, y: -1, z: 0 },
  [FaceDirection.NORTH]: { x: 0, y: 0, z: -1 },
  [FaceDirection.SOUTH]: { x: 0, y: 0, z: 1 },
  [FaceDirection.WEST]: { x: -1, y: 0, z: 0 },
  [FaceDirection.EAST]: { x: 1, y: 0, z: 0 },
};

const OPPOSITES: Readonly<Record<FaceDirection, FaceDirection>> = {
  [FaceDirection.TOP]: FaceDirection.BOTTOM,
  [FaceDirection.BOTTOM]: FaceDirection.TOP,
  [FaceDirection.NORTH]: FaceDirection.SOUTH,
  [FaceDirection.SOUTH]: FaceDirection.NORTH,
  [FaceDirection.WEST]: FaceDirection.EAST,
  [FaceDirection.EAST]: FaceDirection.WEST,
};

export function directionOffset(direction: FaceDirection): DirectionOffset {
  return OFFSETS[direction];
}

export function oppositeDirection(direction: FaceDirection): FaceDirection {
  return OPPOSITES[direction];
}

export function offsetBlockPosition(position: BlockPosition, direction: FaceDirection): BlockPosition {
  const offset = directionOffset(direction);
  return { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z };
}

export function directionBetweenAdjacent(receiver: BlockPosition, source: BlockPosition): FaceDirection | undefined {
  const dx = source.x - receiver.x;
  const dy = source.y - receiver.y;
  const dz = source.z - receiver.z;
  for (const direction of ALL_BLOCK_DIRECTIONS) {
    const offset = OFFSETS[direction];
    if (offset.x === dx && offset.y === dy && offset.z === dz) return direction;
  }
  return undefined;
}
