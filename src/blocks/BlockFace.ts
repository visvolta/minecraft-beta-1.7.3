/**
 * The cardinal directions for faces.
 * +Z is South, -Z is North, +X is East, -X is West.
 */
export enum FaceDirection {
  TOP = 'top',
  BOTTOM = 'bottom',
  NORTH = 'north', // -Z
  SOUTH = 'south', // +Z
  EAST = 'east',   // +X
  WEST = 'west',   // -X
}

/**
 * The semantic texture-selection slots a block can resolve to.
 */
export type BlockFace = 'top' | 'bottom' | 'side' | 'front' | 'back';
