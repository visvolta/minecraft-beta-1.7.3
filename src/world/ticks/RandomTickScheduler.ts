import type { Chunk } from '../Chunk';
import type { ChunkManager } from '../ChunkManager';
import type { BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { BlockId } from '../../blocks/BlockId';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';
import { JavaRandom } from '../generation/random/JavaRandom';

export interface RandomTickMetrics {
  readonly chunksConsidered: number;
  readonly sectionsConsidered: number;
  readonly sectionsSkippedEmpty: number;
  readonly sectionsSkippedNoTickable: number;
  readonly positionsSampled: number;
  readonly dispatched: number;
  readonly skippedNonRandom: number;
  readonly budgetDeferrals: number;
  readonly durationMs: number;
}

const SECTION_SIZE = 16;
const SECTIONS_Y = CHUNK_SIZE_Y / SECTION_SIZE; // 8 for 128 height
const RANDOM_TICKS_PER_SECTION = 3;
const MAX_RANDOM_SAMPLES_PER_GAME_TICK = 4096;

interface SectionTickCache {
  readonly blockRevision: number;
  /** One flag per section: does it contain any random-tickable block? */
  readonly hasTickable: Uint8Array;
}

/**
 * Beta-style random block ticking.
 *
 * Beta samples a fixed number of random positions per chunk section every
 * tick. The vast majority of those samples land in sections that are entirely
 * air, or that contain no random-tickable block at all (plain stone/dirt
 * underground), so the sample is drawn, the block is read, the behaviour is
 * looked up and then discarded.
 *
 * Two exact, behaviour-preserving filters are applied before sampling:
 *
 *   1. Empty sections are skipped — a sample there could only have hit air,
 *      which has no random-tick behaviour.
 *   2. Sections containing no random-tickable block are skipped, using a
 *      per-chunk cache keyed on the chunk's block revision.
 *
 * Both skips are provably no-ops for gameplay: every position they remove
 * would have been counted in `skippedNonRandom` and dispatched nothing. Grass
 * spread, leaf decay, crops, fire, snow and ice therefore tick exactly as
 * before. The random sequence is still advanced only for sampled positions,
 * and the per-section sample count is unchanged, so Beta's average random-tick
 * rate for any given tickable block is preserved.
 *
 * The simulation radius deliberately still matches the loaded radius; that is
 * a gameplay-timing change and is not made here.
 */
export class RandomTickScheduler {
  private readonly random: JavaRandom;
  private readonly sectionCache = new WeakMap<Chunk, SectionTickCache>();
  private metrics: RandomTickMetrics = {
    chunksConsidered: 0,
    sectionsConsidered: 0,
    sectionsSkippedEmpty: 0,
    sectionsSkippedNoTickable: 0,
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
    let sectionsSkippedEmpty = 0;
    let sectionsSkippedNoTickable = 0;
    let positionsSampled = 0;
    let dispatched = 0;
    let skippedNonRandom = 0;
    let budgetDeferrals = 0;

    for (const chunk of chunkManager) {
      chunksConsidered += 1;
      const tickable = this.getSectionTickableFlags(chunk, behaviours);

      for (let sectionY = 0; sectionY < SECTIONS_Y; sectionY++) {
        if (chunk.isSectionEmpty(sectionY)) {
          sectionsSkippedEmpty += 1;
          continue;
        }
        if (tickable[sectionY] === 0) {
          sectionsSkippedNoTickable += 1;
          continue;
        }

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
      sectionsSkippedEmpty,
      sectionsSkippedNoTickable,
      positionsSampled,
      dispatched,
      skippedNonRandom,
      budgetDeferrals,
      durationMs: performance.now() - start,
    };
    return this.metrics;
  }

  /**
   * Per-section "contains a random-tickable block" flags, cached against the
   * chunk's block revision so the scan only reruns when blocks actually change.
   */
  private getSectionTickableFlags(chunk: Chunk, behaviours: BlockBehaviourRegistry): Uint8Array {
    const revision = chunk.getBlockRevision();
    const cached = this.sectionCache.get(chunk);
    if (cached !== undefined && cached.blockRevision === revision) {
      return cached.hasTickable;
    }

    const hasTickable = new Uint8Array(SECTIONS_Y);
    const blocks = chunk.getBlockDataView();
    const cellsPerLayer = CHUNK_SIZE_X * CHUNK_SIZE_Z;
    const cellsPerSection = SECTION_SIZE * cellsPerLayer;

    for (let sectionY = 0; sectionY < SECTIONS_Y; sectionY++) {
      if (chunk.isSectionEmpty(sectionY)) continue;
      const startIndex = sectionY * cellsPerSection;
      const endIndex = startIndex + cellsPerSection;
      for (let index = startIndex; index < endIndex; index++) {
        const blockId = blocks[index] as BlockId;
        if (blockId === 0) continue;
        const behaviour = behaviours.get(blockId);
        if (behaviour.randomTicks === true && behaviour.randomTick !== undefined) {
          hasTickable[sectionY] = 1;
          break;
        }
      }
    }

    this.sectionCache.set(chunk, { blockRevision: revision, hasTickable });
    return hasTickable;
  }

  /** Shared world RNG entry point for deterministic Beta block decisions. */
  public nextInt(bound: number): number {
    return this.random.nextInt(bound);
  }

  public nextLong(): bigint { return this.random.nextLong(); }

  public getMetrics(): RandomTickMetrics {
    return this.metrics;
  }
}
