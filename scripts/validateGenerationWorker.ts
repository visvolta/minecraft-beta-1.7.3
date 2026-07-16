import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { Chunk } from '../src/world/Chunk.ts';
import { BetaWorldGenerator } from '../src/world/generation/BetaWorldGenerator.ts';
import { blockIdBlocksWeather } from '../src/world/weather/WeatherBlocking.ts';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/world/chunkConstants.ts';

const WORLD_SEED = 474747474747n;
const TEST_CHUNKS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 2],
  [-3, -1],
  [4, -5],
  [8, 8],
  [-8, 7],
  [12, -12],
  [13, -12],
  [12, -13],
];

const registry = new BlockRegistry();
registerDefaultBlocks(registry);

function generate(chunkX: number, chunkZ: number): Chunk {
  const generator = new BetaWorldGenerator(WORLD_SEED);
  const chunk = new Chunk(chunkX, chunkZ);
  generator.populate(chunk);
  return chunk;
}

function fail(message: string): never {
  throw new Error(message);
}

function compareBytes(a: Uint8Array, b: Uint8Array, label: string, chunkX: number, chunkZ: number): void {
  if (a.length !== b.length) fail(`${label} length mismatch at ${chunkX},${chunkZ}: ${a.length} !== ${b.length}`);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      const y = Math.floor(i / (CHUNK_SIZE_X * CHUNK_SIZE_Z));
      const rem = i - y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
      const z = Math.floor(rem / CHUNK_SIZE_X);
      const x = rem - z * CHUNK_SIZE_X;
      fail(`${label} mismatch at chunk ${chunkX},${chunkZ} local ${x},${y},${z} index ${i}: ${a[i]} !== ${b[i]}`);
    }
  }
}

function compareDerivedHeights(a: Chunk, b: Chunk): void {
  for (let z = 0; z < CHUNK_SIZE_Z; z++) {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      const ah = a.getHeight(x, z);
      const bh = b.getHeight(x, z);
      if (ah !== bh) fail(`heightmap mismatch at chunk ${a.chunkX},${a.chunkZ} local ${x},${z}: ${ah} !== ${bh}`);
      const ap = a.getPrecipitationHeight(x, z, (id) => blockIdBlocksWeather(registry, id));
      const bp = b.getPrecipitationHeight(x, z, (id) => blockIdBlocksWeather(registry, id));
      if (ap !== bp) fail(`precipitation height mismatch at chunk ${a.chunkX},${a.chunkZ} local ${x},${z}: ${ap} !== ${bp}`);
    }
  }
}

for (const [chunkX, chunkZ] of TEST_CHUNKS) {
  const expected = generate(chunkX, chunkZ);
  const actual = generate(chunkX, chunkZ);
  compareBytes(expected.copyBlocks(), actual.copyBlocks(), 'blocks', chunkX, chunkZ);
  compareDerivedHeights(expected, actual);
  console.log(`OK generation deterministic: ${chunkX},${chunkZ}`);
}

console.log(`Generation deterministic validation passed for ${TEST_CHUNKS.length} chunks.`);
