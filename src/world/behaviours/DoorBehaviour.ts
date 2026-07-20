import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext } from '../BlockBehaviour';
import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';

export class DoorBehaviour implements BlockBehaviour {
  public constructor(private readonly isIron: boolean) {}

  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    if (y >= 127) return false;
    
    // Check if block below is solid
    const below = ctx.world.getBlock(x, y - 1, z);
    const defBelow = ctx.world['blockRegistry']?.getById(below);
    const solidBelow = defBelow ? defBelow.solid && defBelow.renderType === 'opaque' : false;
    if (!solidBelow) return false;

    // Check if the space for the upper half is replaceable
    const upperId = ctx.world.getBlock(x, y + 1, z);
    const upperDef = ctx.world['blockRegistry']?.getById(upperId);
    const upperReplaceable = upperDef ? upperDef.replaceable : true; // air is replaceable
    
    return upperReplaceable;
  }

  public onPlaced(_ctx: BlockBehaviourContext, _x: number, _y: number, _z: number, _blockId: BlockId): void {
    // Placement is handled atomically and directly inside InteractionController.ts
    // to prevent circular placement or missing player context.
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number, _sourceX: number, _sourceY: number, _sourceZ: number): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const blockDoor = this.isIron ? BlockIds.IronDoor : BlockIds.WoodDoor;

    if ((meta & 8) !== 0) {
      // Upper half
      if (ctx.world.getBlock(x, y - 1, z) !== blockDoor) {
        ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
      }
    } else {
      // Lower half
      let destroy = false;
      if (ctx.world.getBlock(x, y + 1, z) !== blockDoor) {
        ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
        destroy = true;
      } else {
        const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x, y - 1, z));
        if (!def || !def.solid || def.renderType !== 'opaque') {
          ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
          destroy = true;
        }
      }
      
      // If destroyed by neighbor change, pop off as item
      if (destroy) {
        ctx.events?.enqueueBlockDrop(ctx.gameTick, 0, blockDoor, meta, x, y, z, 'placement_failed');
      }
    }
  }

  public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    if (this.isIron) return true; // Iron doors don't open by hand

    let meta = ctx.world.getBlockMetadata(x, y, z);
    const blockDoor = BlockIds.WoodDoor;

    if ((meta & 8) !== 0) {
      if (ctx.world.getBlock(x, y - 1, z) === blockDoor) {
        return this.onInteract(ctx, x, y - 1, z);
      }
      return true;
    }

    // Toggle open state
    ctx.world.setBlockMetadata(x, y, z, meta ^ 4, { affectsMesh: true, affectsLight: true });
    return true;
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, _type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    let meta = ctx.world.getBlockMetadata(x, y, z);
    if ((meta & 8) !== 0) {
      meta = ctx.world.getBlockMetadata(x, y - 1, z);
    }
    
    // getState equivalent
    const state = (meta & 4) === 0 ? (meta - 1) & 3 : meta & 3;
    const thickness = 3 / 16;
    
    let minX = 0, minZ = 0, maxX = 1, maxZ = 1;

    if (state === 0) { minX = 0; maxX = 1; minZ = 0; maxZ = thickness; }
    else if (state === 1) { minX = 1 - thickness; maxX = 1; minZ = 0; maxZ = 1; }
    else if (state === 2) { minX = 0; maxX = 1; minZ = 1 - thickness; maxZ = 1; }
    else if (state === 3) { minX = 0; maxX = thickness; minZ = 0; maxZ = 1; }

    return [new AABB(x + minX, y, z + minZ, x + maxX, y + 1, z + maxZ)];
  }
}

export function registerDoorBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.WoodDoor, new DoorBehaviour(false));
  registry.register(BlockIds.IronDoor, new DoorBehaviour(true));
}
