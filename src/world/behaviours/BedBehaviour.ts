import { BlockIds } from '../../blocks/BlockId';
import { BED_FOOT_TO_HEAD, isBedHead } from '../../blocks/shapes/BlockShapes';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';

/**
 * Beta 1.7.3 `BlockBed`.
 *
 * A bed occupies two horizontally adjacent cells sharing one metadata layout:
 *   bits 0-1  direction, indexing `BED_FOOT_TO_HEAD`
 *   bit  2(4) occupied flag
 *   bit  3(8) set on the head half
 *
 * Note the decompiled helper `isBlockFootOfBed` is misnamed: it tests bit 8,
 * which marks the head. The half that drops the item is the bit-8-clear foot,
 * which is what `onNeighborBlockChange` shows.
 */

/** Beta bed metadata bit marking an occupied bed. */
const OCCUPIED_BIT = 4;

export type SleepAttemptResult = 'ok' | 'not-night' | 'too-far' | 'occupied' | 'obstructed';

/**
 * Host hooks the bed needs but must not own: whether it is night, where the
 * player is, and how to actually put them to sleep. Injected so the behaviour
 * stays testable and free of engine imports.
 */
export interface BedSleepHost {
  isNight(): boolean;
  /** Player feet position, used for Beta's 3-block proximity test. */
  getPlayerPosition(): { x: number; y: number; z: number };
  /** Places the player in the bed and starts the sleep sequence. */
  beginSleep(x: number, y: number, z: number, direction: number): void;
  isPlayerSleeping(): boolean;
}

/** Beta `EntityPlayer.sleepInBedAt` proximity limit. */
const MAX_SLEEP_DISTANCE = 3;

export class BedBehaviour implements BlockBehaviour {
  public constructor(private readonly host?: BedSleepHost) {}

  /**
   * Beta destroys a bed half whose partner has gone, and only the foot half
   * drops the item.
   */
  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const metadata = ctx.world.getBlockMetadata(x, y, z);
    const direction = BED_FOOT_TO_HEAD[metadata & 3] ?? [0, 1];
    const head = isBedHead(metadata);
    // The head looks back toward the foot; the foot looks forward to the head.
    const partnerX = x + (head ? -direction[0] : direction[0]);
    const partnerZ = z + (head ? -direction[1] : direction[1]);

    if (ctx.world.getBlock(partnerX, y, partnerZ) === BlockIds.Bed) return;

    ctx.world.setBlock(x, y, z, BlockIds.Air, { notifyNeighbours: true, updateLighting: true });
    if (!head) ctx.world.dropBlockAsItem(x, y, z, BlockIds.Bed);
  }

  /** Beta drops nothing from the head half; the foot yields the bed item. */
  public onRemoved(ctx: BlockBehaviourContext, x: number, y: number, z: number, _oldBlockId?: number, oldMetadata = ctx.world.getBlockMetadata(x, y, z)): void {
    const metadata = oldMetadata;
    const direction = BED_FOOT_TO_HEAD[metadata & 3] ?? [0, 1];
    const head = isBedHead(metadata);
    const partnerX = x + (head ? -direction[0] : direction[0]);
    const partnerZ = z + (head ? -direction[1] : direction[1]);
    // Breaking either half removes the other. If the head was broken directly,
    // emit the foot-half drop before removing it; normal breaking of the foot
    // is already handled by the breaking controller's drop resolver.
    if (ctx.world.getBlock(partnerX, y, partnerZ) === BlockIds.Bed) {
      if (head) ctx.world.dropBlockAsItem(partnerX, y, partnerZ, BlockIds.Bed, ctx.world.getBlockMetadata(partnerX, y, partnerZ));
      ctx.world.setBlock(partnerX, y, partnerZ, BlockIds.Air, { notifyNeighbours: true, updateLighting: true });
    }
  }

  public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const result = this.trySleep(ctx, x, y, z);
    // Beta always consumes the click on a bed, even when sleep is refused.
    return result !== 'obstructed';
  }

  /**
   * Beta `BlockBed.blockActivated` + `EntityPlayer.sleepInBedAt`, minus the
   * Nether explosion branch (this project has no Nether dimension).
   */
  public trySleep(ctx: BlockBehaviourContext, x: number, y: number, z: number): SleepAttemptResult {
    const host = this.host;
    if (host === undefined) return 'obstructed';

    // Beta redirects an interaction on the head to the foot half.
    let footX = x;
    const footY = y;
    let footZ = z;
    let metadata = ctx.world.getBlockMetadata(x, y, z);
    if (isBedHead(metadata)) {
      const direction = BED_FOOT_TO_HEAD[metadata & 3] ?? [0, 1];
      footX = x - direction[0];
      footZ = z - direction[1];
      if (ctx.world.getBlock(footX, footY, footZ) !== BlockIds.Bed) return 'obstructed';
      metadata = ctx.world.getBlockMetadata(footX, footY, footZ);
    }

    if ((metadata & OCCUPIED_BIT) !== 0 || host.isPlayerSleeping()) return 'occupied';
    if (!host.isNight()) return 'not-night';

    const player = host.getPlayerPosition();
    if (
      Math.abs(player.x - (footX + 0.5)) > MAX_SLEEP_DISTANCE
      || Math.abs(player.y - footY) > MAX_SLEEP_DISTANCE
      || Math.abs(player.z - (footZ + 0.5)) > MAX_SLEEP_DISTANCE
    ) {
      return 'too-far';
    }

    setBedOccupied(ctx, footX, footY, footZ, true);
    host.beginSleep(footX, footY, footZ, metadata & 3);
    return 'ok';
  }
}

/** Sets or clears the occupied bit on both halves of a bed. */
export function setBedOccupied(
  ctx: BlockBehaviourContext,
  footX: number,
  footY: number,
  footZ: number,
  occupied: boolean,
): void {
  const metadata = ctx.world.getBlockMetadata(footX, footY, footZ);
  const next = occupied ? (metadata | OCCUPIED_BIT) : (metadata & ~OCCUPIED_BIT);
  ctx.world.setBlockMetadata(footX, footY, footZ, next, { notifyNeighbours: false });

  const direction = BED_FOOT_TO_HEAD[metadata & 3] ?? [0, 1];
  const headX = footX + direction[0];
  const headZ = footZ + direction[1];
  if (ctx.world.getBlock(headX, footY, headZ) !== BlockIds.Bed) return;
  const headMeta = ctx.world.getBlockMetadata(headX, footY, headZ);
  ctx.world.setBlockMetadata(
    headX, footY, headZ,
    occupied ? (headMeta | OCCUPIED_BIT) : (headMeta & ~OCCUPIED_BIT),
    { notifyNeighbours: false },
  );
}

/**
 * Beta places the foot at the clicked cell and the head one step along the
 * player's facing. Returns the head position, or null when it is blocked.
 */
export function bedHeadPositionFor(
  ctx: BlockBehaviourContext,
  footX: number,
  footY: number,
  footZ: number,
  direction: number,
): { x: number; z: number } | null {
  const offset = BED_FOOT_TO_HEAD[direction & 3] ?? [0, 1];
  const headX = footX + offset[0];
  const headZ = footZ + offset[1];
  const occupant = ctx.world.getBlock(headX, footY, headZ);
  if (occupant !== BlockIds.Air) return null;
  // Beta requires solid ground under both halves.
  if (!ctx.world.isNormalCube(headX, footY - 1, headZ)) return null;
  return { x: headX, z: headZ };
}

export function registerBedBehaviour(registry: BlockBehaviourRegistry, host?: BedSleepHost): void {
  // Merge, not replace: the bed's 9/16-tall bounds come from the shared shape
  // declaration in `registerShapedBlockBehaviours`, and a plain register()
  // here would drop them and make the bed collide as a full cube.
  registry.merge(BlockIds.Bed, new BedBehaviour(host));
}
