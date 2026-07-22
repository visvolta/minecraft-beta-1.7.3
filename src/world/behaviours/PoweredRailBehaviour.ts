import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';

export class PoweredRailBehaviour implements BlockBehaviour {
    public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
        const meta = ctx.world.getBlockMetadata(x, y, z);
        const orientation = meta & 7;
        
        if (!ctx.world.isNormalCube(x, y - 1, z)) {
            ctx.world.dropBlockAsItem(x, y, z, BlockIds.PoweredRail);
            ctx.world.setBlockWithNotify(x, y, z, 0);
            return;
        }

        const isPowered = this.checkChainPower(ctx, x, y, z, meta, true, 0) ||
                         this.checkChainPower(ctx, x, y, z, meta, false, 0);
        
        const currentActive = (meta & 8) !== 0;
        if (isPowered !== currentActive) {
            ctx.world.setBlockMetadataWithNotify(x, y, z, orientation | (isPowered ? 8 : 0));
        }
    }

    private checkChainPower(ctx: BlockBehaviourContext, x: number, y: number, z: number, meta: number, direction: boolean, depth: number): boolean {
        if (depth >= 8) return false;
        
        // Is THIS rail directly powered?
        if (ctx.power?.isBlockIndirectlyPowered({ x, y, z }) || ctx.power?.isBlockIndirectlyPowered({ x, y + 1, z })) {
            return true;
        }

        const orientation = meta & 7;
        let nx = x, ny = y, nz = z;
        
        if (orientation === 0) nz += direction ? 1 : -1;
        else if (orientation === 1) nx += direction ? 1 : -1;
        else if (orientation === 2) { nx += direction ? 1 : -1; if (direction) ny++; }
        else if (orientation === 3) { nx += direction ? -1 : 1; if (!direction) ny++; }
        else if (orientation === 4) { nz += direction ? -1 : 1; if (direction) ny++; }
        else if (orientation === 5) { nz += direction ? 1 : -1; if (!direction) ny++; }

        // Try same level or one below (for slopes)
        return this.isRailPowered(ctx, nx, ny, nz, direction, depth, orientation) || 
               this.isRailPowered(ctx, nx, ny - 1, nz, direction, depth, orientation);
    }

    private isRailPowered(ctx: BlockBehaviourContext, x: number, y: number, z: number, direction: boolean, depth: number, parentOrientation: number): boolean {
        const id = ctx.world.getBlock(x, y, z);
        if (id !== BlockIds.PoweredRail) return false;

        const meta = ctx.world.getBlockMetadata(x, y, z);
        const orientation = meta & 7;

        // Continuity check
        if (parentOrientation === 1 && (orientation === 0 || orientation === 4 || orientation === 5)) return false;
        if (parentOrientation === 0 && (orientation === 1 || orientation === 2 || orientation === 3)) return false;

        // If this neighbor is directly powered, chain is powered
        if (ctx.power?.isBlockIndirectlyPowered({ x, y, z }) || ctx.power?.isBlockIndirectlyPowered({ x, y + 1, z })) {
            return true;
        }

        // Recursively check next in chain
        return this.checkChainPower(ctx, x, y, z, meta, direction, depth + 1);
    }
}

export function registerPoweredRailBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.PoweredRail, new PoweredRailBehaviour());
}
