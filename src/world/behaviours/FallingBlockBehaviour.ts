import { BlockIds } from '../../blocks/BlockId';
import type { BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { FallingBlockManager } from '../entities/FallingBlockManager';

class FallingBlockBehaviour implements BlockBehaviour {
  public readonly randomTicks = false;

  public constructor(
    private readonly blockId: BlockId,
    private readonly manager: FallingBlockManager,
    private readonly blocks: BlockRegistry,
  ) {}

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    ctx.world.scheduleBlockTick(x, y, z, this.blockId, 3);
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    ctx.world.scheduleBlockTick(x, y, z, this.blockId, 3);
  }

  public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    if (!this.canFallThrough(ctx.world.getBlock(x, y - 1, z))) return;
    const metadata = ctx.world.getBlockMetadata(x, y, z);
    if (ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true })) {
      this.manager.spawn(this.blockId, metadata, x + 0.5, y + 0.5, z + 0.5);
    }
  }

  private canFallThrough(id: BlockId): boolean {
    if (id === BlockIds.Air || id === BlockIds.WaterFlowing || id === BlockIds.WaterStill || id === BlockIds.LavaFlowing || id === BlockIds.LavaStill) return true;
    return this.blocks.getById(id)?.replaceable === true;
  }
}

export function registerFallingBlockBehaviours(registry: BlockBehaviourRegistry, blocks: BlockRegistry, manager: FallingBlockManager): void {
  registry.register(BlockIds.Sand, new FallingBlockBehaviour(BlockIds.Sand, manager, blocks));
  registry.register(BlockIds.Gravel, new FallingBlockBehaviour(BlockIds.Gravel, manager, blocks));
}
