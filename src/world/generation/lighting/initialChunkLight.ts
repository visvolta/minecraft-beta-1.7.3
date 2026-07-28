import type { BlockId } from '../../../blocks/BlockId';
import type { BlockRegistry } from '../../../blocks/BlockRegistry';
import {
  AIR_BLOCK_ID,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  CHUNK_VOLUME,
} from '../../chunkConstants';

/**
 * Self-contained initial chunk lighting.
 *
 * This is the SINGLE initial-light algorithm in the project. It is pure and
 * free of browser/Three.js/world-manager dependencies so the identical code
 * can run inside the generation worker (where it belongs, off the main
 * thread) and on the main thread (as the reference used to validate the
 * worker, and as a fallback when workers are disabled).
 *
 * Scope is deliberately chunk-local: it computes the lighting a chunk would
 * have in isolation. Cross-chunk correctness is still the main-thread
 * LightEngine's job via `reconcileChunkBorders`, and every runtime block edit
 * continues to go through LightEngine. Splitting it this way keeps one
 * deterministic algorithm rather than two divergent implementations.
 *
 * Light is stored exactly as `Chunk` stores it: one byte per cell, skylight in
 * the high nibble, blocklight in the low nibble.
 */

/** Maximum Beta light level. */
export const MAX_LIGHT = 15;

/**
 * Per-block opacity and emission lookup tables, indexed by block id.
 *
 * Building these once removes a registry lookup plus optional-field
 * resolution from the innermost BFS loop, which is the hottest path in
 * initial lighting.
 */
export interface LightLookupTables {
  /** Light absorbed when passing through this block (0..15). */
  readonly opacity: Uint8Array;
  /** Light emitted by this block (0..15). */
  readonly emission: Uint8Array;
}

/** Builds the opacity/emission LUTs from a block registry. */
export function buildLightLookupTables(registry: BlockRegistry): LightLookupTables {
  const opacity = new Uint8Array(256);
  const emission = new Uint8Array(256);

  for (let id = 0; id < 256; id++) {
    if (id === AIR_BLOCK_ID) continue;
    const definition = registry.getById(id as BlockId);
    if (definition === undefined) {
      // Unknown ids behave as fully opaque, matching LightEngine.getOpacity.
      opacity[id] = MAX_LIGHT;
      continue;
    }
    opacity[id] = definition.lightOpacity ?? (definition.solid ? MAX_LIGHT : 0);
    emission[id] = definition.lightEmission ?? 0;
  }

  return { opacity, emission };
}

/** XZY index used by Chunk storage: x fastest, then z, then y. */
function cellIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
}

/**
 * Dimension lighting rules consumed by the shared initial-light pass.
 *
 * Only `hasSkyLight` affects propagation. The dimension's ambient brightness
 * floor is deliberately NOT accepted here: it is a rendering/light-table
 * concept, and injecting it as propagated light would incorrectly illuminate
 * sealed caves.
 */
export interface InitialLightOptions {
  /** False for dimensions with no sky (Beta `WorldProvider.hasNoSky`). */
  readonly hasSkyLight?: boolean;
}

/**
 * Computes chunk-local initial skylight and blocklight for `blocks`.
 *
 * When the dimension has no skylight the entire sky projection is skipped —
 * both correct (the Nether has no sun) and cheaper than filling zeros. Block
 * light from lava, glowstone, fire, portals and any other emissive block
 * still propagates normally.
 *
 * @param blocks Chunk block ids in XZY order (length CHUNK_VOLUME).
 * @param tables Opacity/emission LUTs from {@link buildLightLookupTables}.
 * @param options Dimension lighting rules; defaults to a sky-lit dimension.
 * @param out Optional destination buffer to fill (length CHUNK_VOLUME).
 * @returns Packed light bytes: skylight in the high nibble, blocklight in the low nibble.
 */
export function computeInitialChunkLight(
  blocks: Uint8Array,
  tables: LightLookupTables,
  options: InitialLightOptions = {},
  out?: Uint8Array,
): Uint8Array {
  const hasSkyLight = options.hasSkyLight ?? true;
  const light = out ?? new Uint8Array(CHUNK_VOLUME);
  light.fill(0);

  const { opacity, emission } = tables;
  const sky = new Uint8Array(CHUNK_VOLUME);
  const block = new Uint8Array(CHUNK_VOLUME);

  // Packed chunk-local indices; a single Int32Array queue with a read head
  // avoids both per-node object allocation and world-coordinate triples.
  const queue = new Int32Array(CHUNK_VOLUME);
  let queueHead = 0;
  let queueTail = 0;

  // ---- 1. Vertical skylight projection -------------------------------------
  // Skipped entirely for no-sky dimensions.
  if (hasSkyLight) {
  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      let current = MAX_LIGHT;
      for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
        const index = cellIndex(x, y, z);
        const blockOpacity = opacity[blocks[index]!]!;

        if (current === MAX_LIGHT && blockOpacity === 0) {
          // Still in open sky.
          sky[index] = MAX_LIGHT;
          // Column cells with a horizontal neighbour to spread into are seeded
          // below once the whole column is known; seeding every open-sky cell
          // would enqueue the entire sky volume.
          continue;
        }

        current -= blockOpacity > 0 ? Math.max(1, blockOpacity) : 1;
        if (current < 0) current = 0;
        sky[index] = current;
        if (current > 0) {
          queue[queueTail++] = index;
        }
      }
    }
  }

  // Seed the lowest open-sky cell of each column so sunlight can spread
  // horizontally into overhangs and cave mouths.
  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
        const index = cellIndex(x, y, z);
        if (sky[index] !== MAX_LIGHT) break;
        const below = y > 0 ? cellIndex(x, y - 1, z) : -1;
        if (below < 0 || sky[below] !== MAX_LIGHT) {
          queue[queueTail++] = index;
          break;
        }
      }
    }
  }

  propagate(sky, blocks, opacity, queue, queueHead, queueTail);
  }

  // ---- 2. Block-light sources ---------------------------------------------
  queueHead = 0;
  queueTail = 0;
  for (let index = 0; index < CHUNK_VOLUME; index++) {
    const emitted = emission[blocks[index]!]!;
    if (emitted > 0) {
      block[index] = emitted;
      queue[queueTail++] = index;
    }
  }
  propagate(block, blocks, opacity, queue, queueHead, queueTail);

  // ---- 3. Pack into Chunk's nibble layout ---------------------------------
  for (let index = 0; index < CHUNK_VOLUME; index++) {
    light[index] = ((sky[index]! & 0xf) << 4) | (block[index]! & 0xf);
  }

  return light;
}

/**
 * Flood-fill propagation over chunk-local cells.
 *
 * Chunk-local by design: light leaving the chunk is handled by the main
 * thread's border reconciliation, so no neighbour chunk data is required and
 * the result is identical regardless of neighbour generation order.
 */
function propagate(
  levels: Uint8Array,
  blocks: Uint8Array,
  opacity: Uint8Array,
  queue: Int32Array,
  head: number,
  tail: number,
): void {
  // The queue can outgrow its initial CHUNK_VOLUME allocation, so spill into a
  // plain array only when needed (rare).
  const overflow: number[] = [];
  const push = (index: number): void => {
    if (tail < queue.length) queue[tail++] = index;
    else overflow.push(index);
  };

  let overflowHead = 0;
  for (;;) {
    let index: number;
    if (head < tail) index = queue[head++]!;
    else if (overflowHead < overflow.length) index = overflow[overflowHead++]!;
    else break;

    const level = levels[index]!;
    if (level <= 1) continue;

    const y = Math.floor(index / (CHUNK_SIZE_X * CHUNK_SIZE_Z));
    const remainder = index - y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
    const z = Math.floor(remainder / CHUNK_SIZE_X);
    const x = remainder - z * CHUNK_SIZE_X;

    spread(levels, blocks, opacity, x - 1, y, z, level, push);
    spread(levels, blocks, opacity, x + 1, y, z, level, push);
    spread(levels, blocks, opacity, x, y - 1, z, level, push);
    spread(levels, blocks, opacity, x, y + 1, z, level, push);
    spread(levels, blocks, opacity, x, y, z - 1, level, push);
    spread(levels, blocks, opacity, x, y, z + 1, level, push);
  }
}

function spread(
  levels: Uint8Array,
  blocks: Uint8Array,
  opacity: Uint8Array,
  x: number,
  y: number,
  z: number,
  sourceLevel: number,
  push: (index: number) => void,
): void {
  if (x < 0 || x >= CHUNK_SIZE_X || y < 0 || y >= CHUNK_SIZE_Y || z < 0 || z >= CHUNK_SIZE_Z) return;

  const index = cellIndex(x, y, z);
  const blockOpacity = opacity[blocks[index]!]!;
  const next = sourceLevel - Math.max(1, blockOpacity);
  if (next <= 0) return;
  if (levels[index]! >= next) return;

  levels[index] = next;
  push(index);
}
