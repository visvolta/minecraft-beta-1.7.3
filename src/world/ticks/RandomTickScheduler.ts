import type { ChunkManager } from '../ChunkManager';
import type { BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';
import { JavaRandom } from '../generation/random/JavaRandom';

export interface RandomTickMetrics {
  readonly chunksConsidered: number;
  readonly sectionsConsidered: number;
  readonly positionsSampled: number;
  readonly dispatched: number;
  readonly skippedNonRandom: number;
  readonly budgetDeferrals: number;
  readonly durationMs: number;
}

const SECTION_SIZE = 16;
const SECTIONS_Y = CHUNK_SIZE_Y / SECTION_SIZE; // 8 for 128 height
const RANDOM_TICKS_PER_SECTION = 3; // Beta modern: 3 per 16x16x16 section → 24 per chunk, closer to Beta's 80 per chunk tickOnLoad
const MAX_RANDOM_SAMPLES_PER_GAME_TICK = 4096; // increased from 512 to allow many chunks * sections

export class RandomTickScheduler {
  private readonly random: JavaRandom;
  private metrics: RandomTickMetrics = {
    chunksConsidered: 0,
    sectionsConsidered: 0,
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
    let sectionsConsidered = 0;
    let positionsSampled = 0;
    let dispatched = 0;
    let skippedNonRandom = 0;
    let budgetDeferrals = 0;

    for (const chunk of chunkManager) {
      chunksConsidered += 1;
      for (let sectionY = 0; sectionY < SECTIONS_Y; sectionY++) {
        sectionsConsidered += 1;
        const sectionBaseY = sectionY * SECTION_SIZE;
        for (let i = 0; i < RANDOM_TICKS_PER_SECTION; i++) {
          if (positionsSampled >= MAX_RANDOM_SAMPLES_PER_GAME_TICK) {
            budgetDeferrals += 1;
            break;
          }
          const localX = this.random.nextInt(CHUNK_SIZE_X);
          const localY = sectionBaseY + this.random.nextInt(SECTION_SIZE);
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
        if (positionsSampled >= MAX_RANDOM_SAMPLES_PER_GAME_TICK) break;
      }
    }

    this.metrics = {
      chunksConsidered,
      sectionsConsidered,
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
