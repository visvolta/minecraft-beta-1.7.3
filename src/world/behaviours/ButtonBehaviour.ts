import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { PowerQueryContext, RedstonePower } from '../redstone/RedstonePower';
import { FaceDirection } from '../../blocks/BlockFace';

export class ButtonBehaviour implements BlockBehaviour {
    public readonly canProvidePower = true;

    public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        if (meta & 8) return true; // Already pressed

        const orientation = meta & 7;
        ctx.world.setBlockMetadataWithNotify(x, y, z, orientation | 8);
        this.notifyNeighbors(ctx, x, y, z, orientation);
        ctx.world.scheduleBlockTick(x, y, z, BlockIds.StoneButton, 20);
        return true;
    }

    public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        const orientation = meta & 7;
        let drop = false;
        if (orientation === 1 && !ctx.world.isNormalCube(x - 1, y, z)) drop = true;
        if (orientation === 2 && !ctx.world.isNormalCube(x + 1, y, z)) drop = true;
        if (orientation === 3 && !ctx.world.isNormalCube(x, y, z - 1)) drop = true;
        if (orientation === 4 && !ctx.world.isNormalCube(x, y, z + 1)) drop = true;

        if (drop) {
            ctx.world.dropBlockAsItem(x, y, z, BlockIds.StoneButton);
            ctx.world.setBlockWithNotify(x, y, z, BlockIds.Air);
        }
    }

    public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        if (meta & 8) {
            const orientation = meta & 7;
            ctx.world.setBlockMetadataWithNotify(x, y, z, orientation);
            this.notifyNeighbors(ctx, x, y, z, orientation);
        }
    }

    private notifyNeighbors(ctx: BlockBehaviourContext, x: number, y: number, z: number, orientation: number): void {
        ctx.world.notifyNeighborsOfStateChange(x, y, z, BlockIds.StoneButton);
        if (orientation === 1) ctx.world.notifyNeighborsOfStateChange(x - 1, y, z, BlockIds.StoneButton);
        else if (orientation === 2) ctx.world.notifyNeighborsOfStateChange(x + 1, y, z, BlockIds.StoneButton);
        else if (orientation === 3) ctx.world.notifyNeighborsOfStateChange(x, y, z - 1, BlockIds.StoneButton);
        else if (orientation === 4) ctx.world.notifyNeighborsOfStateChange(x, y, z + 1, BlockIds.StoneButton);
    }

    public getWeakPower(ctx: PowerQueryContext): RedstonePower {
        return (ctx.sourceMetadata & 8) ? 15 as RedstonePower : 0 as RedstonePower;
    }

    public getStrongPower(ctx: PowerQueryContext): RedstonePower {
        if (!(ctx.sourceMetadata & 8)) return 0 as RedstonePower;
        const orientation = ctx.sourceMetadata & 7;
        
        if (orientation === 1 && ctx.directionToSource === FaceDirection.EAST) return 15 as RedstonePower;
        if (orientation === 2 && ctx.directionToSource === FaceDirection.WEST) return 15 as RedstonePower;
        if (orientation === 3 && ctx.directionToSource === FaceDirection.SOUTH) return 15 as RedstonePower;
        if (orientation === 4 && ctx.directionToSource === FaceDirection.NORTH) return 15 as RedstonePower;

        return 0 as RedstonePower;
    }
}

export function registerButtonBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.StoneButton, new ButtonBehaviour());
}
