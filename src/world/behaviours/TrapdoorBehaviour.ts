import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext } from '../BlockBehaviour';
import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';

export class TrapdoorBehaviour implements BlockBehaviour {
  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    // In Beta, trapdoors attach to the block next to them based on face clicked.
    // InteractionController.placeBlock gives `hit.face` which is the normal of the block clicked.
    // Wait, `canPlaceBlockAt` doesn't have the face.
    // But `canPlaceBlockAt` in Beta checks if ANY horizontal neighbor is solid.
    const nx = ctx.world.getBlock(x - 1, y, z);
    const px = ctx.world.getBlock(x + 1, y, z);
    const nz = ctx.world.getBlock(x, y, z - 1);
    const pz = ctx.world.getBlock(x, y, z + 1);

    const isSolid = (id: BlockId) => {
      const def = ctx.world['blockRegistry']?.getById(id);
      return def ? def.solid && def.renderType === 'opaque' : false;
    };

    return isSolid(nx) || isSolid(px) || isSolid(nz) || isSolid(pz);
  }

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number, _blockId: BlockId): void {
    const player = (ctx as any).player;
    if (!player) return;

    // Beta Trapdoor meta:
    // 0: attached to South (+Z), hinges on South. Wait, Beta metadata for trapdoor:
    // 0: West (-X)
    // 1: East (+X)
    // 2: North (-Z)
    // 3: South (+Z)
    // Bit 4 (0x4): Open

    let meta = 0;
    // We should ideally use the block face clicked. But `onPlaced` only gives coordinates.
    // The player physics / yaw can approximate it, but Trapdoor placement is specifically attached to the face.
    // I'll approximate with player yaw like Chest/Door, checking validity.
    
    let yaw = Math.atan2(-player.lookDirection.x, -player.lookDirection.z);
    while (yaw < 0) yaw += Math.PI * 2;
    while (yaw >= Math.PI * 2) yaw -= Math.PI * 2;

    if (yaw >= Math.PI * 0.25 && yaw < Math.PI * 0.75) meta = 1; // +X
    else if (yaw >= Math.PI * 0.75 && yaw < Math.PI * 1.25) meta = 2; // -Z
    else if (yaw >= Math.PI * 1.25 && yaw < Math.PI * 1.75) meta = 0; // -X
    else meta = 3; // +Z

    // Validate the chosen face is solid. If not, pick the first solid face.
    const isSolid = (dx: number, dz: number) => {
      const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y, z + dz));
      return def ? def.solid && def.renderType === 'opaque' : false;
    };

    if (meta === 0 && !isSolid(-1, 0)) meta = -1;
    if (meta === 1 && !isSolid(1, 0)) meta = -1;
    if (meta === 2 && !isSolid(0, -1)) meta = -1;
    if (meta === 3 && !isSolid(0, 1)) meta = -1;

    if (meta === -1) {
      if (isSolid(0, 1)) meta = 3;
      else if (isSolid(0, -1)) meta = 2;
      else if (isSolid(1, 0)) meta = 1;
      else if (isSolid(-1, 0)) meta = 0;
    }

    ctx.world.setBlockMetadata(x, y, z, meta, { affectsMesh: true, affectsLight: true });
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number, _sourceX: number, _sourceY: number, _sourceZ: number): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const attachMeta = meta & 3;
    let dx = 0, dz = 0;
    if (attachMeta === 0) dx = -1;
    if (attachMeta === 1) dx = 1;
    if (attachMeta === 2) dz = -1;
    if (attachMeta === 3) dz = 1;

    const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y, z + dz));
    if (!def || !def.solid || def.renderType !== 'opaque') {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
      ctx.events?.enqueueBlockDrop(ctx.gameTick, 0, BlockIds.Trapdoor, meta, x, y, z, 'placement_failed');
    }
  }

  public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    ctx.world.setBlockMetadata(x, y, z, meta ^ 4, { affectsMesh: true, affectsLight: true });
    return true;
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, _type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const isOpened = (meta & 4) !== 0;
    const attachMeta = meta & 3;
    const thickness = 3 / 16;

    if (isOpened) {
      if (attachMeta === 0) return [new AABB(x, y, z, x + thickness, y + 1, z + 1)]; // West
      if (attachMeta === 1) return [new AABB(x + 1 - thickness, y, z, x + 1, y + 1, z + 1)]; // East
      if (attachMeta === 2) return [new AABB(x, y, z, x + 1, y + 1, z + thickness)]; // North
      if (attachMeta === 3) return [new AABB(x, y, z + 1 - thickness, x + 1, y + 1, z + 1)]; // South
    }

    return [new AABB(x, y, z, x + 1, y + thickness, z + 1)];
  }
}

export function registerTrapdoorBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Trapdoor, new TrapdoorBehaviour());
}
