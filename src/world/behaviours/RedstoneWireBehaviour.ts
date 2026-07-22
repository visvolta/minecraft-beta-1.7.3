import { BlockIds } from '../../blocks/BlockId';
import type { BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { NeighbourUpdateEvent } from '../updates/BlockMutation';
import { getWireConnections, WireConnection } from '../redstone/RedstoneWireConnectivity';
import type { PowerQueryContext, RedstonePower } from '../redstone/RedstonePower';
import { FaceDirection } from '../../blocks/BlockFace';
import { ALL_BLOCK_DIRECTIONS, HORIZONTAL_BLOCK_DIRECTIONS, directionOffset } from '../BlockDirections';

export class RedstoneWireBehaviour implements BlockBehaviour {
  public readonly requiresNeighbourReconciliation = true;
  public readonly canProvidePower = true;
  private wiresProvidePower = true;

  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    return ctx.world.isNormalCube(x, y - 1, z);
  }

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    this.updateAndPropagateCurrentStrength(ctx, x, y, z);
    this.notifyBetaNeighbors(ctx, x, y, z);
  }

  public onRemoved(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    ctx.world.notifyNeighborsOfStateChange(x, y, z, BlockIds.RedstoneWire);
    this.notifyBetaNeighbors(ctx, x, y, z);
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number, _sx: number, _sy: number, _sz: number, event?: NeighbourUpdateEvent): void {
    if (!this.canPlaceBlockAt(ctx, x, y, z)) {
      ctx.world.dropBlockAsItem(x, y, z, BlockIds.RedstoneWire);
      ctx.world.setBlockWithNotify(x, y, z, BlockIds.Air);
      return;
    }

    // event.reason instead of event.type
    if (event?.reason === 'world' || event?.reason === 'scheduled' || event?.reason === 'player' || !event) {
      this.updateAndPropagateCurrentStrength(ctx, x, y, z);
    }
  }

  private updateAndPropagateCurrentStrength(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    this.calculateCurrentChanges(ctx, x, y, z);
  }

  private calculateCurrentChanges(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const currentMetadata = ctx.world.getBlockMetadata(x, y, z);
    let maxPower = 0;

    this.wiresProvidePower = false;
    const isGettingPowered = ctx.power?.isBlockIndirectlyPowered({ x, y, z }) ?? false;
    this.wiresProvidePower = true;

    if (isGettingPowered) {
      maxPower = 15;
    } else {
      for (const direction of HORIZONTAL_BLOCK_DIRECTIONS) {
        const offset = directionOffset(direction);
        const nx = x + offset.x;
        const nz = z + offset.z;
        
        maxPower = this.getMaxCurrentStrength(ctx, nx, y, nz, maxPower);
        
        if (ctx.world.isNormalCube(nx, y, nz) && !ctx.world.isNormalCube(x, y + 1, z)) {
          maxPower = this.getMaxCurrentStrength(ctx, nx, y + 1, nz, maxPower);
        } else if (!ctx.world.isNormalCube(nx, y, nz)) {
          maxPower = this.getMaxCurrentStrength(ctx, nx, y - 1, nz, maxPower);
        }
      }

      if (maxPower > 0) {
        maxPower--;
      }
    }

    if (currentMetadata !== maxPower) {
      ctx.world.setBlockMetadataWithNotify(x, y, z, maxPower);
      
      for (const direction of ALL_BLOCK_DIRECTIONS) {
        const offset = directionOffset(direction);
        ctx.world.notifyNeighborsOfStateChange(x + offset.x, y + offset.y, z + offset.z, BlockIds.RedstoneWire);
      }
    } else {
      ctx.world.markDirty(x, z);
    }
  }

  private getMaxCurrentStrength(ctx: BlockBehaviourContext, x: number, y: number, z: number, currentMax: number): number {
    if (ctx.world.getBlock(x, y, z) !== BlockIds.RedstoneWire) {
      return currentMax;
    }
    const meta = ctx.world.getBlockMetadata(x, y, z);
    return meta > currentMax ? meta : currentMax;
  }

  private notifyBetaNeighbors(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    ctx.world.notifyNeighborsOfStateChange(x, y + 1, z, BlockIds.RedstoneWire);
    ctx.world.notifyNeighborsOfStateChange(x, y - 1, z, BlockIds.RedstoneWire);
    
    for (const direction of HORIZONTAL_BLOCK_DIRECTIONS) {
        const offset = directionOffset(direction);
        const nx = x + offset.x;
        const nz = z + offset.z;
        ctx.world.notifyNeighborsOfStateChange(nx, y, nz, BlockIds.RedstoneWire);
        if (ctx.world.isNormalCube(nx, y, nz)) {
            ctx.world.notifyNeighborsOfStateChange(nx, y + 1, nz, BlockIds.RedstoneWire);
        } else {
            ctx.world.notifyNeighborsOfStateChange(nx, y - 1, nz, BlockIds.RedstoneWire);
        }
    }
  }

  public getWeakPower(ctx: PowerQueryContext): RedstonePower {
    if (!this.wiresProvidePower || ctx.sourceMetadata === 0) return 0 as RedstonePower;

    if (ctx.directionToSource === FaceDirection.TOP) {
      return ctx.sourceMetadata as RedstonePower;
    }

    const { x, y, z } = ctx.sourcePosition;
    const connections = getWireConnections(
      {
        getBlock: (bx, by, bz) => ctx.world.getBlock(bx, by, bz),
        isNormalCube: (bx, by, bz) => ctx.world.isNormalCube(bx, by, bz),
      },
      x, y, z,
      (id) => this.isPowerProvider(id)
    );

    const isN = connections.north !== WireConnection.NONE;
    const isS = connections.south !== WireConnection.NONE;
    const isE = connections.east !== WireConnection.NONE;
    const isW = connections.west !== WireConnection.NONE;

    const noConnections = !isN && !isS && !isE && !isW;

    switch (ctx.directionToSource) {
      case FaceDirection.SOUTH:
        return (noConnections || isN || (!isS && !isE && !isW)) ? ctx.sourceMetadata as RedstonePower : 0 as RedstonePower;
      case FaceDirection.NORTH:
        return (noConnections || isS || (!isN && !isE && !isW)) ? ctx.sourceMetadata as RedstonePower : 0 as RedstonePower;
      case FaceDirection.WEST:
        return (noConnections || isE || (!isW && !isN && !isS)) ? ctx.sourceMetadata as RedstonePower : 0 as RedstonePower;
      case FaceDirection.EAST:
        return (noConnections || isW || (!isE && !isN && !isS)) ? ctx.sourceMetadata as RedstonePower : 0 as RedstonePower;
    }

    return 0 as RedstonePower;
  }

  public getStrongPower(ctx: PowerQueryContext): RedstonePower {
    if (!this.wiresProvidePower) return 0 as RedstonePower;
    return this.getWeakPower(ctx);
  }

  private isPowerProvider(blockId: BlockId): boolean {
    if (blockId === BlockIds.RedstoneWire) return true;
    if (blockId === 0) return false;
    return blockId === BlockIds.RedstoneTorchOn || blockId === BlockIds.RedstoneTorchOff || blockId === BlockIds.Lever || 
           blockId === BlockIds.StoneButton || blockId === BlockIds.StonePressurePlate ||
           blockId === BlockIds.WoodPressurePlate;
  }
}

export function registerRedstoneWireBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.RedstoneWire, new RedstoneWireBehaviour());
}
