import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext } from '../BlockBehaviour';
import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';
import type { SignManager } from '../../sign/SignManager';

export class SignBehaviour implements BlockBehaviour {
  public constructor(private readonly signManager: SignManager) {}

  public canPlaceBlockAt(_ctx: BlockBehaviourContext, _x: number, _y: number, _z: number): boolean {
    return true; // Simple check for now, can refine if needed based on attached face
  }

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void {
    const player = (ctx as any).player;
    if (!player) return;

    let meta = 0;
    if (blockId === BlockIds.SignPost) {
      let yaw = Math.atan2(-player.lookDirection.x, -player.lookDirection.z);
      while (yaw < 0) yaw += Math.PI * 2;
      while (yaw >= Math.PI * 2) yaw -= Math.PI * 2;
      meta = Math.floor((yaw / (Math.PI * 2)) * 16 + 0.5) & 15;
    } else {
      let yaw = Math.atan2(-player.lookDirection.x, -player.lookDirection.z);
      while (yaw < 0) yaw += Math.PI * 2;
      while (yaw >= Math.PI * 2) yaw -= Math.PI * 2;
      if (yaw >= Math.PI * 0.25 && yaw < Math.PI * 0.75) meta = 5; // +X (East)
      else if (yaw >= Math.PI * 0.75 && yaw < Math.PI * 1.25) meta = 2; // -Z (North)
      else if (yaw >= Math.PI * 1.25 && yaw < Math.PI * 1.75) meta = 4; // -X (West)
      else meta = 3; // +Z (South)

      // Beta Wall Sign Metadata
      // 2: Attached to South (+Z), faces North (-Z)
      // 3: Attached to North (-Z), faces South (+Z)
      // 4: Attached to East (+X), faces West (-X)
      // 5: Attached to West (-X), faces East (+X)
    }

    ctx.world.setBlockMetadata(x, y, z, meta, { affectsMesh: true, affectsLight: false });
    this.signManager.getOrCreate(x, y, z);
    
    // UI trigger happens handled by InteractionController opening the GUI
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number, _sourceX: number, _sourceY: number, _sourceZ: number): void {
    const blockId = ctx.world.getBlock(x, y, z);
    const meta = ctx.world.getBlockMetadata(x, y, z);

    let drop = false;
    if (blockId === BlockIds.SignPost) {
      const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x, y - 1, z));
      if (!def || !def.solid) drop = true;
    } else {
      let dx = 0, dz = 0;
      if (meta === 2) dz = 1;
      if (meta === 3) dz = -1;
      if (meta === 4) dx = 1;
      if (meta === 5) dx = -1;
      const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y, z + dz));
      if (!def || !def.solid) drop = true;
    }

    if (drop) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
      this.signManager.remove(x, y, z);
      ctx.events?.enqueueBlockDrop(ctx.gameTick, 0, blockId, 0, x, y, z, 'placement_failed');
    }
  }

  public onRemoved(_ctx: BlockBehaviourContext, x: number, y: number, z: number, _oldBlockId: BlockId): void {
    this.signManager.remove(x, y, z);
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    if (type === 'collision') return [];

    const blockId = ctx.world.getBlock(x, y, z);
    if (blockId === BlockIds.SignPost) {
      return [new AABB(x + 0.25, y, z + 0.25, x + 0.75, y + 1, z + 0.75)];
    }

    const meta = ctx.world.getBlockMetadata(x, y, z);
    const d = 2/16;
    if (meta === 2) return [new AABB(x, y + 0.25, z + 1 - d, x + 1, y + 0.75, z + 1)];
    if (meta === 3) return [new AABB(x, y + 0.25, z, x + 1, y + 0.75, z + d)];
    if (meta === 4) return [new AABB(x + 1 - d, y + 0.25, z, x + 1, y + 0.75, z + 1)];
    if (meta === 5) return [new AABB(x, y + 0.25, z, x + d, y + 0.75, z + 1)];

    return [new AABB(x, y, z, x + 1, y + 1, z + 1)];
  }
}

export function registerSignBehaviour(registry: BlockBehaviourRegistry, signManager: SignManager): void {
  const b = new SignBehaviour(signManager);
  registry.register(BlockIds.SignPost, b);
  registry.register(BlockIds.WallSign, b);
}
