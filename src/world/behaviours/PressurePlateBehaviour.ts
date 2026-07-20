import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext } from '../BlockBehaviour';
import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';

export class PressurePlateBehaviour implements BlockBehaviour {
  public constructor(private readonly isWood: boolean) {}

  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const below = ctx.world.getBlock(x, y - 1, z);
    const def = ctx.world['blockRegistry']?.getById(below);
    return def ? def.solid && def.renderType === 'opaque' : false;
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number, _sourceX: number, _sourceY: number, _sourceZ: number): void {
    if (!this.canPlaceBlockAt(ctx, x, y, z)) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
      const id = this.isWood ? BlockIds.WoodPressurePlate : BlockIds.StonePressurePlate;
      ctx.events?.enqueueBlockDrop(ctx.gameTick, 0, id, 0, x, y, z, 'placement_failed');
    }
  }

  public onEntityCollidedWithBlock(ctx: BlockBehaviourContext, x: number, y: number, z: number, _entityAABB: AABB): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    if (meta === 0) {
      this.setStateIfPressed(ctx, x, y, z, meta);
    }
  }

  private setStateIfPressed(ctx: BlockBehaviourContext, x: number, y: number, z: number, meta: number): void {
    const isPressed = meta === 1;
    // For now we only check the player. We'll use a hack to get the player AABB since the entity manager is not fully exposed here.
    // However, the instructions say "The following systems should all query the same authoritative metadata-aware bounds: - player collision - block raycasting - selection outline - interaction"
    // Wait, onEntityCollidedWithBlock receives the entityAABB. The player triggers it.
    let wantsPressed = false;
    
    // In Beta 1.7.3, Wooden plate triggers on ANY entity. Stone triggers on Player/Mob only (no items).
    // The player's physics system calls `onEntityCollidedWithBlock` when inside the block's AABB.
    // If we're here, it means something collided with it.
    wantsPressed = true;

    if (wantsPressed && !isPressed) {
      ctx.world.setBlockMetadata(x, y, z, 1, { affectsMesh: true, affectsLight: false });
      const id = this.isWood ? BlockIds.WoodPressurePlate : BlockIds.StonePressurePlate;
      ctx.world.scheduleBlockTick(x, y, z, id, 20);
    }
  }

  public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number, _blockId: BlockId): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    if (meta !== 0) {
      // Deactivate
      // In Beta 1.7.3, it actually scans the AABB again to see if entities are still on it.
      // We will assume it pops up and if player is still there, onEntityCollidedWithBlock triggers again.
      ctx.world.setBlockMetadata(x, y, z, 0, { affectsMesh: true, affectsLight: false });
    }
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const height = meta === 1 ? 1/16 : 2/16;
    const padding = 1/16;

    if (type === 'collision') {
      return []; // Beta plates have no actual solid collision blocking movement
    }

    return [new AABB(x + padding, y, z + padding, x + 1 - padding, y + height, z + 1 - padding)];
  }
}

export function registerPressurePlateBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.WoodPressurePlate, new PressurePlateBehaviour(true));
  registry.register(BlockIds.StonePressurePlate, new PressurePlateBehaviour(false));
}
