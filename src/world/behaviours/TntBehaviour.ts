import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { PrimedTntEntity } from '../../entities/PrimedTntEntity';

export class TntBehaviour implements BlockBehaviour {
    public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        if (ctx.power?.isBlockIndirectlyPowered({ x, y, z })) {
            this.prime(ctx, x, y, z);
        }
    }

    public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        if (ctx.power?.isBlockIndirectlyPowered({ x, y, z })) {
            this.prime(ctx, x, y, z);
        }
    }

    private prime(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        ctx.world.setBlock(x, y, z, 0, { notifyNeighbours: true, reason: 'world' });
        
        if (ctx.entities) {
            const entity = new PrimedTntEntity(ctx.entities.context, x + 0.5, y + 0.5, z + 0.5);
            ctx.entities.add(entity);
            // ctx.world.playSound(...) // random.fuse
        }
    }
}

export function registerTntBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.TNT, new TntBehaviour());
}
