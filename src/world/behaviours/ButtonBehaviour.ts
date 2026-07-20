import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext } from '../BlockBehaviour';
import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';

export class ButtonBehaviour implements BlockBehaviour {
  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const isSolid = (dx: number, dz: number) => {
      const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y, z + dz));
      return def ? def.solid && def.renderType === 'opaque' : false;
    };
    return isSolid(-1, 0) || isSolid(1, 0) || isSolid(0, -1) || isSolid(0, 1);
  }

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number, _blockId: BlockId): void {
    const metaAlreadySet = ctx.world.getBlockMetadata(x, y, z);
    if (metaAlreadySet !== 0) return;

    const player = (ctx as any).player;
    if (!player) return;

    let yaw = Math.atan2(-player.lookDirection.x, -player.lookDirection.z);
    while (yaw < 0) yaw += Math.PI * 2;
    while (yaw >= Math.PI * 2) yaw -= Math.PI * 2;

    let meta = 0;
    if (yaw >= Math.PI * 0.25 && yaw < Math.PI * 0.75) meta = 2; // -X
    else if (yaw >= Math.PI * 0.75 && yaw < Math.PI * 1.25) meta = 4; // -Z
    else if (yaw >= Math.PI * 1.25 && yaw < Math.PI * 1.75) meta = 1; // +X
    else meta = 3; // +Z

    const isSolid = (dx: number, dz: number) => {
      const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y, z + dz));
      return def ? def.solid && def.renderType === 'opaque' : false;
    };

    if (meta === 1 && !isSolid(-1, 0)) meta = 0;
    if (meta === 2 && !isSolid(1, 0)) meta = 0;
    if (meta === 3 && !isSolid(0, -1)) meta = 0;
    if (meta === 4 && !isSolid(0, 1)) meta = 0;

    if (meta === 0) {
      if (isSolid(-1, 0)) meta = 1;
      else if (isSolid(1, 0)) meta = 2;
      else if (isSolid(0, -1)) meta = 3;
      else if (isSolid(0, 1)) meta = 4;
    }

    ctx.world.setBlockMetadata(x, y, z, meta, { affectsMesh: true, affectsLight: false });
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number, _sourceX: number, _sourceY: number, _sourceZ: number): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const attachMeta = meta & 7;
    let dx = 0, dz = 0;
    if (attachMeta === 1) dx = -1;
    if (attachMeta === 2) dx = 1;
    if (attachMeta === 3) dz = -1;
    if (attachMeta === 4) dz = 1;

    const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y, z + dz));
    if (!def || !def.solid || def.renderType !== 'opaque') {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
      ctx.events?.enqueueBlockDrop(ctx.gameTick, 0, BlockIds.StoneButton, meta, x, y, z, 'placement_failed');
    }
  }

  public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    if ((meta & 8) !== 0) return true; // Already pressed

    ctx.world.setBlockMetadata(x, y, z, meta | 8, { affectsMesh: true, affectsLight: false });
    ctx.world.scheduleBlockTick(x, y, z, BlockIds.StoneButton, 20); // 1 second
    return true;
  }

  public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number, _blockId: BlockId): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    if ((meta & 8) !== 0) {
      ctx.world.setBlockMetadata(x, y, z, meta & ~8, { affectsMesh: true, affectsLight: false });
    }
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    if (type === 'collision') return [];

    const meta = ctx.world.getBlockMetadata(x, y, z);
    const pressed = (meta & 8) !== 0;
    const dir = meta & 7;

    const depth = pressed ? 1/16 : 2/16;
    const w = 6/16;
    const h = 4/16;
    const d = depth;

    // Default centered
    let minX = 0.5 - w/2;
    let maxX = 0.5 + w/2;
    let minY = 0.5 - h/2;
    let maxY = 0.5 + h/2;
    let minZ = 0.5 - w/2;
    let maxZ = 0.5 + w/2;

    if (dir === 1) { // Attached to West, facing East
      minX = 0; maxX = d;
      minZ = 0.5 - w/2; maxZ = 0.5 + w/2;
    } else if (dir === 2) { // Attached to East, facing West
      minX = 1 - d; maxX = 1;
      minZ = 0.5 - w/2; maxZ = 0.5 + w/2;
    } else if (dir === 3) { // Attached to North, facing South
      minX = 0.5 - w/2; maxX = 0.5 + w/2;
      minZ = 0; maxZ = d;
    } else if (dir === 4) { // Attached to South, facing North
      minX = 0.5 - w/2; maxX = 0.5 + w/2;
      minZ = 1 - d; maxZ = 1;
    }

    return [new AABB(x + minX, y + minY, z + minZ, x + maxX, y + maxY, z + maxZ)];
  }
}

export function registerButtonBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.StoneButton, new ButtonBehaviour());
}
