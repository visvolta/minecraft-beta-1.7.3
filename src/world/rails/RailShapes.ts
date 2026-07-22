import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockUpdateWorld } from '../BlockUpdateWorld';

export type RailShapeName =
  | 'north_south'
  | 'east_west'
  | 'ascending_east'
  | 'ascending_west'
  | 'ascending_north'
  | 'ascending_south'
  | 'south_east'
  | 'south_west'
  | 'north_west'
  | 'north_east';

export interface RailEndpoint {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
  readonly z: -1 | 0 | 1;
}

export interface RailShapeDefinition {
  readonly metadata: number;
  readonly name: RailShapeName;
  readonly start: RailEndpoint;
  readonly end: RailEndpoint;
  readonly direction: { readonly x: -1 | 0 | 1; readonly z: -1 | 0 | 1 };
  readonly ascending: boolean;
  readonly curve: boolean;
  readonly slopeAxis: 'x' | 'z' | undefined;
  readonly slopeDirection: -1 | 1 | undefined;
  readonly texture: 'straight' | 'curve';
  readonly textureRotationQuarterTurns: 0 | 1 | 2 | 3;
}

export interface RailBlockInfo {
  readonly blockId: BlockId;
  readonly metadata: number;
  readonly shape: RailShapeDefinition;
  readonly poweredRail: boolean;
  readonly active: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const RAIL_SHAPES: readonly RailShapeDefinition[] = [
  { metadata: 0, name: 'north_south', start: { x: 0, y: 0, z: -1 }, end: { x: 0, y: 0, z: 1 }, direction: { x: 0, z: 1 }, ascending: false, curve: false, slopeAxis: undefined, slopeDirection: undefined, texture: 'straight', textureRotationQuarterTurns: 0 },
  { metadata: 1, name: 'east_west', start: { x: -1, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, direction: { x: 1, z: 0 }, ascending: false, curve: false, slopeAxis: undefined, slopeDirection: undefined, texture: 'straight', textureRotationQuarterTurns: 1 },
  { metadata: 2, name: 'ascending_east', start: { x: -1, y: -1, z: 0 }, end: { x: 1, y: 0, z: 0 }, direction: { x: 1, z: 0 }, ascending: true, curve: false, slopeAxis: 'x', slopeDirection: 1, texture: 'straight', textureRotationQuarterTurns: 1 },
  { metadata: 3, name: 'ascending_west', start: { x: -1, y: 0, z: 0 }, end: { x: 1, y: -1, z: 0 }, direction: { x: 1, z: 0 }, ascending: true, curve: false, slopeAxis: 'x', slopeDirection: -1, texture: 'straight', textureRotationQuarterTurns: 1 },
  { metadata: 4, name: 'ascending_north', start: { x: 0, y: 0, z: -1 }, end: { x: 0, y: -1, z: 1 }, direction: { x: 0, z: 1 }, ascending: true, curve: false, slopeAxis: 'z', slopeDirection: -1, texture: 'straight', textureRotationQuarterTurns: 0 },
  { metadata: 5, name: 'ascending_south', start: { x: 0, y: -1, z: -1 }, end: { x: 0, y: 0, z: 1 }, direction: { x: 0, z: 1 }, ascending: true, curve: false, slopeAxis: 'z', slopeDirection: 1, texture: 'straight', textureRotationQuarterTurns: 0 },
  { metadata: 6, name: 'south_east', start: { x: 0, y: 0, z: 1 }, end: { x: 1, y: 0, z: 0 }, direction: { x: 1, z: -1 }, ascending: false, curve: true, slopeAxis: undefined, slopeDirection: undefined, texture: 'curve', textureRotationQuarterTurns: 0 },
  { metadata: 7, name: 'south_west', start: { x: 0, y: 0, z: 1 }, end: { x: -1, y: 0, z: 0 }, direction: { x: -1, z: -1 }, ascending: false, curve: true, slopeAxis: undefined, slopeDirection: undefined, texture: 'curve', textureRotationQuarterTurns: 1 },
  { metadata: 8, name: 'north_west', start: { x: 0, y: 0, z: -1 }, end: { x: -1, y: 0, z: 0 }, direction: { x: -1, z: 1 }, ascending: false, curve: true, slopeAxis: undefined, slopeDirection: undefined, texture: 'curve', textureRotationQuarterTurns: 2 },
  { metadata: 9, name: 'north_east', start: { x: 0, y: 0, z: -1 }, end: { x: 1, y: 0, z: 0 }, direction: { x: 1, z: 1 }, ascending: false, curve: true, slopeAxis: undefined, slopeDirection: undefined, texture: 'curve', textureRotationQuarterTurns: 3 },
] as const;

export function isRailBlockId(blockId: BlockId): boolean {
  return blockId === BlockIds.Rail || blockId === BlockIds.PoweredRail || blockId === BlockIds.DetectorRail;
}

export function isStage11ARailBlockId(blockId: BlockId): boolean {
  return blockId === BlockIds.Rail || blockId === BlockIds.PoweredRail;
}

export function getRailShapeForBlock(blockId: BlockId, metadata: number): RailShapeDefinition | undefined {
  if (!isRailBlockId(blockId)) return undefined;
  const shapeMetadata = blockId === BlockIds.PoweredRail || blockId === BlockIds.DetectorRail ? metadata & 7 : metadata;
  if ((blockId === BlockIds.PoweredRail || blockId === BlockIds.DetectorRail) && shapeMetadata > 5) return undefined;
  return RAIL_SHAPES.find((shape) => shape.metadata === shapeMetadata);
}

export function getRailBlockInfoAt(world: BlockUpdateWorld, x: number, y: number, z: number): RailBlockInfo | undefined {
  const blockId = world.getBlock(x, y, z);
  const metadata = world.getBlockMetadata(x, y, z);
  const shape = getRailShapeForBlock(blockId, metadata);
  if (shape === undefined) return undefined;
  const poweredRail = blockId === BlockIds.PoweredRail;
  return { blockId, metadata, shape, poweredRail, active: poweredRail && (metadata & 8) !== 0, x, y, z };
}

export function findRailAtOrBelow(world: BlockUpdateWorld, x: number, y: number, z: number): RailBlockInfo | undefined {
  const bx = Math.floor(x);
  let by = Math.floor(y);
  const bz = Math.floor(z);
  const here = getRailBlockInfoAt(world, bx, by, bz);
  if (here !== undefined) return here;
  by -= 1;
  return getRailBlockInfoAt(world, bx, by, bz);
}
