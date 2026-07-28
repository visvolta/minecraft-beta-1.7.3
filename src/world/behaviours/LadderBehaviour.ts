import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext } from '../BlockBehaviour';
import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';
import { supportDirectionFromAttachedMetadata, supportOffset, attachedMetadataFromSupport, type HorizontalDirection } from '../../blocks/BlockOrientation';

export class LadderBehaviour implements BlockBehaviour {
  public readonly isClimbable = true;
  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    return ctx.world.isNormalCube(x - 1, y, z)
      || ctx.world.isNormalCube(x + 1, y, z)
      || ctx.world.isNormalCube(x, y, z - 1)
      || ctx.world.isNormalCube(x, y, z + 1);
  }

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number, _blockId: BlockId): void {
    const metaAlreadySet = ctx.world.getBlockMetadata(x, y, z);
    if (metaAlreadySet !== 0) return;

    const supports: readonly HorizontalDirection[] = ['south', 'north', 'east', 'west'];
    const support = supports.find((direction) => {
      const offset = supportOffset(direction);
      return ctx.world.isNormalCube(x + offset.x, y, z + offset.z);
    });
    if (support !== undefined) {
      ctx.world.setBlockMetadata(x, y, z, attachedMetadataFromSupport(support), { affectsMesh: true, affectsLight: false });
    }
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number, _sourceX: number, _sourceY: number, _sourceZ: number): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const support = supportDirectionFromAttachedMetadata(meta);
    const offset = support === undefined ? undefined : supportOffset(support);

    if (offset === undefined || !ctx.world.isNormalCube(x + offset.x, y, z + offset.z)) {
      ctx.world.dropBlockAsItem(x, y, z, BlockIds.Ladder, meta);
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
    }
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    if (type === 'collision') return [];
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const t = 2 / 16; // 1/8 thick (approx, Beta actually uses bounds based on state)

    if (meta === 2) return [new AABB(x, y, z + 1 - t, x + 1, y + 1, z + 1)]; // Attached to South (+Z), so bounding box is at +Z edge
    if (meta === 3) return [new AABB(x, y, z, x + 1, y + 1, z + t)];
    if (meta === 4) return [new AABB(x + 1 - t, y, z, x + 1, y + 1, z + 1)];
    if (meta === 5) return [new AABB(x, y, z, x + t, y + 1, z + 1)];

    return [];
  }
}

export function registerLadderBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Ladder, new LadderBehaviour());
}
