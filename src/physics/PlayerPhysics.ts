import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ChunkManager } from '../world/ChunkManager';
import { CHUNK_SIZE_Y } from '../world/chunkConstants';
import { worldToChunkLocal } from '../world/worldToChunkCoords';
import type { Player } from '../player/Player';
import { AABB } from './AABB';
import { COLLISION_EPSILON, GRAVITY, TERMINAL_VELOCITY } from './physicsConstants';

/**
 * How quickly horizontal velocity is steered toward wishVelocity while
 * standing on solid ground. High value: near-instant stop/start, matching
 * Beta's responsive ground movement.
 */
export const GROUND_ACCELERATION = 70;

/**
 * How quickly horizontal velocity is steered toward wishVelocity while
 * airborne. Deliberately much lower than GROUND_ACCELERATION so momentum
 * is preserved and WASD only gently influences an existing jump/fall,
 * rather than snapping to a new direction like free-fly/creative flight.
 */
export const AIR_ACCELERATION = 5;

/**
 * Order axes are resolved in during collision. Resolving Y first gives more
 * stable landings (grounded state settles before horizontal movement is
 * checked against the now-correct vertical position). Expressed as data so
 * the order is a one-line change if ever revisited.
 */
const COLLISION_AXIS_ORDER: readonly ('x' | 'y' | 'z')[] = ['y', 'x', 'z'];

/**
 * Gravity integration, horizontal acceleration toward wish velocity, and
 * per-axis AABB-vs-block collision resolution for the player.
 *
 * Queries solid geometry through ChunkManager + BlockRegistry only; does
 * not touch rendering, input, or camera state.
 */
export class PlayerPhysics {
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;

  public constructor(chunkManager: ChunkManager, blockRegistry: BlockRegistry) {
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
  }

  /**
   * Integrates gravity and horizontal acceleration, then resolves movement
   * against solid blocks. Jumping itself is applied by PlayerController
   * before this runs; this only reacts to whatever velocity.y already is.
   */
  public update(player: Player, deltaSeconds: number): void {
    this.applyHorizontalAcceleration(player, deltaSeconds);

    const velocityYBeforeGravity = player.velocity.y;
    this.applyGravity(player, deltaSeconds);

    // Use the average of pre- and post-gravity vertical velocity for this
    // frame's displacement (trapezoidal integration), not just the
    // post-gravity value. Using only the post-gravity velocity (symplectic
    // Euler) is fine for X/Z (constant wish speed) but under constant
    // acceleration it systematically undershoots analytic motion — e.g.
    // the jump apex height would fall noticeably short of JUMP_HEIGHT at
    // typical frame rates, more so at low frame rates. Averaging keeps
    // gravity's effect on displacement accurate regardless of frame rate,
    // while velocity itself (used for grounded checks, terminal velocity,
    // etc.) is unaffected.
    const averageVelocityY = (velocityYBeforeGravity + player.velocity.y) / 2;

    this.moveAndCollide(player, deltaSeconds, averageVelocityY);
  }

  private applyHorizontalAcceleration(player: Player, deltaSeconds: number): void {
    const acceleration = player.grounded ? GROUND_ACCELERATION : AIR_ACCELERATION;
    const maxStep = acceleration * deltaSeconds;

    player.velocity.x = this.stepToward(player.velocity.x, player.wishVelocity.x, maxStep);
    player.velocity.z = this.stepToward(player.velocity.z, player.wishVelocity.z, maxStep);
  }

  /** Moves `current` toward `target` by at most `maxStep`, never overshooting. */
  private stepToward(current: number, target: number, maxStep: number): number {
    const difference = target - current;

    if (Math.abs(difference) <= maxStep) {
      return target;
    }

    return current + Math.sign(difference) * maxStep;
  }

  private applyGravity(player: Player, deltaSeconds: number): void {
    player.velocity.y -= GRAVITY * deltaSeconds;

    if (player.velocity.y < -TERMINAL_VELOCITY) {
      player.velocity.y = -TERMINAL_VELOCITY;
    }
  }

  /**
   * Resolves movement one axis at a time (order: COLLISION_AXIS_ORDER),
   * so a collision on one axis cannot mask or distort resolution on
   * another. Grounded state is derived entirely from the Y-axis step.
   *
   * `displacementVelocityY` is the (possibly averaged, see update())
   * vertical speed used only for this frame's Y displacement; X/Z use
   * player.velocity directly since they have no acceleration within a
   * single physics step (wish-velocity stepping already happened).
   */
  private moveAndCollide(
    player: Player,
    deltaSeconds: number,
    displacementVelocityY: number,
  ): void {
    const delta = {
      x: player.velocity.x * deltaSeconds,
      y: displacementVelocityY * deltaSeconds,
      z: player.velocity.z * deltaSeconds,
    };

    let grounded = false;

    for (const axis of COLLISION_AXIS_ORDER) {
      const box = player.getAABB();
      const resolved = this.resolveAxis(box, axis, delta[axis]);

      if (axis === 'x') {
        player.position.x += resolved;
        if (resolved !== delta.x) {
          player.velocity.x = 0;
        }
      } else if (axis === 'z') {
        player.position.z += resolved;
        if (resolved !== delta.z) {
          player.velocity.z = 0;
        }
      } else {
        player.position.y += resolved;

        if (resolved !== delta.y) {
          if (delta.y < 0) {
            // Moving down and stopped short: resting on a solid block.
            grounded = true;
          }

          player.velocity.y = 0;
        }
      }
    }

    player.grounded = grounded;
  }

  /**
   * Sweeps `box` by `distance` along `axis`, stopping short of the first
   * solid block it would otherwise penetrate. Returns the actual (possibly
   * reduced) distance travelled.
   *
   * Only `axis` is moving during this step (the other two axes are
   * resolved separately), so overlap on the other two axes is checked
   * against the box's original, unmoved position.
   */
  private resolveAxis(box: AABB, axis: 'x' | 'y' | 'z', distance: number): number {
    if (distance === 0) {
      return 0;
    }

    const movingPositive = distance > 0;
    const sweptBox = this.sweptBoxAlongAxis(box, axis, distance);
    const blockRange = this.blockRangeCoveringBox(sweptBox);

    let allowedDistance = distance;

    for (let bx = blockRange.minX; bx <= blockRange.maxX; bx++) {
      for (let by = blockRange.minY; by <= blockRange.maxY; by++) {
        for (let bz = blockRange.minZ; bz <= blockRange.maxZ; bz++) {
          if (!this.isSolidBlock(bx, by, bz)) {
            continue;
          }

          const blockId = this.getBlockIdAt(bx, by, bz);
          let blockBox: AABB;

          if (blockId === 81) { // Cactus block ID is 81
            // Cactus is inset horizontally by 1/16 (0.0625)
            blockBox = new AABB(bx + 0.0625, by, bz + 0.0625, bx + 0.9375, by + 1, bz + 0.9375);
          } else {
            blockBox = new AABB(bx, by, bz, bx + 1, by + 1, bz + 1);
          }

          if (!this.overlapsOnOtherAxes(box, blockBox, axis)) {
            continue;
          }

          const limited = this.limitDistance(box, blockBox, axis, movingPositive);

          // Clamp to zero rather than letting a pre-existing overlap (e.g.
          // floating-point skin contact) push the box backward.
          if (movingPositive) {
            allowedDistance = Math.min(allowedDistance, Math.max(0, limited));
          } else {
            allowedDistance = Math.max(allowedDistance, Math.min(0, limited));
          }
        }
      }
    }

    return allowedDistance;
  }

  private getBlockIdAt(worldX: number, worldY: number, worldZ: number): number {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) {
      return 0;
    }
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) {
      return 0;
    }
    return chunk.getBlock(localX, worldY, localZ);
  }

  /** True if the box overlaps the block on the two axes other than `axis`. */
  private overlapsOnOtherAxes(box: AABB, blockBox: AABB, axis: 'x' | 'y' | 'z'): boolean {
    const xOverlap = axis === 'x' || (box.minX < blockBox.maxX && box.maxX > blockBox.minX);
    const yOverlap = axis === 'y' || (box.minY < blockBox.maxY && box.maxY > blockBox.minY);
    const zOverlap = axis === 'z' || (box.minZ < blockBox.maxZ && box.maxZ > blockBox.minZ);

    return xOverlap && yOverlap && zOverlap;
  }

  /** Distance along `axis` the box can travel before touching blockBox's near face. */
  private limitDistance(
    box: AABB,
    blockBox: AABB,
    axis: 'x' | 'y' | 'z',
    movingPositive: boolean,
  ): number {
    if (axis === 'x') {
      return movingPositive
        ? blockBox.minX - box.maxX - COLLISION_EPSILON
        : blockBox.maxX - box.minX + COLLISION_EPSILON;
    }

    if (axis === 'y') {
      return movingPositive
        ? blockBox.minY - box.maxY - COLLISION_EPSILON
        : blockBox.maxY - box.minY + COLLISION_EPSILON;
    }

    return movingPositive
      ? blockBox.minZ - box.maxZ - COLLISION_EPSILON
      : blockBox.maxZ - box.minZ + COLLISION_EPSILON;
  }

  /** The box extended along `axis` by `distance`, used to gather candidate blocks. */
  private sweptBoxAlongAxis(box: AABB, axis: 'x' | 'y' | 'z', distance: number): AABB {
    const dx = axis === 'x' ? distance : 0;
    const dy = axis === 'y' ? distance : 0;
    const dz = axis === 'z' ? distance : 0;

    const moved = box.translated(dx, dy, dz);

    return new AABB(
      Math.min(box.minX, moved.minX),
      Math.min(box.minY, moved.minY),
      Math.min(box.minZ, moved.minZ),
      Math.max(box.maxX, moved.maxX),
      Math.max(box.maxY, moved.maxY),
      Math.max(box.maxZ, moved.maxZ),
    );
  }

  /** Inclusive integer block-coordinate range covering a world-space box. */
  private blockRangeCoveringBox(box: AABB): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  } {
    return {
      minX: Math.floor(box.minX),
      maxX: Math.ceil(box.maxX) - 1,
      minY: Math.floor(box.minY),
      maxY: Math.ceil(box.maxY) - 1,
      minZ: Math.floor(box.minZ),
      maxZ: Math.ceil(box.maxZ) - 1,
    };
  }

  /** Looks up a world-space block position via ChunkManager + BlockRegistry. */
  private isSolidBlock(worldX: number, worldY: number, worldZ: number): boolean {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) {
      // Above/below the world column: treat as open space, matching how
      // ChunkMesher treats missing vertical range (never solid there).
      return false;
    }

    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);

    if (chunk === undefined) {
      // Unloaded chunk: treat as open space rather than solid, consistent
      // with ChunkMesher's "missing neighbour chunk = Air" rule.
      return false;
    }

    const blockId = chunk.getBlock(localX, worldY, localZ);
    const definition = this.blockRegistry.getById(blockId);

    return definition !== undefined && definition.solid;
  }
}
