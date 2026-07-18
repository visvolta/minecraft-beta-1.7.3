import type { BlockId } from '../blocks/BlockId';
import { BlockIds } from '../blocks/BlockId';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { Player } from './Player';
import type { ChunkManager } from '../world/ChunkManager';
import { AIR_BLOCK_ID } from '../world/chunkConstants';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';
import type { RaycastHit } from '../world/Raycaster';
import { worldToChunkLocal } from '../world/worldToChunkCoords';

/**
 * Replicates Minecraft Beta 1.7.3 block breaking logic.
 * Computes exact mining progress per frame, handles water/airborne penalties,
 * continuous hit sounds, target changes, out of range checks, and break cooldowns.
 */
export class BreakingController {
  private readonly player: Player;
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly blockUpdateWorld: BlockUpdateWorld;

  // Active mining state
  private miningBlockPos: { x: number; y: number; z: number } | undefined;
  private progress = 0.0; // From 0.0 to 1.0
  private blockHitWait = 0.0; // Cooldown in ticks (cooldown is 5 ticks in Beta 1.7.3)

  public constructor(
    player: Player,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    blockUpdateWorld: BlockUpdateWorld,
  ) {
    this.player = player;
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
    this.blockUpdateWorld = blockUpdateWorld;
  }

  public getMiningBlockPos(): { x: number; y: number; z: number } | undefined {
    return this.miningBlockPos;
  }

  public getProgress(): number {
    return this.progress;
  }

  /**
   * Resets active mining.
   */
  public reset(): void {
    this.miningBlockPos = undefined;
    this.progress = 0.0;
  }

  /**
   * Updates breaking progress and handles completion/resets.
   * Runs frame-by-frame, using deltaSeconds to compute exact progress (based on 20 ticks/sec).
   */
  public update(
    currentHit: RaycastHit | undefined,
    isLeftClickHeld: boolean,
    deltaSeconds: number,
  ): void {
    const ticksElapsed = deltaSeconds * 20.0;

    // 1. Process blockHitWait cooldown (ticks)
    if (this.blockHitWait > 0) {
      this.blockHitWait = Math.max(0, this.blockHitWait - ticksElapsed);
      // Cooldown prevents progress accumulation but continuous clicks can still be tracked.
      this.reset();
      return;
    }

    // 2. Check if mining is active or input is released/out-of-range
    if (!isLeftClickHeld || currentHit === undefined) {
      this.reset();
      return;
    }

    const { x, y, z } = currentHit.blockPos;

    // 3. If target changed, immediately reset damage progress
    if (
      this.miningBlockPos === undefined ||
      this.miningBlockPos.x !== x ||
      this.miningBlockPos.y !== y ||
      this.miningBlockPos.z !== z
    ) {
      this.reset();
      this.miningBlockPos = { x, y, z };
    }

    // 4. Resolve block definition and block strength
    const blockId = this.blockUpdateWorld.getBlock(x, y, z);
    if (blockId === BlockIds.Air) {
      this.reset();
      return;
    }

    const def = this.blockRegistry.getById(blockId);
    if (def === undefined) {
      this.reset();
      return;
    }

    const hardness = def.hardness !== undefined ? def.hardness : 1.0;

    // If block is unbreakable (hardness < 0), no progress is made and no cracks appear
    if (hardness < 0.0) {
      this.progress = 0.0;
      return;
    }

    // Calculate block strength per tick exactly from Beta 1.7.3 source code:
    // If the block is not harvestable by hand, speed = 1.0 / (hardness * 100.0)
    // If harvestable by hand, speed = 1.0 / (hardness * 30.0) (since hand mining speed multiplier is 1.0)
    let blockStrength = 0.0;
    if (hardness === 0.0) {
      blockStrength = Infinity; // Instant break
    } else {
      const isHarvestable = def.harvestableByHand !== undefined ? def.harvestableByHand : true;
      if (!isHarvestable) {
        blockStrength = 1.0 / (hardness * 100.0);
      } else {
        blockStrength = 1.0 / (hardness * 30.0);
      }
    }

    // Apply Beta 1.7.3 speed penalties (divide mining speed by 5 if underwater or airborne)
    let penaltyFactor = 1.0;
    if (this.isPlayerUnderwater()) {
      penaltyFactor *= 0.2;
    }
    if (!this.player.grounded) {
      penaltyFactor *= 0.2;
    }
    blockStrength *= penaltyFactor;

    // 5. Accumulate progress
    if (blockStrength === Infinity) {
      this.progress = 1.0;
    } else {
      this.progress += blockStrength * ticksElapsed;
    }

    // Continuous hand swing when holding left click and mining
    if (isLeftClickHeld && !this.player.isSwinging) {
      this.player.swingItem();
    }

    // 6. Check for break completion
    if (this.progress >= 0.9999) {
      this.breakBlock(x, y, z);
      this.reset();
      this.blockHitWait = 5.0; // 5-tick cooldown before starting next block
    }
  }

  private isPlayerUnderwater(): boolean {
    const px = Math.floor(this.player.position.x);
    const py = Math.floor(this.player.position.y);
    const pey = Math.floor(this.player.position.y + 1.62); // Eye level in Beta 1.7.3
    const pz = Math.floor(this.player.position.z);

    const feetBlock = this.blockUpdateWorld.getBlock(px, py, pz);
    const eyeBlock = this.blockUpdateWorld.getBlock(px, pey, pz);

    const isWater = (id: BlockId): boolean => id === BlockIds.WaterFlowing || id === BlockIds.WaterStill;
    return isWater(feetBlock) || isWater(eyeBlock);
  }

  private breakBlock(x: number, y: number, z: number): void {
    const { chunkX, chunkZ } = worldToChunkLocal(x, z);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) {
      return;
    }

    // Replaces block with Air and triggers mesh rebuild/neighborhood updates
    this.blockUpdateWorld.setBlock(x, y, z, AIR_BLOCK_ID, {
      reason: 'player',
      notifyNeighbours: true,
      updateLighting: true,
    });
  }
}
