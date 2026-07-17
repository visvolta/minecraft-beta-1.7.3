import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { BlockRegistry } from '../../blocks/BlockRegistry';

const FLAMMABILITY = new Map<number, { encouragement: number; flammability: number }>([
  [BlockIds.Log, { encouragement: 5, flammability: 5 }],
  [BlockIds.SpruceLog, { encouragement: 5, flammability: 5 }],
  [BlockIds.Leaves, { encouragement: 30, flammability: 60 }],
  [BlockIds.SpruceLeaves, { encouragement: 30, flammability: 60 }],
  [BlockIds.Reed, { encouragement: 60, flammability: 100 }],
  [BlockIds.Cactus, { encouragement: 5, flammability: 5 }],
]);

const DIRECTIONS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]] as const;

export class FireBehaviour implements BlockBehaviour {
  public readonly randomTicks = true;

  public constructor(private readonly blocks: BlockRegistry) {}

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    if (!this.hasSupport(ctx, x, y, z)) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
    }
  }

  public randomTick(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    if (!this.hasSupport(ctx, x, y, z)) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
      return;
    }

    const age = Math.min(15, ctx.world.getBlockMetadata(x, y, z) + 1);
    ctx.world.setBlockMetadata(x, y, z, age, { affectsMesh: true, affectsWeather: false, affectsLight: false });

    for (const [dx, dy, dz] of DIRECTIONS) {
      const targetX = x + dx;
      const targetY = y + dy;
      const targetZ = z + dz;
      const target = ctx.world.getBlock(targetX, targetY, targetZ);
      const flammable = FLAMMABILITY.get(target);
      if (flammable === undefined || ctx.world.getBlock(targetX, targetY, targetZ) === BlockIds.Fire) continue;
      if ((ctx.nextInt?.(100) ?? 0) < flammable.flammability) {
        ctx.world.setBlock(targetX, targetY, targetZ, BlockIds.Fire, { metadata: Math.min(15, age), reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
      }
    }

    if (age >= 15 && (ctx.nextInt?.(4) ?? 0) === 0) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
    }
  }

  private hasSupport(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    if (this.blocks.getById(ctx.world.getBlock(x, y - 1, z))?.solid === true) return true;
    for (const [dx, dy, dz] of DIRECTIONS) {
      if (this.blocks.getById(ctx.world.getBlock(x + dx, y + dy, z + dz))?.solid === true) return true;
    }
    return false;
  }
}

export function registerFireBehaviour(registry: BlockBehaviourRegistry, blocks: BlockRegistry): void {
  registry.register(BlockIds.Fire, new FireBehaviour(blocks));
}
