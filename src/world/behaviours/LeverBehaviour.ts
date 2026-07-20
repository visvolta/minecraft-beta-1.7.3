import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext } from '../BlockBehaviour';
import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';

export class LeverBehaviour implements BlockBehaviour {
  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const isSolid = (dx: number, dy: number, dz: number) => {
      const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y + dy, z + dz));
      return def ? def.solid && def.renderType === 'opaque' : false;
    };
    return isSolid(-1, 0, 0) || isSolid(1, 0, 0) || isSolid(0, 0, -1) || isSolid(0, 0, 1) || isSolid(0, -1, 0);
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
    // For walls, we check where player is pointing? No, Beta lever placement checks face clicked.
    // We don't have face clicked. We approximate.
    const isSolid = (dx: number, dy: number, dz: number) => {
      const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y + dy, z + dz));
      return def ? def.solid && def.renderType === 'opaque' : false;
    };

    if (isSolid(0, -1, 0)) {
      meta = 5; // Ground
      if (yaw < Math.PI * 0.25 || yaw >= Math.PI * 1.75 || (yaw >= Math.PI * 0.75 && yaw < Math.PI * 1.25)) {
        meta = 5; // North/South
      } else {
        meta = 6; // East/West
      }
    } else {
      if (yaw >= Math.PI * 0.25 && yaw < Math.PI * 0.75) meta = 2; // -X
      else if (yaw >= Math.PI * 0.75 && yaw < Math.PI * 1.25) meta = 4; // -Z
      else if (yaw >= Math.PI * 1.25 && yaw < Math.PI * 1.75) meta = 1; // +X
      else meta = 3; // +Z

      if (meta === 1 && !isSolid(-1, 0, 0)) meta = 0;
      if (meta === 2 && !isSolid(1, 0, 0)) meta = 0;
      if (meta === 3 && !isSolid(0, 0, -1)) meta = 0;
      if (meta === 4 && !isSolid(0, 0, 1)) meta = 0;

      if (meta === 0) {
        if (isSolid(-1, 0, 0)) meta = 1;
        else if (isSolid(1, 0, 0)) meta = 2;
        else if (isSolid(0, 0, -1)) meta = 3;
        else if (isSolid(0, 0, 1)) meta = 4;
      }
    }

    ctx.world.setBlockMetadata(x, y, z, meta, { affectsMesh: true, affectsLight: false });
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number, _sourceX: number, _sourceY: number, _sourceZ: number): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const attachMeta = meta & 7;
    let dx = 0, dy = 0, dz = 0;
    if (attachMeta === 1) dx = -1;
    if (attachMeta === 2) dx = 1;
    if (attachMeta === 3) dz = -1;
    if (attachMeta === 4) dz = 1;
    if (attachMeta === 5 || attachMeta === 6) dy = -1;

    const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y + dy, z + dz));
    if (!def || !def.solid || def.renderType !== 'opaque') {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
      ctx.events?.enqueueBlockDrop(ctx.gameTick, 0, BlockIds.Lever, meta, x, y, z, 'placement_failed');
    }
  }

  public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    ctx.world.setBlockMetadata(x, y, z, meta ^ 8, { affectsMesh: true, affectsLight: false });
    return true;
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    if (type === 'collision') return [];

    const meta = ctx.world.getBlockMetadata(x, y, z);
    const dir = meta & 7;

    const d = 3/16; // base thickness
    const w = 4/16; // base width
    const h = 6/16; // base height
    
    // Bounds for base and handle simplified into one selection box matching beta
    let minX = 0.5 - w/2;
    let maxX = 0.5 + w/2;
    let minY = 0.5 - h/2;
    let maxY = 0.5 + h/2;
    let minZ = 0.5 - w/2;
    let maxZ = 0.5 + w/2;

    if (dir === 1) { minX = 0; maxX = d; minZ = 0.5 - w/2; maxZ = 0.5 + w/2; }
    else if (dir === 2) { minX = 1 - d; maxX = 1; minZ = 0.5 - w/2; maxZ = 0.5 + w/2; }
    else if (dir === 3) { minZ = 0; maxZ = d; minX = 0.5 - w/2; maxX = 0.5 + w/2; }
    else if (dir === 4) { minZ = 1 - d; maxZ = 1; minX = 0.5 - w/2; maxX = 0.5 + w/2; }
    else if (dir === 5 || dir === 6) {
      minY = 0; maxY = d;
      minX = 0.5 - w/2; maxX = 0.5 + w/2;
      minZ = 0.5 - w/2; maxZ = 0.5 + w/2;
    }

    return [new AABB(x + minX, y + minY, z + minZ, x + maxX, y + maxY, z + maxZ)];
  }
}

export function registerLeverBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Lever, new LeverBehaviour());
}
