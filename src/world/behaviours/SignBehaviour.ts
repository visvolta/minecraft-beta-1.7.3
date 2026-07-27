import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext } from '../BlockBehaviour';
import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';
import type { SignManager } from '../../sign/SignManager';
import { supportDirectionFromAttachedMetadata, supportOffset } from '../../blocks/BlockOrientation';

export class SignBehaviour implements BlockBehaviour {
  public constructor(private readonly signManager: SignManager) {}

  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    return ctx.world.isNormalCube(x, y - 1, z)
      || ctx.world.isNormalCube(x - 1, y, z)
      || ctx.world.isNormalCube(x + 1, y, z)
      || ctx.world.isNormalCube(x, y, z - 1)
      || ctx.world.isNormalCube(x, y, z + 1);
  }

  public onPlaced(_ctx: BlockBehaviourContext, x: number, y: number, z: number, _blockId: BlockId): void {
    // Placement metadata is authored by InteractionController from the clicked
    // face/player yaw using the shared orientation convention. Do not recompute
    // from Player here: the behaviour is also used by chunk load/tests and the
    // Player object does not own a lookDirection.
    this.signManager.getOrCreate(x, y, z);
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number, _sourceX: number, _sourceY: number, _sourceZ: number): void {
    const blockId = ctx.world.getBlock(x, y, z);
    const meta = ctx.world.getBlockMetadata(x, y, z);

    let drop = false;
    if (blockId === BlockIds.SignPost) {
      if (!ctx.world.isNormalCube(x, y - 1, z)) drop = true;
    } else {
      const support = supportDirectionFromAttachedMetadata(meta);
      if (support === undefined) drop = true;
      else {
        const offset = supportOffset(support);
        if (!ctx.world.isNormalCube(x + offset.x, y, z + offset.z)) drop = true;
      }
    }

    if (drop) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
      this.signManager.remove(x, y, z);
      ctx.events?.enqueueBlockDrop(ctx.gameTick, 0, blockId, 0, x, y, z, 'placement_failed');
    }
  }

  public onRemoved(_ctx: BlockBehaviourContext, x: number, y: number, z: number, _oldBlockId: BlockId): void {
    this.signManager.remove(x, y, z);
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    if (type === 'collision') return [];

    const blockId = ctx.world.getBlock(x, y, z);
    if (blockId === BlockIds.SignPost) {
      return [new AABB(x + 0.25, y, z + 0.25, x + 0.75, y + 1, z + 0.75)];
    }

    // Beta BlockSign wall bounds: y 0.28125..0.78125, 0.125 deep, full width.
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const d = 0.125;
    const lo = 0.28125;
    const hi = 0.78125;
    if (meta === 2) return [new AABB(x, y + lo, z + 1 - d, x + 1, y + hi, z + 1)];
    if (meta === 3) return [new AABB(x, y + lo, z, x + 1, y + hi, z + d)];
    if (meta === 4) return [new AABB(x + 1 - d, y + lo, z, x + 1, y + hi, z + 1)];
    if (meta === 5) return [new AABB(x, y + lo, z, x + d, y + hi, z + 1)];

    return [new AABB(x, y, z, x + 1, y + 1, z + 1)];
  }
}

export function registerSignBehaviour(registry: BlockBehaviourRegistry, signManager: SignManager): void {
  const b = new SignBehaviour(signManager);
  registry.register(BlockIds.SignPost, b);
  registry.register(BlockIds.WallSign, b);
}
