import type { FaceNormal } from '../world/Raycaster';

/**
 * Canonical horizontal orientation for this project.
 *
 * World axes follow Minecraft/Beta coordinates: +X is east, -X is west,
 * +Z is south, -Z is north. Clockwise rotation is viewed from above.
 *
 * Block-specific metadata layouts are intentionally converted at module
 * boundaries so render, collision, selection and placement can all agree on
 * the same world-facing convention before applying local shapes.
 */
export type HorizontalDirection = 'north' | 'east' | 'south' | 'west';

export interface HorizontalOffset {
  readonly x: -1 | 0 | 1;
  readonly z: -1 | 0 | 1;
}

export const HORIZONTAL_DIRECTIONS: readonly HorizontalDirection[] = ['north', 'east', 'south', 'west'];

export const DIRECTION_OFFSET: Readonly<Record<HorizontalDirection, HorizontalOffset>> = {
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
};

export function oppositeDirection(direction: HorizontalDirection): HorizontalDirection {
  switch (direction) {
    case 'north': return 'south';
    case 'south': return 'north';
    case 'east': return 'west';
    case 'west': return 'east';
  }
}

export function rotateClockwise(direction: HorizontalDirection): HorizontalDirection {
  switch (direction) {
    case 'north': return 'east';
    case 'east': return 'south';
    case 'south': return 'west';
    case 'west': return 'north';
  }
}

export function rotateCounterClockwise(direction: HorizontalDirection): HorizontalDirection {
  switch (direction) {
    case 'north': return 'west';
    case 'west': return 'south';
    case 'south': return 'east';
    case 'east': return 'north';
  }
}

export function directionFromOffset(x: number, z: number): HorizontalDirection | undefined {
  if (x === 0 && z < 0) return 'north';
  if (x > 0 && z === 0) return 'east';
  if (x === 0 && z > 0) return 'south';
  if (x < 0 && z === 0) return 'west';
  return undefined;
}

export function facingFromLookVector(x: number, z: number): HorizontalDirection {
  return Math.abs(x) > Math.abs(z)
    ? (x > 0 ? 'east' : 'west')
    : (z > 0 ? 'south' : 'north');
}

export function yawRadiansToLookVector(yawRadians: number): { readonly x: number; readonly z: number } {
  return { x: -Math.sin(yawRadians), z: Math.cos(yawRadians) };
}

export function betaYawDegreesToFacing(yawDegrees: number): HorizontalDirection {
  const radians = yawDegrees * Math.PI / 180;
  return facingFromLookVector(-Math.sin(radians), Math.cos(radians));
}

export function faceNormalToDirection(face: Pick<FaceNormal, 'x' | 'z'>): HorizontalDirection | undefined {
  return directionFromOffset(face.x, face.z);
}

/**
 * For a block being placed on a side face, this is the direction from the
 * placed block back toward the support block.
 */
export function supportDirectionFromHitFace(face: Pick<FaceNormal, 'x' | 'z'>): HorizontalDirection | undefined {
  const outward = faceNormalToDirection(face);
  return outward === undefined ? undefined : oppositeDirection(outward);
}

// -------------------------------------------------------------------------
// Beta metadata conversions for common attached blocks.

/** Bed metadata direction bits: direction from foot toward head. */
export function bedDirectionFromMetadata(metadata: number): HorizontalDirection {
  switch (metadata & 3) {
    case 0: return 'south';
    case 1: return 'west';
    case 2: return 'north';
    default: return 'east';
  }
}

export function bedMetadataFromDirection(direction: HorizontalDirection): number {
  switch (direction) {
    case 'south': return 0;
    case 'west': return 1;
    case 'north': return 2;
    case 'east': return 3;
  }
}

export function bedDirectionFromYaw(yawDegrees: number): number {
  return bedMetadataFromDirection(betaYawDegreesToFacing(yawDegrees));
}

/** Door lower-half facing bits: 0 west, 1 north, 2 east, 3 south. */
export function doorFacingFromMetadata(metadata: number): HorizontalDirection {
  switch (metadata & 3) {
    case 0: return 'west';
    case 1: return 'north';
    case 2: return 'east';
    default: return 'south';
  }
}

export function doorMetadataFromFacing(direction: HorizontalDirection): number {
  switch (direction) {
    case 'west': return 0;
    case 'north': return 1;
    case 'east': return 2;
    case 'south': return 3;
  }
}

/** Beta ItemDoor placement formula, returned in the door metadata convention. */
export function doorFacingMetadataFromYaw(yawDegrees: number): number {
  return Math.floor((yawDegrees + 180) * 4 / 360 - 0.5) & 3;
}

/** Ladder and wall-sign metadata identify the support face. */
export function attachedMetadataFromSupport(direction: HorizontalDirection): number {
  switch (direction) {
    case 'south': return 2;
    case 'north': return 3;
    case 'east': return 4;
    case 'west': return 5;
  }
}

export function supportDirectionFromAttachedMetadata(metadata: number): HorizontalDirection | undefined {
  switch (metadata & 7) {
    case 2: return 'south';
    case 3: return 'north';
    case 4: return 'east';
    case 5: return 'west';
    default: return undefined;
  }
}

/** Torch/button/lever wall metadata identify the support face with Beta's own numbering. */
export function wallControlMetadataFromSupport(direction: HorizontalDirection): number {
  switch (direction) {
    case 'west': return 1;
    case 'east': return 2;
    case 'north': return 3;
    case 'south': return 4;
  }
}

export function supportDirectionFromWallControlMetadata(metadata: number): HorizontalDirection | undefined {
  switch (metadata & 7) {
    case 1: return 'west';
    case 2: return 'east';
    case 3: return 'north';
    case 4: return 'south';
    default: return undefined;
  }
}

/** Trapdoor metadata bits 0..3 identify the support face. */
export function trapdoorMetadataFromSupport(direction: HorizontalDirection): number {
  switch (direction) {
    case 'south': return 0;
    case 'north': return 1;
    case 'east': return 2;
    case 'west': return 3;
  }
}

export function supportDirectionFromTrapdoorMetadata(metadata: number): HorizontalDirection {
  switch (metadata & 3) {
    case 0: return 'south';
    case 1: return 'north';
    case 2: return 'east';
    default: return 'west';
  }
}

export function supportOffset(direction: HorizontalDirection): HorizontalOffset {
  return DIRECTION_OFFSET[direction];
}
