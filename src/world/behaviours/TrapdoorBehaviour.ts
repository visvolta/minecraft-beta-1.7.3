import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';

export class TrapdoorBehaviour implements BlockBehaviour {
    public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
        this.toggle(ctx, x, y, z);
        return true;
    }

    public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        const orientation = meta & 3;
        
        // Attachment check
        let ax = x, az = z;
        if (orientation === 0) az = z + 1;
        else if (orientation === 1) az = z - 1;
        else if (orientation === 2) ax = x + 1;
        else if (orientation === 3) ax = x - 1;

        if (!ctx.world.isNormalCube(ax, y, az)) {
            ctx.world.setBlock(x, y, z, 0);
            ctx.world.dropBlockAsItem(x, y, z, BlockIds.Trapdoor);
            return;
        }

        // Redstone
        const powered = ctx.power?.isBlockIndirectlyPowered({ x, y, z });
        const isOpen = (meta & 4) !== 0;
        if (!!powered !== isOpen) {
            ctx.world.setBlockMetadataWithNotify(x, y, z, meta ^ 4);
            // ctx.world.playSound(...)
        }
    }

    private toggle(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        ctx.world.setBlockMetadataWithNotify(x, y, z, meta ^ 4);
    }
}

export function registerTrapdoorBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Trapdoor, new TrapdoorBehaviour());
}
