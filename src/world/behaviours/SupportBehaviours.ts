import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { BlockRegistry } from '../../blocks/BlockRegistry';

function solid(registry: BlockRegistry, id: number): boolean {
  return registry.getById(id)?.solid === true;
}

abstract class SupportedBehaviour implements BlockBehaviour {
  public readonly randomTicks = false;
  public constructor(protected readonly blocks: BlockRegistry) {}
  public abstract canSurvive(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean;
  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    if (!this.canSurvive(ctx, x, y, z)) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
    }
  }
}

class TorchBehaviour extends SupportedBehaviour {
  public canSurvive(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    if (meta === 1) return solid(this.blocks, ctx.world.getBlock(x - 1, y, z));
    if (meta === 2) return solid(this.blocks, ctx.world.getBlock(x + 1, y, z));
    if (meta === 3) return solid(this.blocks, ctx.world.getBlock(x, y, z - 1));
    if (meta === 4) return solid(this.blocks, ctx.world.getBlock(x, y, z + 1));
    return solid(this.blocks, ctx.world.getBlock(x, y - 1, z));
  }
}

class LadderBehaviour extends SupportedBehaviour {
  public canSurvive(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    if (meta === 2) return solid(this.blocks, ctx.world.getBlock(x, y, z + 1));
    if (meta === 3) return solid(this.blocks, ctx.world.getBlock(x, y, z - 1));
    if (meta === 4) return solid(this.blocks, ctx.world.getBlock(x + 1, y, z));
    if (meta === 5) return solid(this.blocks, ctx.world.getBlock(x - 1, y, z));
    return false;
  }
}

class GenericAttachedBehaviour extends SupportedBehaviour {
  public canSurvive(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    if (meta === 1) return solid(this.blocks, ctx.world.getBlock(x - 1, y, z));
    if (meta === 2) return solid(this.blocks, ctx.world.getBlock(x + 1, y, z));
    if (meta === 3) return solid(this.blocks, ctx.world.getBlock(x, y, z - 1));
    if (meta === 4) return solid(this.blocks, ctx.world.getBlock(x, y, z + 1));
    return solid(this.blocks, ctx.world.getBlock(x, y - 1, z));
  }
}

export function registerSupportBehaviours(registry: BlockBehaviourRegistry, blocks: BlockRegistry): void {
  registry.register(BlockIds.Torch, new TorchBehaviour(blocks));
  registry.register(BlockIds.Ladder, new LadderBehaviour(blocks));
  registry.register(BlockIds.SignPost, new GenericAttachedBehaviour(blocks));
  registry.register(BlockIds.WallSign, new GenericAttachedBehaviour(blocks));
}
