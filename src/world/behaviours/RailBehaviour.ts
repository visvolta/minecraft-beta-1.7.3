import { BlockIds, type BlockId } from '../../blocks/BlockId';
import { AABB } from '../../physics/AABB';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry, BoundingBoxType } from '../BlockBehaviour';
import { getRailBlockInfoAt } from '../rails/RailShapes';

export function getRailSelectionBounds(ctx: BlockBehaviourContext, x: number, y: number, z: number): AABB[] {
  const info = getRailBlockInfoAt(ctx.world, x, y, z);
  const height = info?.shape.ascending === true ? 0.625 : 0.125;
  return [new AABB(x, y, z, x + 1, y + height, z + 1)];
}

export function railSupportLost(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
  const info = getRailBlockInfoAt(ctx.world, x, y, z);
  if (info === undefined) return false;
  if (!ctx.world.isNormalCube(x, y - 1, z)) return true;
  switch (info.shape.metadata) {
    case 2: return !ctx.world.isNormalCube(x + 1, y, z);
    case 3: return !ctx.world.isNormalCube(x - 1, y, z);
    case 4: return !ctx.world.isNormalCube(x, y, z - 1);
    case 5: return !ctx.world.isNormalCube(x, y, z + 1);
    default: return false;
  }
}

export function dropRailOnce(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void {
  ctx.world.dropBlockAsItem(x, y, z, blockId);
  ctx.world.setBlockWithNotify(x, y, z, BlockIds.Air, { reason: 'neighbour', updateLighting: true });
}

export class RailBehaviour implements BlockBehaviour {
  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    return ctx.world.isNormalCube(x, y - 1, z);
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const blockId = ctx.world.getBlock(x, y, z);
    if (railSupportLost(ctx, x, y, z)) dropRailOnce(ctx, x, y, z, blockId);
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, type: BoundingBoxType): AABB[] | undefined {
    if (type === 'collision') return [];
    return getRailSelectionBounds(ctx, x, y, z);
  }
}

export function registerRailBehaviour(registry: BlockBehaviourRegistry): void {
  const behaviour = new RailBehaviour();
  registry.register(BlockIds.Rail, behaviour);
  registry.register(BlockIds.DetectorRail, behaviour);
}
