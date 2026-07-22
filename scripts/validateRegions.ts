import { Chunk } from '../src/world/Chunk.ts';
import { ChunkSerializer } from '../src/persistence/nbt/ChunkSerializer.ts';
import { RegionStorage } from '../src/persistence/region/RegionStorage.ts';
import { MemoryWorldStorage } from '../src/persistence/storage/WorldStorage.ts';
import { encodeNbt } from '../src/persistence/nbt/NbtCodec.ts';
import { RegionCorruptionError } from '../src/persistence/region/RegionCorruptionError.ts';

async function main() {
  function assert(v: boolean, m: string) { if (!v) { console.error('Failed:', m); process.exit(1); } }

  const chunk = new Chunk(1, -2);
  chunk.setBlock(0, 0, 0, 1);
  chunk.setBlock(15, 127, 15, 2);
  chunk.setBlockMetadata(0, 0, 0, 15);
  chunk.setSkylight(0, 0, 0, 15);
  chunk.setBlocklight(15, 127, 15, 10);
  chunk.getScheduledTicks().schedule(0, 0, 0, 1, 100, 1);

  const nbt = ChunkSerializer.encodeChunk(chunk, 100n);
  const encodedBytes = encodeNbt(nbt, '');
  assert(encodedBytes.length > 0, 'encodes correctly');

  const level = nbt.value.get('Level') as any;
  const keys = [...level.value.keys()];
  assert(keys.join(',') === 'xPos,zPos,LastUpdate,Blocks,Data,SkyLight,BlockLight,HeightMap,TerrainPopulated,Entities,TileEntities,TileTicks', 'Strict byte order for NBT properties');

  const restored = ChunkSerializer.decodeChunk(nbt, 500);
  assert(restored.getBlock(0, 0, 0) === 1, 'block 0,0,0 restored');
  assert(restored.getBlock(15, 127, 15) === 2, 'block 15,127,15 restored');
  assert(restored.getBlockMetadata(0, 0, 0) === 15, 'metadata restored');
  assert(restored.getSkylight(0, 0, 0) === 15, 'skylight restored');
  assert(restored.getBlocklight(15, 127, 15) === 10, 'blocklight restored');
  assert(restored.getHeight(0, 0) === 1, 'heightmap implicitly restored');

  const ticks = restored.getScheduledTicks().drainAll();
  assert(ticks.length === 1 && ticks[0]!.dueTick === 500, 'scheduled ticks persist as remaining delay relative to restored simulation tick');

  const mem = new MemoryWorldStorage();
  const region = await RegionStorage.open(mem, 'world1', 0, 0);

  const chunkData = new Uint8Array(100);
  chunkData.fill(42);
  await region.setChunkData(0, 0, chunkData, 12345);
  const readData = await region.getChunkData(0, 0);
  assert(readData !== undefined && readData[0] === 42 && readData.length === 100, 'chunk data round trips through region storage');

  const raw = (region as any).codec.getRawBuffer();
  raw[4096 * 2 + 4] = 99;

  let threw = false;
  try {
    await region.getChunkData(0, 0);
  } catch (err: any) {
    threw = true;
    assert(err instanceof RegionCorruptionError, 'Throws typed corruption error');
    assert(err.rawBytes !== undefined, 'Retains raw bytes');
  }
  assert(threw, 'Threw on unknown version');

  console.log('Region validation passed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
