import type { BlockId } from '../../../blocks/BlockId';
import type { BlockRegistry } from '../../../blocks/BlockRegistry';
import { resolveLightEmission } from '../../../blocks/BlockDefinition';
import { packLight } from './LightValue';
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
 * Light is stored exactly as `Chunk` stores it: one byte per cell, SKYLIGHT in
 * the LOW nibble and BLOCKLIGHT in the HIGH nibble.
 *
 * That nibble order is not arbitrary — it is dictated by `Chunk.getSkylight`
 * (`light & 0x0F`) and `Chunk.getBlocklight` (`light >> 4`). Packing them the
 * other way round silently swaps the two channels: open sky reads back as
 * blocklight 15 / skylight 0, so freshly generated chunks render black until
 * an unrelated block edit makes LightEngine rewrite the bytes correctly.
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
  /** Beta gameplay emission level (0..15), i.e. max(R,G,B) of the seed. */
  readonly emission: Uint8Array;
  /** Per-channel emission seeds (0..15), derived from the registry tint. */
  readonly emissionR: Uint8Array;
  readonly emissionG: Uint8Array;
  readonly emissionB: Uint8Array;
}

/** Builds the opacity/emission LUTs from a block registry. */
export function buildLightLookupTables(registry: BlockRegistry): LightLookupTables {
  const opacity = new Uint8Array(256);
  const emission = new Uint8Array(256);
  const emissionR = new Uint8Array(256);
  const emissionG = new Uint8Array(256);
  const emissionB = new Uint8Array(256);

  for (let id = 0; id < 256; id++) {
    if (id === AIR_BLOCK_ID) continue;
    const definition = registry.getById(id as BlockId);
    if (definition === undefined) {
      // Unknown ids behave as fully opaque, matching LightEngine.getOpacity.
      opacity[id] = MAX_LIGHT;
      continue;
    }
    opacity[id] = definition.lightOpacity ?? (definition.solid ? MAX_LIGHT : 0);
    // The registry is authoritative for BOTH the Beta level and the tint; no
    // per-block colour constants exist in the light engine.
    const resolved = resolveLightEmission(definition.lightEmission);
    emission[id] = resolved.level;
    emissionR[id] = Math.round(resolved.level * resolved.color[0]);
    emissionG[id] = Math.round(resolved.level * resolved.color[1]);
    emissionB[id] = Math.round(resolved.level * resolved.color[2]);
  }

  return { opacity, emission, emissionR, emissionG, emissionB };
}

/**
 * Blocks that do NOT raise the heightmap.
 *
 * Must stay in step with `Chunk.NON_OPAQUE_FOR_HEIGHTMAP`. Beta expresses the
 * same idea as `Block.lightOpacity[id] == 0` in `generateSkylightMap`; water is
 * the load-bearing case, since it attenuates light (opacity 3) yet leaves the
 * heightmap alone, which is why an ocean surface is lit 15 and not 12.
 */
const HEIGHTMAP_TRANSPARENT = new Set<number>([
  AIR_BLOCK_ID,
  8, 9,    // water (flowing, still)
  10, 11,  // lava (flowing, still)
  37, 38,  // dandelion, rose
  39, 40,  // brown/red mushroom
  31,      // tall grass
  32,      // dead bush
  83,      // sugar cane / reed
]);

function raisesHeightmap(blockId: number): boolean {
  return !HEIGHTMAP_TRANSPARENT.has(blockId);
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
 * @returns Packed light words (Uint16Array): sky, red, green, blue per `LightValue.packLight`.
 */
export function computeInitialChunkLight(
  blocks: Uint8Array,
  tables: LightLookupTables,
  options: InitialLightOptions = {},
  out?: Uint16Array,
): Uint16Array {
  const hasSkyLight = options.hasSkyLight ?? true;
  const light = out ?? new Uint16Array(CHUNK_VOLUME);
  light.fill(0);

  const { opacity, emission, emissionR, emissionG, emissionB } = tables;
  const sky = new Uint8Array(CHUNK_VOLUME);
  // One buffer per block-light channel. They share a single queue pass below,
  // and any channel with no sources at all is skipped entirely.
  const red = new Uint8Array(CHUNK_VOLUME);
  const green = new Uint8Array(CHUNK_VOLUME);
  const blue = new Uint8Array(CHUNK_VOLUME);

  // Packed chunk-local indices; a single Int32Array queue with a read head
  // avoids both per-node object allocation and world-coordinate triples.
  const queue = new Int32Array(CHUNK_VOLUME);
  let queueHead = 0;
  let queueTail = 0;

  // ---- 1. Vertical skylight projection -------------------------------------
  // Skipped entirely for no-sky dimensions.
  //
  // Mirrors Beta `Chunk.generateSkylightMap`: find the heightmap (the first
  // cell from the top whose block has NON-ZERO light opacity), give everything
  // at or above it full sunlight, then attenuate downward.
  //
  // Using the heightmap rather than "first non-transparent cell" is what makes
  // an ocean surface read 15 instead of 12: water has opacity 3 but does not
  // raise the heightmap, exactly as Beta's `lightOpacity[water] == 0` check in
  // the heightmap loop. The main-thread LightEngine already works this way, so
  // matching it here keeps the worker and main-thread paths bit-identical.
  if (hasSkyLight) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        // Beta: walk down while the block below is heightmap-transparent.
        let height = CHUNK_SIZE_Y;
        while (height > 0 && !raisesHeightmap(blocks[cellIndex(x, height - 1, z)]!)) {
          height -= 1;
        }

        // At/above the heightmap: full sunlight.
        for (let y = CHUNK_SIZE_Y - 1; y >= height; y--) {
          sky[cellIndex(x, y, z)] = MAX_LIGHT;
        }

        // The heightmap cell itself seeds horizontal spread into overhangs.
        if (height < CHUNK_SIZE_Y) queue[queueTail++] = cellIndex(x, height, z);

        // Below the heightmap: attenuate by opacity, minimum one level per
        // block so light cannot travel downward forever through transparent
        // blocks.
        let current = MAX_LIGHT;
        for (let y = height - 1; y >= 0; y--) {
          const index = cellIndex(x, y, z);
          current -= Math.max(1, opacity[blocks[index]!]!);
          if (current < 0) current = 0;
          sky[index] = current;
          if (current > 0) queue[queueTail++] = index;
        }
      }
    }

    propagate(sky, blocks, opacity, queue, queueHead, queueTail);
  }

  // ---- 2. Block-light sources (per channel) -------------------------------
  // Seed all three channels in one sweep, tracking which ones actually have
  // any source so an unused channel costs nothing (a red torch, for example,
  // seeds essentially only red).
  let anyRed = false;
  let anyGreen = false;
  let anyBlue = false;
  for (let index = 0; index < CHUNK_VOLUME; index++) {
    const id = blocks[index]!;
    if (emission[id]! === 0) continue;
    const r = emissionR[id]!;
    const g = emissionG[id]!;
    const b = emissionB[id]!;
    if (r > 0) { red[index] = r; anyRed = true; }
    if (g > 0) { green[index] = g; anyGreen = true; }
    if (b > 0) { blue[index] = b; anyBlue = true; }
  }

  const propagateChannel = (levels: Uint8Array): void => {
    let tail = 0;
    for (let index = 0; index < CHUNK_VOLUME; index++) {
      if (levels[index]! > 0) queue[tail++] = index;
    }
    propagate(levels, blocks, opacity, queue, 0, tail);
  };
  if (anyRed) propagateChannel(red);
  if (anyGreen) propagateChannel(green);
  if (anyBlue) propagateChannel(blue);

  // ---- 3. Pack ------------------------------------------------------------
  // Layout is owned by LightValue; this uses packLight rather than open-coding
  // shifts so the format lives in exactly one place.
  for (let index = 0; index < CHUNK_VOLUME; index++) {
    light[index] = packLight(sky[index]!, red[index]!, green[index]!, blue[index]!);
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
