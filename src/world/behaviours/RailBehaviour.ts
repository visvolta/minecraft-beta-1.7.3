import { BlockIds, type BlockId } from '../../blocks/BlockId';
import { AABB } from '../../physics/AABB';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry, BoundingBoxType } from '../BlockBehaviour';
import { getRailBlockInfoAt } from '../rails/RailShapes';
import {
  combineRailMetadata, computeRailShape, isRailBlock, splitRailMetadata,
  type RailWorldView,
} from '../rails/RailConnectivity';

/**
 * Recomputes a rail's shape from its neighbours and writes it back, then
 * nudges neighbouring rails so a whole junction settles.
 *
 * Beta does this in `RailLogic.refreshTrackShape`; without it a placed rail
 * keeps whatever metadata it was given and corners never form.
 */
export function refreshRailShape(
  ctx: BlockBehaviourContext,
  x: number,
  y: number,
  z: number,
  cascade = true,
): void {
  const blockId = ctx.world.getBlock(x, y, z);
  if (!isRailBlock(blockId)) return;

  const poweredRail = blockId === BlockIds.PoweredRail || blockId === BlockIds.DetectorRail;
  const raw = ctx.world.getBlockMetadata(x, y, z);
  const { active } = splitRailMetadata(raw, poweredRail);

  const view: RailWorldView = {
    getBlock: (bx, by, bz) => ctx.world.getBlock(bx, by, bz),
    getBlockMetadata: (bx, by, bz) => ctx.world.getBlockMetadata(bx, by, bz),
  };
  const powered = ctx.power?.isBlockIndirectlyPowered({ x, y, z }) ?? false;
  const shape = computeRailShape(view, x, y, z, { poweredRail, powered });
  const next = combineRailMetadata(shape, active, poweredRail);

  if (next === raw) return;
  ctx.world.setBlockMetadata(x, y, z, next, { notifyNeighbours: false });
  ctx.world.markDirty(x, z);

  if (!cascade) return;
  // Let the four neighbours (and their slope partners) re-settle once. The
  // cascade is depth-limited to avoid a feedback loop across a long track.
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    for (const dy of [0, 1, -1] as const) {
      if (isRailBlock(ctx.world.getBlock(x + dx, y + dy, z + dz))) {
        refreshRailShape(ctx, x + dx, y + dy, z + dz, false);
      }
    }
  }
}

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

  /** Beta `BlockRail.onBlockAdded` reconciles the shape immediately. */
  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    refreshRailShape(ctx, x, y, z);
  }

  /** A removed rail lets its neighbours straighten out again. */
  public onRemoved(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (const dy of [0, 1, -1] as const) {
        if (isRailBlock(ctx.world.getBlock(x + dx, y + dy, z + dz))) {
          refreshRailShape(ctx, x + dx, y + dy, z + dz, false);
        }
      }
    }
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const blockId = ctx.world.getBlock(x, y, z);
    if (railSupportLost(ctx, x, y, z)) {
      dropRailOnce(ctx, x, y, z, blockId);
      return;
    }
    refreshRailShape(ctx, x, y, z, false);
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
