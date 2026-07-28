import { BlockIds } from '../../blocks/BlockId';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';

/** Beta 1.7.3 BlockGrass.updateTick. */
export class GrassBehaviour implements BlockBehaviour {
  public readonly randomTicks = true;

  public constructor(private readonly blocks: BlockRegistry) {}

  public randomTick(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const nextInt = ctx.nextInt;
    if (nextInt === undefined) return;

    const aboveLight = this.getBlockLightValue(ctx, x, y + 1, z);
    const aboveOpacity = this.getLightOpacity(ctx.world.getBlock(x, y + 1, z));

    if (aboveLight < 4 && aboveOpacity > 2) {
      if (nextInt(4) !== 0) return;
      ctx.world.setBlock(x, y, z, BlockIds.Dirt, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
      return;
    }

    if (aboveLight < 9) return;

    const targetX = x + nextInt(3) - 1;
    const targetY = y + nextInt(5) - 3;
    const targetZ = z + nextInt(3) - 1;
    if (targetY < 0 || targetY >= 128) return;
    if (!ctx.world.isLoaded(targetX, targetZ)) return;

    const targetAboveId = ctx.world.getBlock(targetX, targetY + 1, targetZ);
    if (ctx.world.getBlock(targetX, targetY, targetZ) !== BlockIds.Dirt) return;
    if (this.getBlockLightValue(ctx, targetX, targetY + 1, targetZ) < 4) return;
    if (this.getLightOpacity(targetAboveId) > 2) return;

    ctx.world.setBlock(targetX, targetY, targetZ, BlockIds.Grass, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
  }

  private getBlockLightValue(ctx: BlockBehaviourContext, x: number, y: number, z: number): number {
    return Math.max(ctx.world.getSkylight(x, y, z), ctx.world.getBlocklight(x, y, z));
  }

  private getLightOpacity(blockId: number): number {
    const definition = this.blocks.getById(blockId);
    if (definition === undefined) return 0;
    return definition.lightOpacity ?? (definition.solid ? 15 : 0);
  }
}

export function registerGrassBehaviour(registry: BlockBehaviourRegistry, blocks: BlockRegistry): void {
  registry.register(BlockIds.Grass, new GrassBehaviour(blocks));
}
