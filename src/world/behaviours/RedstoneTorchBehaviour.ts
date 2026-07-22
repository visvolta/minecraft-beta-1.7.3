import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { PowerQueryContext, RedstonePower } from '../redstone/RedstonePower';
import { FaceDirection } from '../../blocks/BlockFace';
import { ALL_BLOCK_DIRECTIONS, directionOffset } from '../BlockDirections';

interface BurnoutInfo {
    tick: number;
}

export class RedstoneTorchBehaviour implements BlockBehaviour {
    public readonly requiresNeighbourReconciliation = true;
    public readonly canProvidePower = true;
    private readonly burnoutMap = new Map<string, BurnoutInfo[]>();

    public constructor(private readonly active: boolean) {}

    public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
        if (ctx.world.isNormalCube(x - 1, y, z)) return true;
        if (ctx.world.isNormalCube(x + 1, y, z)) return true;
        if (ctx.world.isNormalCube(x, y, z - 1)) return true;
        if (ctx.world.isNormalCube(x, y, z + 1)) return true;
        return ctx.world.isNormalCube(x, y - 1, z);
    }

    public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        if (this.active) {
            this.notifyNeighbors(ctx, x, y, z);
        }
    }

    public onRemoved(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        if (this.active) {
            this.notifyNeighbors(ctx, x, y, z);
        }
        this.burnoutMap.delete(`${x},${y},${z}`);
    }

    public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        let drop = false;
        if (meta === 1 && !ctx.world.isNormalCube(x - 1, y, z)) drop = true;
        if (meta === 2 && !ctx.world.isNormalCube(x + 1, y, z)) drop = true;
        if (meta === 3 && !ctx.world.isNormalCube(x, y, z - 1)) drop = true;
        if (meta === 4 && !ctx.world.isNormalCube(x, y, z + 1)) drop = true;
        if (meta === 5 && !ctx.world.isNormalCube(x, y - 1, z)) drop = true;

        if (drop) {
            ctx.world.dropBlockAsItem(x, y, z, BlockIds.RedstoneTorchOn);
            ctx.world.setBlockWithNotify(x, y, z, BlockIds.Air);
        } else {
            ctx.world.scheduleBlockTick(x, y, z, this.active ? BlockIds.RedstoneTorchOn : BlockIds.RedstoneTorchOff, 2);
        }
    }

    public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        const isPowered = this.isIndirectlyPowered(ctx, x, y, z);
        this.cleanupBurnout(ctx.gameTick);

        if (this.active) {
            if (isPowered) {
                ctx.world.setBlock(x, y, z, BlockIds.RedstoneTorchOff, { metadata: ctx.world.getBlockMetadata(x, y, z), notifyNeighbours: true });
                if (this.checkForBurnout(ctx, x, y, z, true)) {
                    // burnout effects would go here (fizz sound, smoke)
                }
            }
        } else {
            if (!isPowered && !this.checkForBurnout(ctx, x, y, z, false)) {
                ctx.world.setBlock(x, y, z, BlockIds.RedstoneTorchOn, { metadata: ctx.world.getBlockMetadata(x, y, z), notifyNeighbours: true });
            }
        }
    }

    private isIndirectlyPowered(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        if (meta === 5 && ctx.power?.getIndirectPowerFrom({ x, y, z }, FaceDirection.BOTTOM)) return true;
        if (meta === 3 && ctx.power?.getIndirectPowerFrom({ x, y, z }, FaceDirection.NORTH)) return true;
        if (meta === 4 && ctx.power?.getIndirectPowerFrom({ x, y, z }, FaceDirection.SOUTH)) return true;
        if (meta === 1 && ctx.power?.getIndirectPowerFrom({ x, y, z }, FaceDirection.WEST)) return true;
        if (meta === 2 && ctx.power?.getIndirectPowerFrom({ x, y, z }, FaceDirection.EAST)) return true;
        return false;
    }

    private checkForBurnout(ctx: BlockBehaviourContext, x: number, y: number, z: number, add: boolean): boolean {
        const key = `${x},${y},${z}`;
        if (add) {
            const updates = this.burnoutMap.get(key) ?? [];
            updates.push({ tick: ctx.gameTick });
            this.burnoutMap.set(key, updates);
        }

        const updates = this.burnoutMap.get(key);
        if (updates && updates.length >= 8) {
            return true;
        }
        return false;
    }

    private cleanupBurnout(currentTick: number): void {
        for (const [key, updates] of this.burnoutMap.entries()) {
            const filtered = updates.filter(u => currentTick - u.tick <= 100);
            if (filtered.length === 0) {
                this.burnoutMap.delete(key);
            } else {
                this.burnoutMap.set(key, filtered);
            }
        }
    }

    private notifyNeighbors(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        for (const dir of ALL_BLOCK_DIRECTIONS) {
            const offset = directionOffset(dir);
            ctx.world.notifyNeighborsOfStateChange(x + offset.x, y + offset.y, z + offset.z, this.active ? BlockIds.RedstoneTorchOn : BlockIds.RedstoneTorchOff);
        }
    }

    public getWeakPower(ctx: PowerQueryContext): RedstonePower {
        if (!this.active) return 0 as RedstonePower;
        const meta = ctx.sourceMetadata;
        
        // Beta: Torch doesn't power the block it's attached to.
        if (meta === 5 && ctx.directionToSource === FaceDirection.TOP) return 0 as RedstonePower;
        if (meta === 3 && ctx.directionToSource === FaceDirection.SOUTH) return 0 as RedstonePower;
        if (meta === 4 && ctx.directionToSource === FaceDirection.NORTH) return 0 as RedstonePower;
        if (meta === 1 && ctx.directionToSource === FaceDirection.EAST) return 0 as RedstonePower;
        if (meta === 2 && ctx.directionToSource === FaceDirection.WEST) return 0 as RedstonePower;

        return 15 as RedstonePower;
    }

    public getStrongPower(ctx: PowerQueryContext): RedstonePower {
        // Torch only provides strong power to the block ABOVE it.
        if (this.active && ctx.directionToSource === FaceDirection.BOTTOM) {
            return 15 as RedstonePower;
        }
        return 0 as RedstonePower;
    }
}

export function registerRedstoneTorchBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.RedstoneTorchOff, new RedstoneTorchBehaviour(false));
  registry.register(BlockIds.RedstoneTorchOn, new RedstoneTorchBehaviour(true));
}
