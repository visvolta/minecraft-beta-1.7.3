import { BlockIds } from '../../blocks/BlockId';
import { FaceDirection } from '../../blocks/BlockFace';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { NeighbourUpdateEvent } from '../updates/BlockMutation';
import { offsetBlockPosition, type BlockPosition } from '../BlockDirections';
import type { PowerQueryContext, RedstonePower } from '../redstone/RedstonePower';

/**
 * Beta `BlockRedstoneRepeater` exact delay values (ticks).
 * Derived from `field_22023_b = {1,2,3,4}` × 2 per the source's
 * `scheduleBlockUpdate(..., field_22023_b[var8] * 2)`.
 */
const REPEATER_DELAYS = [2, 4, 6, 8] as const;

/**
 * Metadata bits 0-1 encode the INPUT direction (where the signal comes from):
 *   0 = SOUTH (+Z), 1 = WEST (-X), 2 = NORTH (-Z), 3 = EAST (+X)
 * Metadata bits 2-3 encode the delay index (0-3 → delays 2/4/6/8).
 *
 * The output face is the OPPOSITE of the input. When the output block queries
 * the repeater via `getWeakPower`, `directionToSource` (from output block to
 * repeater) equals the INPUT direction — because looking back from the output
 * side toward the repeater is the same direction as the input.
 */
const DIRECTION_TO_INPUT_FACE: readonly FaceDirection[] = [
  FaceDirection.SOUTH, FaceDirection.WEST, FaceDirection.NORTH, FaceDirection.EAST,
];

/**
 * Beta `BlockRedstoneRepeater`: a directional redstone diode that delays and
 * relays power. Two block IDs: idle (93) and active/powered (94). On input
 * change, a scheduled tick fires after the delay, swapping the block ID. The
 * active repeater outputs 15 on its output face only. Right-click cycles the
 * delay through the four states. `canProvidePower` is true for the active
 * repeater so the power engine queries `getWeakPower`; the directional filter
 * inside `getWeakPower` ensures only the output face receives power.
 */
export class RedstoneRepeaterBehaviour implements BlockBehaviour {
  public readonly canProvidePower: boolean;

  public constructor(private readonly isPowered: boolean) {
    this.canProvidePower = isPowered;
  }

  public canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    return ctx.world.isNormalCube(x, y - 1, z);
  }

  /** Beta `blockActivated`: right-click cycles the delay (bits 2-3). */
  public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const delayBits = (meta & 12);
    const newDelayBits = ((delayBits >> 2) + 1) << 2 & 12;
    ctx.world.setBlockMetadataWithNotify(x, y, z, newDelayBits | (meta & 3));
    return true;
  }

  /**
   * Beta `onNeighborBlockChange`: detect input state mismatch → schedule
   * a tick with the configured delay. Also check support removal.
   */
  public neighborChanged(
    ctx: BlockBehaviourContext, x: number, y: number, z: number,
    _sx: number, _sy: number, _sz: number, _event?: NeighbourUpdateEvent,
  ): void {
    if (!this.canPlaceBlockAt(ctx, x, y, z)) {
      ctx.world.dropBlockAsItem(x, y, z, ctx.world.getBlock(x, y, z));
      ctx.world.setBlockWithNotify(x, y, z, BlockIds.Air);
      return;
    }
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const inputPowered = this.isInputPowered(ctx, x, y, z, meta);
    const currentBlockId = ctx.world.getBlock(x, y, z);

    if (this.isPowered && !inputPowered) {
      const delay = REPEATER_DELAYS[(meta & 12) >> 2] ?? 2;
      ctx.world.scheduleBlockTick(x, y, z, currentBlockId, delay);
    } else if (!this.isPowered && inputPowered) {
      const delay = REPEATER_DELAYS[(meta & 12) >> 2] ?? 2;
      ctx.world.scheduleBlockTick(x, y, z, currentBlockId, delay);
    }
  }

  /**
   * Beta `updateTick`: swap block ID between idle (93) and active (94),
   * preserving metadata (direction + delay).
   */
  public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const inputPowered = this.isInputPowered(ctx, x, y, z, meta);

    if (this.isPowered && !inputPowered) {
      // Active repeater lost input → turn off.
      ctx.world.setBlock(x, y, z, BlockIds.RedstoneRepeaterIdle, { metadata: meta, notifyNeighbours: true });
    } else if (!this.isPowered) {
      // Idle repeater's delay expired → turn on.
      ctx.world.setBlock(x, y, z, BlockIds.RedstoneRepeaterActive, { metadata: meta, notifyNeighbours: true });
      // Beta: if the input went away during the delay, schedule a turn-off.
      if (!inputPowered) {
        const delay = REPEATER_DELAYS[(meta & 12) >> 2] ?? 2;
        ctx.world.scheduleBlockTick(x, y, z, BlockIds.RedstoneRepeaterActive, delay);
      }
    }
  }

  /**
   * Beta `isPoweringTo`: the active repeater outputs 15 on the OUTPUT face only.
   * `directionToSource` from the querying (output) block back to the repeater
   * equals the INPUT direction, so we check against `DIRECTION_TO_INPUT_FACE`.
   */
  public getWeakPower(ctx: PowerQueryContext): RedstonePower | number {
    if (!this.isPowered) return 0;
    const dir = ctx.sourceMetadata & 3;
    return ctx.directionToSource === DIRECTION_TO_INPUT_FACE[dir] ? 15 : 0;
  }

  /**
   * Beta `ignoreTick`: checks whether the input side is powered, either via
   * indirect power from the neighboring block or via adjacent redstone wire
   * with power level > 0.
   */
  private isInputPowered(ctx: BlockBehaviourContext, x: number, y: number, z: number, meta: number): boolean {
    const dir = meta & 3;
    const inputFace = DIRECTION_TO_INPUT_FACE[dir]!;
    const inputPos = offsetBlockPosition({ x, y, z } as BlockPosition, inputFace);

    // Beta: isBlockIndirectlyProvidingPowerTo(inputPos, faceToRepeater)
    const indirect = ctx.power?.getIndirectPowerFrom({ x, y, z } as BlockPosition, inputFace) ?? 0;
    if (indirect > 0) return true;

    // Beta: wire at input position with metadata > 0.
    if (ctx.world.getBlock(inputPos.x, inputPos.y, inputPos.z) === BlockIds.RedstoneWire) {
      return ctx.world.getBlockMetadata(inputPos.x, inputPos.y, inputPos.z) > 0;
    }
    return false;
  }
}

/**
 * Registers both repeater block states: idle (93, no power output) and
 * active (94, directional 15 power output).
 */
export function registerRedstoneRepeaterBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.RedstoneRepeaterIdle, new RedstoneRepeaterBehaviour(false));
  registry.register(BlockIds.RedstoneRepeaterActive, new RedstoneRepeaterBehaviour(true));
}
