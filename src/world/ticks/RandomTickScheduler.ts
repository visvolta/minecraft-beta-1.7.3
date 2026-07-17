import type { ChunkManager } from '../ChunkManager';
import type { BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';
import { JavaRandom } from '../generation/random/JavaRandom';

export interface RandomTickMetrics {
  readonly chunksConsidered: number;
  readonly positionsSampled: number;
  readonly dispatched: number;
  readonly skippedNonRandom: number;
  readonly budgetDeferrals: number;
  readonly durationMs: number;
}

const RANDOM_TICKS_PER_CHUNK = 3;
const MAX_RANDOM_SAMPLES_PER_GAME_TICK = 512;

export class RandomTickScheduler {
  private readonly random: JavaRandom;
  private metrics: RandomTickMetrics = {
    chunksConsidered: 0,
    positionsSampled: 0,
    dispatched: 0,
    skippedNonRandom: 0,
    budgetDeferrals: 0,
    durationMs: 0,
  };

  public constructor(seed: bigint) {
    this.random = new JavaRandom(seed ^ 0x51f15eeden);
  }

  public process(chunkManager: ChunkManager, behaviours: BlockBehaviourRegistry, ctx: BlockBehaviourContext): RandomTickMetrics {
    const start = performance.now();
    let chunksConsidered = 0;
    let positionsSampled = 0;
    let dispatched = 0;
    let skippedNonRandom = 0;
    let budgetDeferrals = 0;

    for (const chunk of chunkManager) {
      chunksConsidered += 1;
      for (let i = 0; i < RANDOM_TICKS_PER_CHUNK; i++) {
        if (positionsSampled >= MAX_RANDOM_SAMPLES_PER_GAME_TICK) {
          budgetDeferrals += 1;
          break;
        }
        const localX = this.random.nextInt(CHUNK_SIZE_X);
        const localY = this.random.nextInt(CHUNK_SIZE_Y);
        const localZ = this.random.nextInt(CHUNK_SIZE_Z);
        positionsSampled += 1;
        const blockId = chunk.getBlock(localX, localY, localZ);
        const behaviour = behaviours.get(blockId);
        if (behaviour.randomTicks === true && behaviour.randomTick !== undefined) {
          behaviour.randomTick(ctx, chunk.chunkX * CHUNK_SIZE_X + localX, localY, chunk.chunkZ * CHUNK_SIZE_Z + localZ, blockId);
          dispatched += 1;
        } else {
          skippedNonRandom += 1;
        }
      }
    }

    this.metrics = {
      chunksConsidered,
      positionsSampled,
      dispatched,
      skippedNonRandom,
      budgetDeferrals,
      durationMs: performance.now() - start,
    };
    return this.metrics;
  }

  /** Shared world RNG entry point for deterministic Beta block decisions. */
  public nextInt(bound: number): number {
    return this.random.nextInt(bound);
  }

  public getMetrics(): RandomTickMetrics {
    return this.metrics;
  }
}
