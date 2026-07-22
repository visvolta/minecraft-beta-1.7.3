import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { PowerQueryContext, RedstonePower } from '../redstone/RedstonePower';
import { FaceDirection } from '../../blocks/BlockFace';

export class LeverBehaviour implements BlockBehaviour {
    public readonly canProvidePower = true;

    public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        const orientation = meta & 7;
        const active = (meta & 8) === 0;
        const newMeta = orientation | (active ? 8 : 0);
        
        ctx.world.setBlockMetadataWithNotify(x, y, z, newMeta);
        // Play click sound if possible? For now just notify.
        this.notifyNeighbors(ctx, x, y, z, orientation);
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
        if ((orientation === 5 || orientation === 6) && !ctx.world.isNormalCube(x, y - 1, z)) drop = true;

        if (drop) {
            ctx.world.dropBlockAsItem(x, y, z, BlockIds.Lever);
            ctx.world.setBlockWithNotify(x, y, z, BlockIds.Air);
        }
    }

    private notifyNeighbors(ctx: BlockBehaviourContext, x: number, y: number, z: number, orientation: number): void {
        ctx.world.notifyNeighborsOfStateChange(x, y, z, BlockIds.Lever);
        if (orientation === 1) ctx.world.notifyNeighborsOfStateChange(x - 1, y, z, BlockIds.Lever);
        else if (orientation === 2) ctx.world.notifyNeighborsOfStateChange(x + 1, y, z, BlockIds.Lever);
        else if (orientation === 3) ctx.world.notifyNeighborsOfStateChange(x, y, z - 1, BlockIds.Lever);
        else if (orientation === 4) ctx.world.notifyNeighborsOfStateChange(x, y, z + 1, BlockIds.Lever);
        else ctx.world.notifyNeighborsOfStateChange(x, y - 1, z, BlockIds.Lever);
    }

    public getWeakPower(ctx: PowerQueryContext): RedstonePower {
        return (ctx.sourceMetadata & 8) ? 15 as RedstonePower : 0 as RedstonePower;
    }

    public getStrongPower(ctx: PowerQueryContext): RedstonePower {
        if (!(ctx.sourceMetadata & 8)) return 0 as RedstonePower;
        const orientation = ctx.sourceMetadata & 7;
        
        // Strong power to the attached block.
        if (orientation === 1 && ctx.directionToSource === FaceDirection.EAST) return 15 as RedstonePower;
        if (orientation === 2 && ctx.directionToSource === FaceDirection.WEST) return 15 as RedstonePower;
        if (orientation === 3 && ctx.directionToSource === FaceDirection.SOUTH) return 15 as RedstonePower;
        if (orientation === 4 && ctx.directionToSource === FaceDirection.NORTH) return 15 as RedstonePower;
        if ((orientation === 5 || orientation === 6) && ctx.directionToSource === FaceDirection.TOP) return 15 as RedstonePower;

        return 0 as RedstonePower;
    }
}

export function registerLeverBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Lever, new LeverBehaviour());
}
