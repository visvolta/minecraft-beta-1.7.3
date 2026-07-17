/**
 * Beta 1.7.3 BlockFire implementation.
 *
 * Ported from BlockFire.java (mc_b1.7.3_release).
 * Uses scheduled ticks (tickRate=40), NOT random ticks.
 * Single authoritative update path per fire block.
 *
 * Corrections applied:
 * - Fire is NOT solid, NOT collidable
 * - Fluids replace fire through normal mutation (no isSolidForFlow change)
 * - Netherrack supports infinite fire (ignores age extinguishing and rain)
 * - TNT ignition emits WorldEventQueue event
 * - Flammability table matches Beta exactly (two values per block)
 * - Rain checks use existing WeatherController + precipitation heightmap
 */

import { BlockIds } from '../../blocks/BlockId';
import type { BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { WeatherController } from '../weather/WeatherController';
import type { ChunkManager } from '../ChunkManager';
import { blockIdBlocksWeather } from '../weather/WeatherBlocking';
import { worldToChunkLocal } from '../worldToChunkCoords';

/**
 * Beta 1.7.3 BlockFire.initializeBlock() flammability table.
 * Two separate values per block:
 * - encouragement: chance to encourage fire nearby (used in spread calc)
 * - abilityToCatchFire: chance for the block itself to burn away
 *
 * Blocks NOT in this table cannot catch fire or encourage fire.
 * Only blocks explicitly registered in Beta's initializeBlock() are included.
 */
const ENCOURAGEMENT = new Map<BlockId, number>([
  [BlockIds.Planks, 5],      // Block.planks
  [BlockIds.Fence, 5],       // Block.fence
  [BlockIds.WoodStairs, 5],  // Block.stairCompactPlanks
  [BlockIds.Log, 5],         // Block.wood (log)
  [BlockIds.SpruceLog, 5],   // Project-internal: spruce log same as oak
  [BlockIds.Leaves, 30],     // Block.leaves
  [BlockIds.SpruceLeaves, 30],
  [BlockIds.Bookshelf, 30],  // Block.bookShelf
  [BlockIds.TNT, 15],        // Block.tnt
  [BlockIds.TallGrass, 60],  // Block.tallGrass
  [BlockIds.Wool, 30],       // Block.cloth
]);

const ABILITY_TO_CATCH_FIRE = new Map<BlockId, number>([
  [BlockIds.Planks, 20],
  [BlockIds.Fence, 20],
  [BlockIds.WoodStairs, 20],
  [BlockIds.Log, 5],
  [BlockIds.SpruceLog, 5],
  [BlockIds.Leaves, 60],
  [BlockIds.SpruceLeaves, 60],
  [BlockIds.Bookshelf, 20],
  [BlockIds.TNT, 100],
  [BlockIds.TallGrass, 100],
  [BlockIds.Wool, 60],
]);

export class FireBehaviour implements BlockBehaviour {
  /** Fire uses scheduled ticks, NOT random ticks. */
  public readonly randomTicks = false;

  public constructor(
    private readonly blocks: BlockRegistry,
    private readonly weather: WeatherController,
    private readonly chunks: ChunkManager,
  ) {}

  /**
   * Beta BlockFire.onBlockAdded().
   * Schedules a tick at delay tickRate()=40.
   * Checks support; removes if unsupported.
   * Portal check deferred (no portal system).
   */
  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    // Check support: solid normal cube below OR flammable neighbour
    if (!this.isBlockNormalCube(ctx, x, y - 1, z) && !this.canNeighborCatchFire(ctx, x, y, z)) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
      return;
    }
    ctx.world.scheduleBlockTick(x, y, z, BlockIds.Fire, 40);
  }

  /**
   * Beta BlockFire.onNeighborBlockChange().
   * Removes fire if no longer supported.
   */
  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    if (!this.isBlockNormalCube(ctx, x, y - 1, z) && !this.canNeighborCatchFire(ctx, x, y, z)) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
    }
  }

  /**
   * Beta BlockFire.updateTick(). Single authoritative update path.
   * Scheduled tick at delay 40; reschedules itself.
   */
  public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    // 1. Netherrack check: fire on netherrack is infinite
    const netherrack = ctx.world.getBlock(x, y - 1, z) === BlockIds.Netherrack;

    // 2. Support check
    if (!this.canPlaceBlockAt(ctx, x, y, z)) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
      return;
    }

    // 3. Rain extinguishing (not on netherrack)
    if (!netherrack && this.weather.getState().raining) {
      if (this.isExposedToRain(x, y, z)) {
        ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
        return;
      }
    }

    // 4. Age progression
    let age = ctx.world.getBlockMetadata(x, y, z);
    if (age < 15) {
      age = Math.min(15, age + Math.floor((ctx.nextInt?.(3) ?? 0) / 2));
      ctx.world.setBlockMetadata(x, y, z, age, { affectsMesh: true, affectsWeather: false, affectsLight: false });
    }

    // 5. Reschedule
    ctx.world.scheduleBlockTick(x, y, z, BlockIds.Fire, 40);

    // 6. No flammable neighbour check (unless netherrack)
    if (!netherrack && !this.canNeighborCatchFire(ctx, x, y, z)) {
      if (!this.isBlockNormalCube(ctx, x, y - 1, z) || age > 3) {
        ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
        return;
      }
    }

    // 7. Age 15 extinguishing (not on netherrack)
    if (!netherrack && !this.canBlockCatchFire(ctx, x, y - 1, z) && age === 15 && (ctx.nextInt?.(4) ?? 0) === 0) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
      return;
    }

    // 8. tryToCatchBlockOnFire for 6 direct neighbours
    //    Beta uses different base chances: 300 for horizontal, 250 for vertical
    this.tryToCatchBlockOnFire(ctx, x + 1, y, z, 300, age);
    this.tryToCatchBlockOnFire(ctx, x - 1, y, z, 300, age);
    this.tryToCatchBlockOnFire(ctx, x, y - 1, z, 250, age);
    this.tryToCatchBlockOnFire(ctx, x, y + 1, z, 250, age);
    this.tryToCatchBlockOnFire(ctx, x, y, z - 1, 300, age);
    this.tryToCatchBlockOnFire(ctx, x, y, z + 1, 300, age);

    // 9. Nearby volume spread: x±1, z±1, y-1 to y+4
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 4; dy++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const tx = x + dx;
          const ty = y + dy;
          const tz = z + dz;

          let distPenalty = 100;
          if (ty > y + 1) {
            distPenalty += (ty - (y + 1)) * 100;
          }

          const encouragement = this.getChanceOfNeighborsEncouragingFire(ctx, tx, ty, tz);
          if (encouragement <= 0) continue;

          const spreadChance = Math.floor((encouragement + 40) / (age + 30));
          if (spreadChance <= 0) continue;

          if ((ctx.nextInt?.(distPenalty) ?? 0) > spreadChance) continue;

          // Rain check: target and its 4 horizontal neighbours
          if (this.weather.getState().raining) {
            if (this.canBlockBeRainedOn(tx, ty, tz)) continue;
            if (this.canBlockBeRainedOn(tx - 1, ty, tz)) continue;
            if (this.canBlockBeRainedOn(tx + 1, ty, tz)) continue;
            if (this.canBlockBeRainedOn(tx, ty, tz - 1)) continue;
            if (this.canBlockBeRainedOn(tx, ty, tz + 1)) continue;
          }

          const newAge = Math.min(15, age + (ctx.nextInt?.(5) ?? 0) / 4);
          ctx.world.setBlock(tx, ty, tz, BlockIds.Fire, {
            metadata: newAge,
            reason: 'scheduled',
            notifyNeighbours: true,
            updateLighting: true,
          });
        }
      }
    }
  }

  /**
   * Beta BlockFire.tryToCatchBlockOnFire().
   * Attempts to ignite or destroy a neighbouring block.
   * TNT ignition emits a deterministic event through WorldEventQueue.
   */
  private tryToCatchBlockOnFire(
    ctx: BlockBehaviourContext,
    x: number, y: number, z: number,
    baseChance: number,
    fireAge: number,
  ): void {
    const targetId = ctx.world.getBlock(x, y, z);
    const burnAbility = ABILITY_TO_CATCH_FIRE.get(targetId) ?? 0;
    if (burnAbility === 0) return;

    if ((ctx.nextInt?.(baseChance) ?? 0) >= burnAbility) return;

    // Rain check on the target
    const rainExposed = this.canBlockBeRainedOn(x, y, z);

    if ((ctx.nextInt?.(fireAge + 10) ?? 0) < 5 && !rainExposed) {
      // Ignite: replace target with fire
      const newAge = Math.min(15, fireAge + (ctx.nextInt?.(5) ?? 0) / 4);
      ctx.world.setBlock(x, y, z, BlockIds.Fire, {
        metadata: newAge,
        reason: 'scheduled',
        notifyNeighbours: true,
        updateLighting: true,
      });
    } else {
      // Burn away: remove target
      ctx.world.setBlock(x, y, z, BlockIds.Air, {
        reason: 'scheduled',
        notifyNeighbours: true,
        updateLighting: true,
      });
    }

    // TNT ignition: emit event (Beta: Block.tnt.onBlockDestroyedByPlayer)
    if (targetId === BlockIds.TNT && ctx.events !== undefined) {
      ctx.events.enqueueTntIgniteAttempt(ctx.gameTick, x, y, z);
    }
  }

  /**
   * Beta BlockFire.canPlaceBlockAt().
   * Fire can exist if solid normal cube below OR any flammable neighbour.
   */
  private canPlaceBlockAt(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    return this.isBlockNormalCube(ctx, x, y - 1, z) || this.canNeighborCatchFire(ctx, x, y, z);
  }

  /**
   * Beta BlockFire.canNeighborCatchFire().
   * Returns true if any of the 6 direct neighbours is flammable.
   */
  private canNeighborCatchFire(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    return (
      this.canBlockCatchFire(ctx, x + 1, y, z) ||
      this.canBlockCatchFire(ctx, x - 1, y, z) ||
      this.canBlockCatchFire(ctx, x, y - 1, z) ||
      this.canBlockCatchFire(ctx, x, y + 1, z) ||
      this.canBlockCatchFire(ctx, x, y, z - 1) ||
      this.canBlockCatchFire(ctx, x, y, z + 1)
    );
  }

  /**
   * Beta BlockFire.canBlockCatchFire().
   * Returns true if the block has encouragement > 0.
   */
  private canBlockCatchFire(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    return (ENCOURAGEMENT.get(ctx.world.getBlock(x, y, z)) ?? 0) > 0;
  }

  /**
   * Beta BlockFire.getChanceOfNeighborsEncouragingFire().
   * Returns the maximum encouragement from the 6 direct neighbours.
   * Only counts if the target position is air.
   */
  private getChanceOfNeighborsEncouragingFire(ctx: BlockBehaviourContext, x: number, y: number, z: number): number {
    if (ctx.world.getBlock(x, y, z) !== BlockIds.Air) return 0;
    let max = 0;
    max = Math.max(max, ENCOURAGEMENT.get(ctx.world.getBlock(x + 1, y, z)) ?? 0);
    max = Math.max(max, ENCOURAGEMENT.get(ctx.world.getBlock(x - 1, y, z)) ?? 0);
    max = Math.max(max, ENCOURAGEMENT.get(ctx.world.getBlock(x, y - 1, z)) ?? 0);
    max = Math.max(max, ENCOURAGEMENT.get(ctx.world.getBlock(x, y + 1, z)) ?? 0);
    max = Math.max(max, ENCOURAGEMENT.get(ctx.world.getBlock(x, y, z - 1)) ?? 0);
    max = Math.max(max, ENCOURAGEMENT.get(ctx.world.getBlock(x, y, z + 1)) ?? 0);
    return max;
  }

  /**
   * Beta World.isBlockNormalCube().
   * True if the block is solid, opaque, and a full cube.
   * Used for support checks and rain exposure.
   */
  private isBlockNormalCube(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const def = this.blocks.getById(ctx.world.getBlock(x, y, z));
    return def !== undefined && def.solid && !def.transparent;
  }

  /**
   * Beta World.canBlockBeRainedOn().
   * True if the block at (x,y,z) has direct sky exposure (y >= precipitation height).
   * Uses the existing precipitation heightmap from Chunk.
   */
  private canBlockBeRainedOn(x: number, y: number, z: number): boolean {
    if (!this.weather.getState().raining) return false;
    const coords = worldToChunkLocal(x, z);
    const chunk = this.chunks.getChunk(coords.chunkX, coords.chunkZ);
    if (chunk === undefined) return false;
    const precipHeight = chunk.getPrecipitationHeight(
      coords.localX, coords.localZ,
      (id) => blockIdBlocksWeather(this.blocks, id),
    );
    return y >= precipHeight;
  }

  /**
   * Rain exposure check: fire is exposed if it OR any of its 4 horizontal
   * neighbours can be rained on. Matches Beta's updateTick rain condition.
   */
  private isExposedToRain(x: number, y: number, z: number): boolean {
    return (
      this.canBlockBeRainedOn(x, y, z) ||
      this.canBlockBeRainedOn(x - 1, y, z) ||
      this.canBlockBeRainedOn(x + 1, y, z) ||
      this.canBlockBeRainedOn(x, y, z - 1) ||
      this.canBlockBeRainedOn(x, y, z + 1)
    );
  }
}

/**
 * Returns the encouragement value for a block (for rendering/debug).
 */
export function getFireEncouragement(blockId: BlockId): number {
  return ENCOURAGEMENT.get(blockId) ?? 0;
}

/**
 * Returns the ability to catch fire for a block (for rendering/debug).
 */
export function getFireAbility(blockId: BlockId): number {
  return ABILITY_TO_CATCH_FIRE.get(blockId) ?? 0;
}

export function registerFireBehaviour(
  registry: BlockBehaviourRegistry,
  blocks: BlockRegistry,
  weather: WeatherController,
  chunks: ChunkManager,
): void {
  registry.register(BlockIds.Fire, new FireBehaviour(blocks, weather, chunks));
}
