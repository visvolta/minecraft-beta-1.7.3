import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { supportDirectionFromTrapdoorMetadata, supportOffset } from '../../blocks/BlockOrientation';

export class TrapdoorBehaviour implements BlockBehaviour {
    public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
        return ctx.world.isNormalCube(x - 1, y, z)
            || ctx.world.isNormalCube(x + 1, y, z)
            || ctx.world.isNormalCube(x, y, z - 1)
            || ctx.world.isNormalCube(x, y, z + 1);
    }

    public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
        this.toggle(ctx, x, y, z);
        return true;
    }

    public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        const support = supportOffset(supportDirectionFromTrapdoorMetadata(meta));

        if (!ctx.world.isNormalCube(x + support.x, y, z + support.z)) {
            ctx.world.dropBlockAsItem(x, y, z, BlockIds.Trapdoor, meta);
            ctx.world.setBlock(x, y, z, 0);
            return;
        }

        // Redstone
        const powered = ctx.power?.isBlockIndirectlyPowered({ x, y, z });
        const isOpen = (meta & 4) !== 0;
        if (!!powered !== isOpen) {
            const next = meta ^ 4;
            ctx.world.setBlockMetadataWithNotify(x, y, z, next);
            ctx.playBlockSound?.((next & 4) !== 0 ? 'door_open' : 'door_close', x + 0.5, y + 0.5, z + 0.5);
        }
    }

    private toggle(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        const next = meta ^ 4;
        ctx.world.setBlockMetadataWithNotify(x, y, z, next);
        ctx.playBlockSound?.((next & 4) !== 0 ? 'door_open' : 'door_close', x + 0.5, y + 0.5, z + 0.5);
    }
}

export function registerTrapdoorBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Trapdoor, new TrapdoorBehaviour());
}
