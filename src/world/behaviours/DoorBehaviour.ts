import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';

export class DoorBehaviour implements BlockBehaviour {
    public constructor(private readonly isIron: boolean) {}

    public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
        if (this.isIron) return true;
        const meta = ctx.world.getBlockMetadata(x, y, z);
        const isUpper = (meta & 8) !== 0;
        const lx = x;
        const ly = isUpper ? y - 1 : y;
        const lz = z;
        const lowerMeta = ctx.world.getBlockMetadata(lx, ly, lz);
        this.setDoorState(ctx, lx, ly, lz, (lowerMeta & 4) === 0);
        return true;
    }

    public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        const isUpper = (meta & 8) !== 0;
        const doorId = this.isIron ? BlockIds.IronDoor : BlockIds.WoodDoor;

        if (isUpper) {
            if (ctx.world.getBlock(x, y - 1, z) !== doorId) {
                ctx.world.setBlock(x, y, z, 0, { notifyNeighbours: true });
                return;
            }
        } else {
            if (ctx.world.getBlock(x, y + 1, z) !== doorId || !ctx.world.isNormalCube(x, y - 1, z)) {
                ctx.world.setBlock(x, y, z, 0, { notifyNeighbours: true });
                if (!this.isIron) ctx.world.dropBlockAsItem(x, y, z, doorId);
                if (ctx.world.getBlock(x, y + 1, z) === doorId) {
                    ctx.world.setBlock(x, y + 1, z, 0, { notifyNeighbours: true });
                }
                return;
            }
        }

        if (!isUpper) {
            const powered = (ctx.power?.isBlockIndirectlyPowered({ x: x, y: y, z: z }) ?? false) || 
                            (ctx.power?.isBlockIndirectlyPowered({ x: x, y: y + 1, z: z }) ?? false);
            const isOpen = (meta & 4) !== 0;
            if (powered !== isOpen) {
                this.setDoorState(ctx, x, y, z, powered);
            }
        }
    }

    private setDoorState(ctx: BlockBehaviourContext, x: number, y: number, z: number, open: boolean): void {
        const lowerMeta = ctx.world.getBlockMetadata(x, y, z);
        const upperMeta = ctx.world.getBlockMetadata(x, y + 1, z);
        
        const newLower = (lowerMeta & ~4) | (open ? 4 : 0);
        const newUpper = (upperMeta & ~4) | (open ? 4 : 0);
        
        if (((lowerMeta & 4) !== 0) !== open) {
            ctx.world.setBlockMetadata(x, y, z, newLower, { notifyNeighbours: true });
            ctx.world.setBlockMetadata(x, y + 1, z, newUpper, { notifyNeighbours: true });
            ctx.world.markDirty(x, z);
        }
    }
}

export function registerDoorBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.WoodDoor, new DoorBehaviour(false));
  registry.register(BlockIds.IronDoor, new DoorBehaviour(true));
}
