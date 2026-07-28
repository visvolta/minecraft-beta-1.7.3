import type { AABB } from '../../physics/AABB';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry, BoundingBoxType } from '../BlockBehaviour';
import { BlockIds } from '../../blocks/BlockId';
import {
  buttonShape,
  bedShape,
  cactusShape,
  chestShape,
  fenceCollisionShape,
  fenceSelectionShapes,
  leverShape,
  snowLayerShape,
  stairShapes,
  soulSandShape,
  torchShape,
  trapdoorShape,
  type FenceConnections,
} from '../../blocks/shapes/BlockShapes';
import { toWorldBound, toWorldBounds } from '../../blocks/shapes/toWorldBounds';

/**
 * Bounds-only behaviours for blocks whose shape is smaller or more complex
 * than a full cube.
 *
 * These exist so collision, raycasting and the selection outline all read the
 * same declaration in `BlockShapes`. Rendering keeps its own dedicated
 * geometry for these blocks (tilted torch, stair steps, fence rails); the two
 * are required to agree semantically, not to share primitives.
 *
 * A behaviour that only supplies bounds is registered through `mergeBounds`
 * so it composes with an existing behaviour instead of replacing it.
 */

/**
 * Adds `getBoundingBoxes` to whatever behaviour is already registered.
 *
 * Uses the registry's own merge so the result is independent of registration
 * order: a behaviour registered for this block *after* this call keeps these
 * bounds instead of silently replacing them.
 */
function mergeBounds(
  registry: BlockBehaviourRegistry,
  blockId: number,
  getBoundingBoxes: NonNullable<BlockBehaviour['getBoundingBoxes']>,
): void {
  registry.merge(blockId, { getBoundingBoxes });
}

/** Beta torches are a thin post, tilted when wall-mounted. */
const torchBounds: NonNullable<BlockBehaviour['getBoundingBoxes']> = (ctx, x, y, z, type) =>
  type === 'collision' ? [] : toWorldBound(torchShape(ctx.world.getBlockMetadata(x, y, z)), x, y, z);

/** Beta stairs contribute a half-height base plus a half-cell upper step. */
const stairBounds: NonNullable<BlockBehaviour['getBoundingBoxes']> = (ctx, x, y, z) =>
  toWorldBounds(stairShapes(ctx.world.getBlockMetadata(x, y, z)), x, y, z);

/**
 * Beta fences collide as a 1.5-block-tall cell so players cannot jump them,
 * but are selected against the visible post and rails.
 */
const fenceBounds: NonNullable<BlockBehaviour['getBoundingBoxes']> = (
  ctx: BlockBehaviourContext,
  x: number,
  y: number,
  z: number,
  type: BoundingBoxType,
): AABB[] | undefined => {
  if (type === 'collision') return toWorldBound(fenceCollisionShape(), x, y, z);
  return toWorldBounds(fenceSelectionShapes(fenceConnectionsAt(ctx, x, y, z)), x, y, z);
};

/** A fence links to neighbouring fences and to any solid block face. */
export function fenceConnectionsAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): FenceConnections {
  const links = (nx: number, nz: number): boolean => {
    const id = ctx.world.getBlock(nx, y, nz);
    if (id === BlockIds.Fence) return true;
    return ctx.world.isNormalCube(nx, y, nz);
  };
  return {
    negX: links(x - 1, z),
    posX: links(x + 1, z),
    negZ: links(x, z - 1),
    posZ: links(x, z + 1),
  };
}

export function registerShapedBlockBehaviours(registry: BlockBehaviourRegistry): void {
  mergeBounds(registry, BlockIds.Torch, torchBounds);
  mergeBounds(registry, BlockIds.RedstoneTorchOn, torchBounds);
  mergeBounds(registry, BlockIds.RedstoneTorchOff, torchBounds);

  mergeBounds(registry, BlockIds.WoodStairs, stairBounds);
  // Cobblestone stairs reuse the same declaration, so both variants agree.
  mergeBounds(registry, BlockIds.CobblestoneStairs, stairBounds);

  // Beta beds stand 9/16 tall; soul sand is a full block 1/8 short.
  mergeBounds(registry, BlockIds.Bed, (_ctx, x, y, z) => toWorldBound(bedShape(), x, y, z));
  mergeBounds(registry, BlockIds.SoulSand, (_ctx, x, y, z) => toWorldBound(soulSandShape(), x, y, z));

  mergeBounds(registry, BlockIds.Fence, fenceBounds);

  mergeBounds(registry, BlockIds.Chest, (_ctx, x, y, z) => toWorldBound(chestShape(), x, y, z));

  mergeBounds(registry, BlockIds.Cactus, (_ctx, x, y, z) => toWorldBound(cactusShape(), x, y, z));

  mergeBounds(registry, BlockIds.Snow, (ctx, x, y, z, type) => {
    const metadata = ctx.world.getBlockMetadata(x, y, z);
    if (type === 'collision') {
      if ((metadata & 7) < 3) return [];
      return toWorldBound({ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 }, x, y, z);
    }
    return toWorldBound(snowLayerShape(metadata), x, y, z);
  });

  mergeBounds(registry, BlockIds.Trapdoor, (ctx, x, y, z) =>
    toWorldBound(trapdoorShape(ctx.world.getBlockMetadata(x, y, z)), x, y, z));

  mergeBounds(registry, BlockIds.StoneButton, (ctx, x, y, z) =>
    toWorldBound(buttonShape(ctx.world.getBlockMetadata(x, y, z)), x, y, z));

  mergeBounds(registry, BlockIds.Lever, (ctx, x, y, z) =>
    toWorldBound(leverShape(ctx.world.getBlockMetadata(x, y, z)), x, y, z));
}
