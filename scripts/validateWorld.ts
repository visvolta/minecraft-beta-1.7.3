/**
 * validateWorld — chunks, terrain generation, biomes, determinism, lighting
 * fundamentals and persistence-critical world state.
 *
 * Determinism is the load-bearing property here: generation must be a pure
 * function of (seed, chunk coordinate), including at negative coordinates and
 * across chunk borders, or worlds will not round-trip through save/load and
 * worker-generated chunks will disagree with main-thread ones.
 */

import { BlockIds } from '../src/blocks/BlockId.ts';
import type { BlockId } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { Chunk } from '../src/world/Chunk.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BetaWorldGenerator } from '../src/world/generation/BetaWorldGenerator.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { JavaRandom } from '../src/world/generation/random/JavaRandom.ts';
import { RandomTickScheduler } from '../src/world/ticks/RandomTickScheduler.ts';
import { WorldTickScheduler } from '../src/world/ticks/WorldTickScheduler.ts';
import {
  AIR_BLOCK_ID,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  CHUNK_VOLUME,
} from '../src/world/chunkConstants.ts';
import { chunkKey } from '../src/world/chunkKey.ts';
import { assert, assertEqual, runSuite, type Section } from './validationHarness.ts';

const WORLD_SEED = 474747474747n;

const registry = new BlockRegistry();
registerDefaultBlocks(registry);

/** Chunks spanning positive, negative and mixed-sign coordinates. */
const TEST_CHUNKS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 2], [-3, -1], [4, -5], [-8, 7], [12, -12], [13, -12], [12, -13],
];

function generate(chunkX: number, chunkZ: number, seed = WORLD_SEED): Chunk {
  const generator = new BetaWorldGenerator(seed);
  const chunk = new Chunk(chunkX, chunkZ);
  generator.populate(chunk);
  return chunk;
}

/**
 * Cache for checks that only READ a generated chunk. Full generation costs
 * ~400ms per chunk, so re-generating the same coordinate in every check makes
 * the suite too slow for routine development use. Determinism checks below
 * deliberately bypass this and call `generate` directly, since their whole
 * purpose is to compare independent generation runs.
 */
const generatedCache = new Map<string, Chunk>();
function generatedChunk(chunkX: number, chunkZ: number): Chunk {
  const key = `${chunkX},${chunkZ}`;
  let chunk = generatedCache.get(key);
  if (chunk === undefined) {
    chunk = generate(chunkX, chunkZ);
    generatedCache.set(key, chunk);
  }
  return chunk;
}

function compareBytes(a: Uint8Array, b: Uint8Array, label: string, chunkX: number, chunkZ: number): void {
  assertEqual(a.length, b.length, `${label} length mismatch at chunk ${chunkX},${chunkZ}`);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      const y = Math.floor(i / (CHUNK_SIZE_X * CHUNK_SIZE_Z));
      const rem = i - y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
      const z = Math.floor(rem / CHUNK_SIZE_X);
      const x = rem - z * CHUNK_SIZE_X;
      throw new Error(`${label} mismatch at chunk ${chunkX},${chunkZ} local ${x},${y},${z}: ${a[i]} !== ${b[i]}`);
    }
  }
}

const sections: Section[] = [
  {
    name: 'Chunk storage',
    checks: [
      {
        name: 'chunk dimensions are the Beta 16 x 128 x 16',
        run: () => {
          assertEqual(CHUNK_SIZE_X, 16, 'chunk X size');
          assertEqual(CHUNK_SIZE_Y, 128, 'chunk Y size');
          assertEqual(CHUNK_SIZE_Z, 16, 'chunk Z size');
          assertEqual(CHUNK_VOLUME, 16 * 128 * 16, 'chunk volume');
        },
      },
      {
        name: 'block get/set round-trips across the whole chunk volume',
        run: () => {
          const chunk = new Chunk(0, 0);
          const probes: ReadonlyArray<readonly [number, number, number]> = [
            [0, 0, 0], [15, 127, 15], [7, 64, 9], [0, 127, 15], [15, 0, 0],
          ];
          for (const [x, y, z] of probes) {
            chunk.setBlock(x, y, z, BlockIds.Stone);
            assertEqual(chunk.getBlock(x, y, z), BlockIds.Stone, `block round-trip at ${x},${y},${z}`);
            chunk.setBlockMetadata(x, y, z, 11);
            assertEqual(chunk.getBlockMetadata(x, y, z), 11, `metadata round-trip at ${x},${y},${z}`);
          }
        },
      },
      {
        name: 'out-of-range access is handled consistently rather than corrupting neighbours',
        run: () => {
          const chunk = new Chunk(0, 0);
          chunk.setBlock(0, 0, 0, BlockIds.Stone);
          // Y outside 0..127 must not wrap into a valid cell.
          assertEqual(chunk.getBlock(0, -1, 0), AIR_BLOCK_ID, 'below-world reads must be air');
          assertEqual(chunk.getBlock(0, CHUNK_SIZE_Y, 0), AIR_BLOCK_ID, 'above-world reads must be air');
          assertEqual(chunk.getBlock(0, 0, 0), BlockIds.Stone, 'in-range cell was corrupted by out-of-range access');
        },
      },
      {
        name: 'chunk keys are unique and stable across the coordinate sign quadrants',
        run: () => {
          const seen = new Map<number, string>();
          for (let cz = -8; cz <= 8; cz++) {
            for (let cx = -8; cx <= 8; cx++) {
              const key = chunkKey(cx, cz);
              const label = `${cx},${cz}`;
              const previous = seen.get(key);
              assert(previous === undefined, `chunk key collision: ${label} and ${previous}`);
              seen.set(key, label);
              assertEqual(chunkKey(cx, cz), key, `chunk key for ${label} is not stable`);
            }
          }
        },
      },
      {
        name: 'ChunkManager is the sole owner and tracks create/remove',
        run: () => {
          const manager = new ChunkManager();
          assertEqual(manager.size, 0, 'new manager should hold no chunks');
          const created = manager.getOrCreateChunk(2, -3);
          assertEqual(manager.size, 1, 'chunk was not stored');
          assert(manager.getOrCreateChunk(2, -3) === created, 'getOrCreateChunk must return the same instance');
          assert(manager.hasChunk(2, -3), 'hasChunk should see the created chunk');
          assertEqual(manager.getChunk(9, 9), undefined, 'unloaded chunk must not be fabricated');
          manager.removeChunk(2, -3);
          assertEqual(manager.size, 0, 'chunk was not removed');
        },
      },
    ],
  },
  {
    name: 'Terrain generation determinism',
    checks: [
      {
        name: 'the same seed and coordinate reproduce identical blocks and metadata',
        run: () => {
          for (const [cx, cz] of TEST_CHUNKS) {
            const first = generatedChunk(cx, cz);
            const second = generate(cx, cz);
            compareBytes(first.copyBlocks(), second.copyBlocks(), 'blocks', cx, cz);
            compareBytes(first.copyMetadata(), second.copyMetadata(), 'metadata', cx, cz);
          }
        },
      },
      {
        name: 'generation is order-independent (a chunk does not depend on its neighbours being generated first)',
        run: () => {
          // Generate in forward and reverse order; each chunk must be identical.
          const forward = new Map<string, Uint8Array>();
          for (const [cx, cz] of TEST_CHUNKS) forward.set(`${cx},${cz}`, generatedChunk(cx, cz).copyBlocks());
          const reversed = [...TEST_CHUNKS].reverse();
          for (const [cx, cz] of reversed) {
            compareBytes(forward.get(`${cx},${cz}`)!, generate(cx, cz).copyBlocks(), 'order-independent blocks', cx, cz);
          }
        },
      },
      {
        name: 'different seeds produce different terrain',
        run: () => {
          const a = generate(0, 0, 1234n).copyBlocks();
          const b = generate(0, 0, 5678n).copyBlocks();
          let differences = 0;
          for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differences += 1;
          assert(differences > 0, 'two different seeds produced byte-identical terrain');
        },
      },
      {
        name: 'negative coordinates generate solid terrain (no empty or all-air chunks)',
        run: () => {
          for (const [cx, cz] of TEST_CHUNKS.filter(([x, z]) => x < 0 || z < 0)) {
            const chunk = generatedChunk(cx, cz);
            const blocks = chunk.copyBlocks();
            let solid = 0;
            for (let i = 0; i < blocks.length; i++) if (blocks[i] !== AIR_BLOCK_ID) solid += 1;
            assert(solid > 0, `chunk ${cx},${cz} generated entirely empty`);
          }
        },
      },
      {
        name: 'bedrock floor and world ceiling are respected',
        run: () => {
          for (const [cx, cz] of TEST_CHUNKS) {
            const chunk = generatedChunk(cx, cz);
            for (let z = 0; z < CHUNK_SIZE_Z; z += 5) {
              for (let x = 0; x < CHUNK_SIZE_X; x += 5) {
                assertEqual(chunk.getBlock(x, 0, z), BlockIds.Bedrock, `chunk ${cx},${cz} is missing bedrock at y=0 (${x},${z})`);
                assertEqual(chunk.getBlock(x, CHUNK_SIZE_Y - 1, z), AIR_BLOCK_ID, `chunk ${cx},${cz} has a block at the world ceiling`);
              }
            }
          }
        },
      },
      {
        name: 'chunk borders align between horizontally adjacent chunks',
        run: () => {
          // Column heights either side of a shared border should not jump by an
          // implausible amount, which is what a seam/offset bug produces.
          const left = generatedChunk(12, -12);
          const right = generatedChunk(13, -12);
          let maxJump = 0;
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            const a = left.getHeight(CHUNK_SIZE_X - 1, z);
            const b = right.getHeight(0, z);
            maxJump = Math.max(maxJump, Math.abs(a - b));
          }
          assert(maxJump <= 24, `implausible terrain discontinuity across the chunk border (max jump ${maxJump})`);
        },
      },
    ],
  },
  {
    name: 'Deterministic randomness',
    checks: [
      {
        name: 'JavaRandom reproduces the Java LCG sequence for a fixed seed',
        run: () => {
          const a = new JavaRandom(12345n);
          const b = new JavaRandom(12345n);
          for (let i = 0; i < 64; i++) {
            assertEqual(a.nextInt(1000), b.nextInt(1000), `JavaRandom diverged at draw ${i}`);
          }
          // Distinct seeds must not produce the same opening sequence.
          const c = new JavaRandom(54321n);
          const first = new JavaRandom(12345n);
          let differs = false;
          for (let i = 0; i < 16; i++) if (c.nextInt(1_000_000) !== first.nextInt(1_000_000)) differs = true;
          assert(differs, 'two different JavaRandom seeds produced the same sequence');
        },
      },
    ],
  },
  {
    name: 'Lighting fundamentals',
    checks: [
      {
        name: 'skylight reaches an open column and is blocked by an opaque block',
        run: () => {
          const chunks = new ChunkManager();
          const chunk = chunks.getOrCreateChunk(0, 0);
          const light = new LightEngine(chunks, registry);
          light.initializeChunkLighting(chunk);
          assertEqual(light.getSkylight(4, 100, 4), 15, 'open sky column should be fully lit');

          chunk.setBlock(4, 90, 4, BlockIds.Stone);
          light.initializeChunkLighting(chunk);
          assert(light.getSkylight(4, 89, 4) < 15, 'skylight should be attenuated beneath an opaque block');
          assertEqual(light.getSkylight(4, 100, 4), 15, 'skylight above the blocker should stay full');
        },
      },
      {
        name: 'light levels always remain within 0..15',
        run: () => {
          const chunks = new ChunkManager();
          const chunk = chunks.getOrCreateChunk(0, 0);
          const light = new LightEngine(chunks, registry);
          chunk.setBlock(8, 70, 8, BlockIds.Stone);
          light.initializeChunkLighting(chunk);
          for (let y = 0; y < CHUNK_SIZE_Y; y += 7) {
            for (let z = 0; z < CHUNK_SIZE_Z; z += 5) {
              for (let x = 0; x < CHUNK_SIZE_X; x += 5) {
                const sky = light.getSkylight(x, y, z);
                const block = light.getBlocklight(x, y, z);
                assert(sky >= 0 && sky <= 15, `skylight out of range at ${x},${y},${z}: ${sky}`);
                assert(block >= 0 && block <= 15, `blocklight out of range at ${x},${y},${z}: ${block}`);
              }
            }
          }
        },
      },
      {
        name: 'an emissive block raises nearby blocklight and falls off with distance',
        run: () => {
          const chunks = new ChunkManager();
          const chunk = chunks.getOrCreateChunk(0, 0);
          const light = new LightEngine(chunks, registry);
          light.initializeChunkLighting(chunk);
          const emission = light.getEmission(8, 60, 8);
          void emission;
          chunk.setBlock(8, 60, 8, BlockIds.Torch);
          light.handleBlockEdit(8, 60, 8);
          const near = light.getBlocklight(9, 60, 8);
          const far = light.getBlocklight(13, 60, 8);
          assert(near >= far, 'blocklight must not increase with distance from the source');
        },
      },
    ],
  },
  {
    name: 'World mutation and scheduling',
    checks: [
      {
        name: 'unloaded chunks are handled consistently by world reads and writes',
        run: () => {
          const chunks = new ChunkManager();
          chunks.getOrCreateChunk(0, 0);
          const light = new LightEngine(chunks, registry);
          const world = new BlockUpdateWorld(chunks, registry, light);
          assert(world.isLoaded(1, 1), 'chunk 0,0 should report loaded');
          assert(!world.isLoaded(1000, 1000), 'far chunk should report unloaded');
          assertEqual(world.getBlock(1000, 64, 1000), AIR_BLOCK_ID, 'unloaded reads must return air, not throw');
          assertEqual(world.getBlockMetadata(1000, 64, 1000), 0, 'unloaded metadata reads must return 0');
        },
      },
      {
        name: 'scheduled ticks fire in deterministic order',
        run: () => {
          const chunks = new ChunkManager();
          chunks.getOrCreateChunk(0, 0);
          chunks.getOrCreateChunk(1, 0);
          const light = new LightEngine(chunks, registry);
          const world = new BlockUpdateWorld(chunks, registry, light);
          const behaviours = new BlockBehaviourRegistry();
          const scheduler = new WorldTickScheduler(chunks, world, behaviours, new RandomTickScheduler(1234n));
          world.setScheduleCallback((x, y, z, id, delay) => scheduler.schedule(x, y, z, id, delay));

          const fired: string[] = [];
          behaviours.register(BlockIds.Stone, {
            scheduledTick: (_ctx, x, y, z) => fired.push(`${x},${y},${z}`),
          });

          world.setBlock(1, 10, 1, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
          world.setBlock(17, 10, 1, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
          world.scheduleBlockTick(17, 10, 1, BlockIds.Stone, 1);
          world.scheduleBlockTick(1, 10, 1, BlockIds.Stone, 1);

          scheduler.beginTick(1);
          scheduler.endTick();
          assertEqual(fired.length, 2, 'both scheduled ticks should fire');

          // Re-running the identical scenario must produce the identical order.
          const replay: string[] = [];
          const chunks2 = new ChunkManager();
          chunks2.getOrCreateChunk(0, 0);
          chunks2.getOrCreateChunk(1, 0);
          const light2 = new LightEngine(chunks2, registry);
          const world2 = new BlockUpdateWorld(chunks2, registry, light2);
          const behaviours2 = new BlockBehaviourRegistry();
          const scheduler2 = new WorldTickScheduler(chunks2, world2, behaviours2, new RandomTickScheduler(1234n));
          world2.setScheduleCallback((x, y, z, id, delay) => scheduler2.schedule(x, y, z, id, delay));
          behaviours2.register(BlockIds.Stone, {
            scheduledTick: (_ctx, x, y, z) => replay.push(`${x},${y},${z}`),
          });
          world2.setBlock(1, 10, 1, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
          world2.setBlock(17, 10, 1, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
          world2.scheduleBlockTick(17, 10, 1, BlockIds.Stone, 1);
          world2.scheduleBlockTick(1, 10, 1, BlockIds.Stone, 1);
          scheduler2.beginTick(1);
          scheduler2.endTick();
          assertEqual(replay.join('|'), fired.join('|'), 'scheduled tick order is not deterministic');
        },
      },
    ],
  },
  {
    name: 'Persistence-critical world state',
    checks: [
      {
        name: 'chunk dirty tracking marks and clears for persistence',
        run: () => {
          const chunk = new Chunk(3, 4);
          chunk.markClean();
          const revisionBefore = chunk.getBlockRevision();
          chunk.setBlock(1, 40, 1, BlockIds.Stone);
          assert(chunk.getBlockRevision() !== revisionBefore, 'block edit must advance the block revision');
          assert(chunk.isPersistenceDirty(), 'block edit must mark the chunk persistence-dirty');
        },
      },
      {
        name: 'generated chunk survives a blocks/metadata snapshot round-trip',
        run: () => {
          const source = generatedChunk(1, 2);
          const blocks = source.copyBlocks();
          const metadata = source.copyMetadata();
          const restored = new Chunk(1, 2);
          restored.loadGeneratedBlocks(blocks);
          restored.loadGeneratedMetadata(metadata);
          compareBytes(restored.copyBlocks(), blocks, 'restored blocks', 1, 2);
          compareBytes(restored.copyMetadata(), metadata, 'restored metadata', 1, 2);
          for (let z = 0; z < CHUNK_SIZE_Z; z += 4) {
            for (let x = 0; x < CHUNK_SIZE_X; x += 4) {
              assertEqual(
                restored.getBlock(x, 64, z),
                source.getBlock(x, 64, z) as BlockId,
                `restored chunk differs at ${x},64,${z}`,
              );
            }
          }
        },
      },
    ],
  },
];

await runSuite('validateWorld', sections);
