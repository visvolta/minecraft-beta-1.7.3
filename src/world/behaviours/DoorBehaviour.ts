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
    
    // The target block itself is already checked by InteractionController before calling this
    return upperReplaceable;
  }

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number, _blockId: BlockId): void {
    const player = (ctx as any).player;
    if (!player) return;

    let yaw = Math.atan2(-player.lookDirection.x, -player.lookDirection.z);
    while (yaw < 0) yaw += Math.PI * 2;
    while (yaw >= Math.PI * 2) yaw -= Math.PI * 2;

    let meta = 0;
    if (yaw >= Math.PI * 0.25 && yaw < Math.PI * 0.75) meta = 0; // East (+X) -> var9 = 0
    else if (yaw >= Math.PI * 0.75 && yaw < Math.PI * 1.25) meta = 1; // South (+Z) -> var9 = 1
    else if (yaw >= Math.PI * 1.25 && yaw < Math.PI * 1.75) meta = 2; // West (-X) -> var9 = 2
    else meta = 3; // North (-Z) -> var9 = 3

    // Check for double doors (hinge mirroring trick from Beta)
    let dx = 0, dz = 0;
    if (meta === 0) dz = 1;
    if (meta === 1) dx = -1;
    if (meta === 2) dz = -1;
    if (meta === 3) dx = 1;

    const blockDoor = this.isIron ? BlockIds.IronDoor : BlockIds.WoodDoor;
    
    const isSolid = (vx: number, vy: number, vz: number) => {
      const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(vx, vy, vz));
      return def ? def.solid && def.renderType === 'opaque' : false;
    };

    const solidLeft = (isSolid(x - dx, y, z - dz) ? 1 : 0) + (isSolid(x - dx, y + 1, z - dz) ? 1 : 0);
    const solidRight = (isSolid(x + dx, y, z + dz) ? 1 : 0) + (isSolid(x + dx, y + 1, z + dz) ? 1 : 0);
    const hasDoorLeft = ctx.world.getBlock(x - dx, y, z - dz) === blockDoor || ctx.world.getBlock(x - dx, y + 1, z - dz) === blockDoor;
    const hasDoorRight = ctx.world.getBlock(x + dx, y, z + dz) === blockDoor || ctx.world.getBlock(x + dx, y + 1, z + dz) === blockDoor;

    let mirror = false;
    if (hasDoorLeft && !hasDoorRight) mirror = true;
    else if (solidRight > solidLeft) mirror = true;

    if (mirror) {
      meta = (meta - 1 & 3) + 4; // rotate and open
    }

    ctx.world.setBlockMetadata(x, y, z, meta, { affectsMesh: true, affectsLight: true });
    // Place upper half
    ctx.world.setBlock(x, y + 1, z, blockDoor, { metadata: meta + 8, reason: 'world', notifyNeighbours: true, updateLighting: true });
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
    // Wait, does the upper block need the open bit too in Beta? No, upper block is always just metadata+8
    // Actually, in Beta 1.7.3, the top block receives metadata+8 based on the original placement, but when toggling, the top block doesn't update its open bit. Wait, let me check.
    // In Beta 1.7.3 BlockDoor.java: `var1.setBlockMetadataWithNotify(var2, var3, var4, var6 ^ 4);` -> It toggles lower, but does it toggle upper?
    // Let's toggle the upper half just to be safe if the renderer relies on it, but Beta renderer only uses `getState(var1.getBlockMetadata(x,y,z))` which queries the lower block if the current is upper!
    // Yes! Beta RenderBlocks queries the lower block for state.
    // We will do the same in ChunkMesher.
    return true;
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, _type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    // Return door bounding box
    let meta = ctx.world.getBlockMetadata(x, y, z);
    if ((meta & 8) !== 0) {
      meta = ctx.world.getBlockMetadata(x, y - 1, z);
    }
    
    // getState equivalent
    const state = (meta & 4) === 0 ? (meta - 1) & 3 : meta & 3;
    const thickness = 3 / 16;
    
    let minX = 0, minZ = 0, maxX = 1, maxZ = 1;

    if (state === 0) { minX = 0; maxX = 1; minZ = 0; maxZ = thickness; }
    if (state === 1) { minX = 1 - thickness; maxX = 1; minZ = 0; maxZ = 1; }
    if (state === 2) { minX = 0; maxX = 1; minZ = 1 - thickness; maxZ = 1; }
    if (state === 3) { minX = 0; maxX = thickness; minZ = 0; maxZ = 1; }

    return [new AABB(x + minX, y, z + minZ, x + maxX, y + 1, z + maxZ)];
  }
}

export function registerDoorBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.WoodDoor, new DoorBehaviour(false));
  registry.register(BlockIds.IronDoor, new DoorBehaviour(true));
}
