import { BlockIds } from '../../blocks/BlockId';
import type { AABB } from '../../physics/AABB';
import { doorShape, isDoorOpen, isDoorUpper } from '../../blocks/shapes/BlockShapes';
import { toWorldBound } from '../../blocks/shapes/toWorldBounds';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry, BoundingBoxType } from '../BlockBehaviour';

/**
 * Beta 1.7.3 `BlockDoor`.
 *
 * Metadata layout (both halves share it):
 *   bits 0-1  facing, 0 = -X, 1 = -Z, 2 = +X, 3 = +Z
 *   bit  2(4) open
 *   bit  3(8) upper half
 *
 * The single most important rule, and the one the previous implementation got
 * wrong: the *lower* half is the authority. Every operation on the upper half
 * (interaction, redstone, state reads) delegates down to it, and the lower
 * half then mirrors its new metadata up. That is what keeps the two halves in
 * agreement and stops one of them holding stale state.
 */

/** Beta `BlockDoor` metadata bits. */
const OPEN_BIT = 4;
const UPPER_BIT = 8;

export class DoorBehaviour implements BlockBehaviour {
  public constructor(private readonly isIron: boolean) {}

  private get blockId(): number {
    return this.isIron ? BlockIds.IronDoor : BlockIds.WoodDoor;
  }

  /**
   * Doors occupy a thin panel on one edge of the cell, never a full cube.
   * Both halves resolve their shape from the lower half's metadata so the top
   * of an open door is as passable as the bottom.
   */
  public getBoundingBoxes(
    ctx: BlockBehaviourContext,
    x: number,
    y: number,
    z: number,
    _type: BoundingBoxType,
  ): AABB[] | undefined {
    return toWorldBound(doorShape(this.effectiveMetadata(ctx, x, y, z)), x, y, z);
  }

  /**
   * Reads the metadata that governs this cell's appearance and collision.
   * For an upper half that is the lower half's metadata; Beta keeps them in
   * sync, but reading down means a desynced upper half can never win.
   */
  private effectiveMetadata(ctx: BlockBehaviourContext, x: number, y: number, z: number): number {
    const metadata = ctx.world.getBlockMetadata(x, y, z);
    if (!isDoorUpper(metadata)) return metadata;
    if (ctx.world.getBlock(x, y - 1, z) !== this.blockId) return metadata;
    return ctx.world.getBlockMetadata(x, y - 1, z);
  }

  /** Resolves either half to the lower half's coordinates. */
  private lowerHalfOf(ctx: BlockBehaviourContext, x: number, y: number, z: number): { y: number } | null {
    const metadata = ctx.world.getBlockMetadata(x, y, z);
    if (!isDoorUpper(metadata)) return { y };
    if (ctx.world.getBlock(x, y - 1, z) !== this.blockId) return null;
    return { y: y - 1 };
  }

  /**
   * Beta `BlockDoor.blockActivated`: iron doors ignore hand use; wooden doors
   * toggle exactly once and play one sound. Clicking the upper half is
   * forwarded to the lower half, so a single click never toggles twice.
   */
  public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    if (this.isIron) return true;

    const lower = this.lowerHalfOf(ctx, x, y, z);
    // An orphaned upper half still consumes the click, as in Beta.
    if (lower === null) return true;

    const opened = this.toggle(ctx, x, lower.y, z);
    ctx.playBlockSound?.(opened ? 'door_open' : 'door_close', x + 0.5, lower.y + 0.5, z + 0.5);
    return true;
  }

  /**
   * Flips the open bit on the lower half and mirrors it to the upper half.
   * Returns the new open state. This is the only place door state changes,
   * so both halves can never diverge and no caller can double-toggle.
   */
  private toggle(ctx: BlockBehaviourContext, x: number, lowerY: number, z: number): boolean {
    const lowerMeta = ctx.world.getBlockMetadata(x, lowerY, z);
    const nextLower = lowerMeta ^ OPEN_BIT;
    this.writeState(ctx, x, lowerY, z, nextLower);
    return (nextLower & OPEN_BIT) !== 0;
  }

  /** Writes a lower-half metadata value to both halves. */
  private writeState(ctx: BlockBehaviourContext, x: number, lowerY: number, z: number, lowerMeta: number): void {
    ctx.world.setBlockMetadata(x, lowerY, z, lowerMeta, { notifyNeighbours: true });
    if (ctx.world.getBlock(x, lowerY + 1, z) === this.blockId) {
      // Beta writes `(meta ^ 4) + 8` upstairs: same facing and open bit, with
      // the upper flag set.
      ctx.world.setBlockMetadata(x, lowerY + 1, z, (lowerMeta & 7) | UPPER_BIT, { notifyNeighbours: true });
    }
    ctx.world.markDirty(x, z);
  }

  /**
   * Beta `BlockDoor.onNeighborBlockChange`: destroy an orphaned or unsupported
   * door, otherwise follow redstone power.
   *
   * Redstone is applied only when the desired state actually differs from the
   * current one. The previous implementation recomputed and rewrote state on
   * every neighbour update, so an unpowered door slammed shut on the very
   * next tick after being opened by hand.
   */
  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const metadata = ctx.world.getBlockMetadata(x, y, z);
    const doorId = this.blockId;

    if (isDoorUpper(metadata)) {
      // An upper half with no lower half below it cannot exist.
      if (ctx.world.getBlock(x, y - 1, z) !== doorId) {
        ctx.world.setBlock(x, y, z, BlockIds.Air, { notifyNeighbours: true });
      }
      return;
    }

    // Lower half: needs its upper half and a solid block underneath.
    const missingUpper = ctx.world.getBlock(x, y + 1, z) !== doorId;
    const unsupported = !ctx.world.isNormalCube(x, y - 1, z);
    if (missingUpper || unsupported) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { notifyNeighbours: true });
      if (!missingUpper) {
        ctx.world.setBlock(x, y + 1, z, BlockIds.Air, { notifyNeighbours: true });
      }
      // Beta drops the door item from the lower half only.
      if (!this.isIron) ctx.world.dropBlockAsItem(x, y, z, doorId);
      return;
    }

    this.applyRedstone(ctx, x, y, z, metadata);
  }

  /** Beta `onPoweredBlockChange`, driven from the lower half. */
  private applyRedstone(
    ctx: BlockBehaviourContext,
    x: number,
    y: number,
    z: number,
    lowerMeta: number,
  ): void {
    const power = ctx.power;
    if (power === undefined) return;

    const powered = power.isBlockIndirectlyPowered({ x, y, z })
      || power.isBlockIndirectlyPowered({ x, y: y + 1, z });

    // Only act on an actual change, so hand-opened doors are left alone.
    if (powered === isDoorOpen(lowerMeta)) return;

    this.writeState(ctx, x, y, z, lowerMeta ^ OPEN_BIT);
    ctx.playBlockSound?.(powered ? 'door_open' : 'door_close', x + 0.5, y + 0.5, z + 0.5);
  }

  /**
   * Breaking either half removes the counterpart. The drop is emitted by the
   * block-drop resolver from the lower half only, so no duplicate item
   * appears when the pair is torn down.
   */
  public onRemoved(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const metadata = ctx.world.getBlockMetadata(x, y, z);
    const doorId = this.blockId;
    const partnerY = isDoorUpper(metadata) ? y - 1 : y + 1;
    if (ctx.world.getBlock(x, partnerY, z) === doorId) {
      ctx.world.setBlock(x, partnerY, z, BlockIds.Air, { notifyNeighbours: true });
    }
  }
}

/**
 * Beta `ItemDoor.onItemUse` facing:
 *
 *     floor((yaw + 180) * 4 / 360 - 0.5) & 3
 *
 * Yaw is in degrees. The result indexes the door's facing directly and is
 * what makes a placed door face the player rather than sitting sideways.
 */
export function doorFacingFromYaw(yawDegrees: number): number {
  return Math.floor((yawDegrees + 180) * 4 / 360 - 0.5) & 3;
}

/** Per-facing step used by Beta to probe the blocks either side of a door. */
export function doorSideOffset(facing: number): readonly [number, number] {
  switch (facing & 3) {
    case 0: return [0, 1];
    case 1: return [-1, 0];
    case 2: return [0, -1];
    default: return [1, 0];
  }
}

/**
 * Beta's hinge-side decision from `ItemDoor.onItemUse`: prefer the side with
 * an adjacent door, otherwise the side with more solid neighbours. When the
 * mirrored side wins, the facing rotates back one step and gains bit 4.
 */
export function resolveDoorPlacementMetadata(
  facing: number,
  isSolid: (dx: number, dz: number, dy: number) => boolean,
  isDoor: (dx: number, dz: number, dy: number) => boolean,
): number {
  const [ox, oz] = doorSideOffset(facing);

  const leftSolid = (isSolid(-ox, -oz, 0) ? 1 : 0) + (isSolid(-ox, -oz, 1) ? 1 : 0);
  const rightSolid = (isSolid(ox, oz, 0) ? 1 : 0) + (isSolid(ox, oz, 1) ? 1 : 0);
  const leftDoor = isDoor(-ox, -oz, 0) || isDoor(-ox, -oz, 1);
  const rightDoor = isDoor(ox, oz, 0) || isDoor(ox, oz, 1);

  const mirrored = (leftDoor && !rightDoor) || rightSolid > leftSolid;
  if (!mirrored) return facing;
  // Beta: `var9 = var9 - 1 & 3; var9 += 4;`
  return ((facing - 1) & 3) + 4;
}

export function registerDoorBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.WoodDoor, new DoorBehaviour(false));
  registry.register(BlockIds.IronDoor, new DoorBehaviour(true));
}
