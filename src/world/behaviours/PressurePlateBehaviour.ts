import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';
import type { PowerQueryContext, RedstonePower } from '../redstone/RedstonePower';
import { FaceDirection } from '../../blocks/BlockFace';
import { LivingEntity } from '../../entities/living/LivingEntity';

export class PressurePlateBehaviour implements BlockBehaviour {
  public readonly canProvidePower = true;

  public constructor(private readonly isWood: boolean) {}

  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    return ctx.world.isNormalCube(x, y - 1, z);
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    if (!this.canPlaceBlockAt(ctx, x, y, z)) {
      const id = this.isWood ? BlockIds.WoodPressurePlate : BlockIds.StonePressurePlate;
      ctx.world.dropBlockAsItem(x, y, z, id);
      ctx.world.setBlockWithNotify(x, y, z, BlockIds.Air);
    }
  }

  public onEntityCollidedWithBlock(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    if (meta === 0) {
      this.setStateIfMobInteractsWithPlate(ctx, x, y, z);
    }
  }

  public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    if (meta !== 0) {
      this.setStateIfMobInteractsWithPlate(ctx, x, y, z);
    }
  }

  private setStateIfMobInteractsWithPlate(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const currentMeta = ctx.world.getBlockMetadata(x, y, z);
    const isPressed = currentMeta === 1;
    let wantsPressed = false;

    if (ctx.entities) {
        const padding = 0.125;
        const box = new AABB(x + padding, y, z + padding, x + 1 - padding, y + 0.25, z + 1 - padding);
        
        let entities;
        if (this.isWood) {
            // Everything
            entities = ctx.entities.getEntitiesInAABB(box);
        } else {
            // Mobs (Living Entities)
            entities = ctx.entities.getEntitiesInAABB(box, (e): e is LivingEntity => e instanceof LivingEntity);
        }
        
        if (entities.length > 0) {
            wantsPressed = true;
        }
    }

    if (wantsPressed && !isPressed) {
      ctx.world.setBlockMetadataWithNotify(x, y, z, 1);
      this.notifyNeighbors(ctx, x, y, z);
      ctx.world.markDirty(x, z);
      // ctx.world.playSound(...)
    }

    if (!wantsPressed && isPressed) {
      ctx.world.setBlockMetadataWithNotify(x, y, z, 0);
      this.notifyNeighbors(ctx, x, y, z);
      ctx.world.markDirty(x, z);
      // ctx.world.playSound(...)
    }

    if (wantsPressed) {
        const id = this.isWood ? BlockIds.WoodPressurePlate : BlockIds.StonePressurePlate;
        ctx.world.scheduleBlockTick(x, y, z, id, 20);
    }
  }

  private notifyNeighbors(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const id = this.isWood ? BlockIds.WoodPressurePlate : BlockIds.StonePressurePlate;
    ctx.world.notifyNeighborsOfStateChange(x, y, z, id);
    ctx.world.notifyNeighborsOfStateChange(x, y - 1, z, id);
  }

  public getWeakPower(ctx: PowerQueryContext): RedstonePower {
    return (ctx.sourceMetadata === 1) ? 15 as RedstonePower : 0 as RedstonePower;
  }

  public getStrongPower(ctx: PowerQueryContext): RedstonePower {
    if (ctx.sourceMetadata !== 1) return 0 as RedstonePower;
    // Strong power to block below.
    return (ctx.directionToSource === FaceDirection.TOP) ? 15 as RedstonePower : 0 as RedstonePower;
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const height = meta === 1 ? 1/32 : 2/32; // Beta 1.7.3 used 0.03125F (1/32) when pressed
    const padding = 1/16;

    if (type === 'collision') {
      return [];
    }

    return [new AABB(x + padding, y, z + padding, x + 1 - padding, y + height, z + 1 - padding)];
  }
}

export function registerPressurePlateBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.WoodPressurePlate, new PressurePlateBehaviour(true));
  registry.register(BlockIds.StonePressurePlate, new PressurePlateBehaviour(false));
}
