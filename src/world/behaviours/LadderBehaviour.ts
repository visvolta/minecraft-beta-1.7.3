import { BlockIds, type BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext } from '../BlockBehaviour';
import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { AABB } from '../../physics/AABB';

export class LadderBehaviour implements BlockBehaviour {
  public readonly isClimbable = true;
  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const isSolid = (dx: number, dz: number) => {
      const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y, z + dz));
      return def ? def.solid && def.renderType === 'opaque' : false;
    };

    return isSolid(-1, 0) || isSolid(1, 0) || isSolid(0, -1) || isSolid(0, 1);
  }

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number, _blockId: BlockId): void {
    const player = (ctx as any).player;
    if (!player) return;

    let yaw = Math.atan2(-player.lookDirection.x, -player.lookDirection.z);
    while (yaw < 0) yaw += Math.PI * 2;
    while (yaw >= Math.PI * 2) yaw -= Math.PI * 2;

    let meta = 0;
    if (yaw >= Math.PI * 0.25 && yaw < Math.PI * 0.75) meta = 5; // +X (East) -> wait, Beta Ladder metadata
    else if (yaw >= Math.PI * 0.75 && yaw < Math.PI * 1.25) meta = 2; // -Z (North)
    else if (yaw >= Math.PI * 1.25 && yaw < Math.PI * 1.75) meta = 4; // -X (West)
    else meta = 3; // +Z (South)

    // Beta Ladder Meta:
    // 2: Attached to South (+Z) face -> faces North (-Z)
    // 3: Attached to North (-Z) face -> faces South (+Z)
    // 4: Attached to East (+X) face -> faces West (-X)
    // 5: Attached to West (-X) face -> faces East (+X)

    const isSolid = (dx: number, dz: number) => {
      const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y, z + dz));
      return def ? def.solid && def.renderType === 'opaque' : false;
    };

    // Correct if chosen face is not solid
    if (meta === 2 && !isSolid(0, 1)) meta = 0;
    if (meta === 3 && !isSolid(0, -1)) meta = 0;
    if (meta === 4 && !isSolid(1, 0)) meta = 0;
    if (meta === 5 && !isSolid(-1, 0)) meta = 0;

    if (meta === 0) {
      if (isSolid(0, 1)) meta = 2;
      else if (isSolid(0, -1)) meta = 3;
      else if (isSolid(1, 0)) meta = 4;
      else if (isSolid(-1, 0)) meta = 5;
    }

    ctx.world.setBlockMetadata(x, y, z, meta, { affectsMesh: true, affectsLight: false });
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number, _sourceX: number, _sourceY: number, _sourceZ: number): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    let dx = 0, dz = 0;
    if (meta === 2) dz = 1;
    if (meta === 3) dz = -1;
    if (meta === 4) dx = 1;
    if (meta === 5) dx = -1;

    const def = ctx.world['blockRegistry']?.getById(ctx.world.getBlock(x + dx, y, z + dz));
    if (!def || !def.solid || def.renderType !== 'opaque') {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
      ctx.events?.enqueueBlockDrop(ctx.gameTick, 0, BlockIds.Ladder, meta, x, y, z, 'placement_failed');
    }
  }

  public getBoundingBoxes(ctx: BlockBehaviourContext, x: number, y: number, z: number, _type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const t = 2 / 16; // 1/8 thick (approx, Beta actually uses bounds based on state)

    if (meta === 2) return [new AABB(x, y, z + 1 - t, x + 1, y + 1, z + 1)]; // Attached to South (+Z), so bounding box is at +Z edge
    if (meta === 3) return [new AABB(x, y, z, x + 1, y + 1, z + t)];
    if (meta === 4) return [new AABB(x + 1 - t, y, z, x + 1, y + 1, z + 1)];
    if (meta === 5) return [new AABB(x, y, z, x + t, y + 1, z + 1)];

    return [new AABB(x, y, z, x + 1, y + 1, z + 1)]; // fallback
  }
}

export function registerLadderBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Ladder, new LadderBehaviour());
}
