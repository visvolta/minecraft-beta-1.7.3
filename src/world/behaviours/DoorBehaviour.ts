import { BlockIds } from '../../blocks/BlockId';
import type { AABB } from '../../physics/AABB';
import { doorShape } from '../../blocks/shapes/BlockShapes';
import { toWorldBound } from '../../blocks/shapes/toWorldBounds';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry, BoundingBoxType } from '../BlockBehaviour';

export class DoorBehaviour implements BlockBehaviour {
    public constructor(private readonly isIron: boolean) {}

    /**
     * Doors occupy a thin panel, not the whole cell. Both halves derive their
     * shape from the lower half's metadata so the upper half swings with the
     * door instead of colliding as a full cube (the cause of the previous
     * one-way collision and mismatched selection outline).
     */
    public getBoundingBoxes(
        ctx: BlockBehaviourContext,
        x: number,
        y: number,
        z: number,
        _type: BoundingBoxType,
    ): AABB[] | undefined {
        const metadata = ctx.world.getBlockMetadata(x, y, z);
        const isUpper = (metadata & 8) !== 0;
        // Facing and the open flag live on the lower half in Beta.
        const stateMeta = isUpper ? ctx.world.getBlockMetadata(x, y - 1, z) : metadata;
        return toWorldBound(doorShape(stateMeta), x, y, z);
    }

    public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
        if (this.isIron) return true;
        const meta = ctx.world.getBlockMetadata(x, y, z);
        const isUpper = (meta & 8) !== 0;
        const lx = x;
        const ly = isUpper ? y - 1 : y;
        const lz = z;
        const lowerMeta = ctx.world.getBlockMetadata(lx, ly, lz);
        const opening = (lowerMeta & 4) === 0;
        this.setDoorState(ctx, lx, ly, lz, opening);
        // Beta plays one door sound per toggle, from the lower half.
        ctx.playBlockSound?.(opening ? 'door_open' : 'door_close', lx + 0.5, ly + 0.5, lz + 0.5);
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
