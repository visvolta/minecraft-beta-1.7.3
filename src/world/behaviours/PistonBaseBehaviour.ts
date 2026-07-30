import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { NeighbourUpdateEvent } from '../updates/BlockMutation';
import { AABB } from '../../physics/AABB';
import type { Entity } from '../../entities/core/Entity';

/** Piston direction metadata (bits 0-2): 0=down, 1=up, 2=north(-Z), 3=south(+Z), 4=west(-X), 5=east(+X). */
const DIRECTION_OFFSETS: readonly { readonly x: number; readonly y: number; readonly z: number }[] = [
  { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 },
  { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
];

/** Beta push limit. */
const PISTON_PUSH_LIMIT = 12;

/** Extended bit in metadata. */
const EXTENDED_BIT = 8;

/** Immovable blocks (push fails). */
const IMMOVABLE = new Set<number>([
  BlockIds.Bedrock, BlockIds.Obsidian, BlockIds.Spawner, BlockIds.Chest,
  BlockIds.Furnace, BlockIds.FurnaceBurning, BlockIds.Dispenser, BlockIds.Jukebox,
  BlockIds.SignPost, BlockIds.WallSign, BlockIds.PistonBase, BlockIds.PistonStickyBase,
  BlockIds.PistonExtension,
]);

/** Fragile blocks (destroyed when pushed, in Beta getMobilityFlag == 1). */
const FRAGILE = new Set<number>([
  BlockIds.Torch, BlockIds.RedstoneWire, BlockIds.RedstoneTorchOff, BlockIds.RedstoneTorchOn,
  BlockIds.Lever, BlockIds.StoneButton, BlockIds.StonePressurePlate, BlockIds.WoodPressurePlate,
  BlockIds.Rail, BlockIds.PoweredRail, BlockIds.DetectorRail,
  BlockIds.WoodDoor, BlockIds.IronDoor, BlockIds.Ladder,
  BlockIds.Bed, BlockIds.Sapling, BlockIds.Crops,
  BlockIds.Dandelion, BlockIds.Rose, BlockIds.BrownMushroom, BlockIds.RedMushroom,
  BlockIds.Reed, BlockIds.Cactus, BlockIds.Cake,
  BlockIds.RedstoneRepeaterIdle, BlockIds.RedstoneRepeaterActive,
  BlockIds.Fire, BlockIds.RedstoneOre,
  BlockIds.Trapdoor, BlockIds.SignPost,
]);

/**
 * Beta `BlockPistonBase`: extends on rising-edge power, retracts on falling-edge.
 * Pushes up to 12 blocks. Sticky variant pulls one block on retraction.
 *
 * State: metadata bit 3 (value 8) = extended flag. Bits 0-2 = facing direction.
 * Piston head (block 34) is placed at the head position on extend.
 *
 * This implementation performs instant block movement (Beta does the block
 * movement synchronously in `tryExtend`; the `BlockPistonMoving` tile entity
 * handles only the visual interpolation, which is deferred).
 */
export class PistonBaseBehaviour implements BlockBehaviour {
  public readonly requiresNeighbourReconciliation = true;

  public constructor(private readonly isSticky: boolean) {}

  public neighborChanged(
    ctx: BlockBehaviourContext, x: number, y: number, z: number,
    _sx: number, _sy: number, _sz: number, _event?: NeighbourUpdateEvent,
  ): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const direction = meta & 7;
    const isExtended = (meta & EXTENDED_BIT) !== 0;
    const powered = (ctx.power?.isBlockIndirectlyPowered({ x, y, z }) ?? false);

    if (powered && !isExtended) {
      this.tryExtend(ctx, x, y, z, direction);
    } else if (!powered && isExtended) {
      this.retract(ctx, x, y, z, direction);
    }
  }

  /**
   * Beta `tryExtend`: walk the push chain, move blocks, place piston head.
   */
  private tryExtend(ctx: BlockBehaviourContext, x: number, y: number, z: number, direction: number): void {
    const off = DIRECTION_OFFSETS[direction]!;
    const dx = off.x, dy = off.y, dz = off.z;

    // Collect the push chain.
    const chain: { x: number; y: number; z: number; id: number; meta: number }[] = [];
    let cx = x + dx, cy = y + dy, cz = z + dz;

    while (true) {
      const blockId = ctx.world.getBlock(cx, cy, cz);

      // Air → chain ends.
      if (blockId === BlockIds.Air) break;

      // Immovable → push fails.
      if (IMMOVABLE.has(blockId)) return;

      // Fragile → destroy (drop) and stop the chain here (Beta destroys it).
      if (FRAGILE.has(blockId)) {
        ctx.world.dropBlockAsItem(cx, cy, cz, blockId);
        break;
      }

      // Pushable → add to chain.
      chain.push({ x: cx, y: cy, z: cz, id: blockId, meta: ctx.world.getBlockMetadata(cx, cy, cz) });

      if (chain.length > PISTON_PUSH_LIMIT) return; // too many blocks.

      cx += dx; cy += dy; cz += dz;
    }

    // Move blocks from far end to near end (avoid overwriting).
    for (let i = chain.length - 1; i >= 0; i--) {
      const block = chain[i]!;
      ctx.world.setBlock(block.x + dx, block.y + dy, block.z + dz, block.id, { metadata: block.meta });
      ctx.world.setBlock(block.x, block.y, block.z, BlockIds.Air);
    }

    // Beta: push entities intersecting the moved blocks.
    this.pushEntities(ctx, chain, dx, dy, dz);

    // Place piston head at the head position.
    ctx.world.setBlock(x + dx, y + dy, z + dz, BlockIds.PistonExtension, { metadata: direction });

    // Set extended flag.
    ctx.world.setBlockMetadataWithNotify(x, y, z, direction | EXTENDED_BIT);
  }

  /**
   * Beta: entities intersecting moved blocks are shoved along the push axis.
   * Entities blocked by a solid block are not moved (no suffocation damage
   * yet — Beta applies it via the moving-piston tile entity).
   */
  private pushEntities(ctx: BlockBehaviourContext, chain: { x: number; y: number; z: number }[], dx: number, dy: number, dz: number): void {
    if (ctx.entities === undefined) return;
    const pushed = new Set<Entity>();
    for (const block of chain) {
      const box = new AABB(block.x, block.y, block.z, block.x + 1, block.y + 1, block.z + 1);
      const entities = ctx.entities.getEntitiesInAABB(box, (e): e is Entity => !pushed.has(e));
      for (const entity of entities) {
        pushed.add(entity);
        const nx = entity.position.x + dx;
        const ny = entity.position.y + dy;
        const nz = entity.position.z + dz;
        // Only move if the destination is air (prevents clipping into walls).
        const destBlock = ctx.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (destBlock === BlockIds.Air) {
          entity.setPosition(nx, ny, nz);
          entity.velocity.x += dx * 0.6;
          entity.velocity.y += dy * 0.6;
          entity.velocity.z += dz * 0.6;
        }
      }
    }
  }

  /**
   * Beta retract: remove piston head, pull block for sticky.
   */
  private retract(ctx: BlockBehaviourContext, x: number, y: number, z: number, direction: number): void {
    const off = DIRECTION_OFFSETS[direction]!;
    const hx = x + off.x, hy = y + off.y, hz = z + off.z;

    // Remove piston head.
    ctx.world.setBlock(hx, hy, hz, BlockIds.Air, { notifyNeighbours: false });

    if (this.isSticky) {
      // Check block at head + direction (the first pushed block).
      const pullX = hx + off.x, pullY = hy + off.y, pullZ = hz + off.z;
      const blockId = ctx.world.getBlock(pullX, pullY, pullZ);

      // Only pull if the block is pushable (not air, not immovable, not fragile).
      if (blockId !== BlockIds.Air && !IMMOVABLE.has(blockId) && !FRAGILE.has(blockId)) {
        const pullMeta = ctx.world.getBlockMetadata(pullX, pullY, pullZ);
        ctx.world.setBlock(hx, hy, hz, blockId, { metadata: pullMeta });
        ctx.world.setBlock(pullX, pullY, pullZ, BlockIds.Air);
      }
    }

    // Clear extended flag.
    ctx.world.setBlockMetadataWithNotify(x, y, z, direction);
  }
}

/** Registers both piston base (33) and sticky piston base (29). */
export function registerPistonBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.PistonBase, new PistonBaseBehaviour(false));
  registry.register(BlockIds.PistonStickyBase, new PistonBaseBehaviour(true));
}
