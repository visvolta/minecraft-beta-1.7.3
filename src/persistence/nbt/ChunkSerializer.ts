import { Chunk } from '../../world/Chunk.ts';
import { nbt, type NbtCompound, type NbtTag } from './Nbt.ts';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../world/chunkConstants.ts';

export class ChunkSerializer {
  public static encodeChunk(chunk: Chunk, lastUpdate: bigint): NbtCompound {
    const blocks = new Uint8Array(32768);
    const metadata = new Uint8Array(16384);
    const skyLight = new Uint8Array(16384);
    const blockLight = new Uint8Array(16384);
    const heightMap = new Uint8Array(256);

    const chunkBlocks = chunk.copyBlocks();
    const chunkMeta = chunk.copyMetadata();
    const chunkLight = chunk.copyLight();

    let chunkHeight = chunk.copyHeightmap();
    if (!chunkHeight) {
      chunk.recomputeHeightmap();
      chunkHeight = chunk.copyHeightmap()!;
    }

    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        heightMap[(z << 4) | x] = chunkHeight[z * CHUNK_SIZE_X + x]!;
        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const tsIndex = x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
          const betaIndex = (x << 11) | (z << 7) | y;

          blocks[betaIndex] = chunkBlocks[tsIndex]!;

          const halfIndex = betaIndex >> 1;
          const shift = (betaIndex & 1) * 4;

          metadata[halfIndex] = (metadata[halfIndex]! & ~(0x0F << shift)) | ((chunkMeta[tsIndex]! & 0x0F) << shift);

          const l = chunkLight[tsIndex]!;
          const sLight = l & 0x0F;
          const bLight = (l >> 4) & 0x0F;

          skyLight[halfIndex] = (skyLight[halfIndex]! & ~(0x0F << shift)) | (sLight << shift);
          blockLight[halfIndex] = (blockLight[halfIndex]! & ~(0x0F << shift)) | (bLight << shift);
        }
      }
    }

    const scheduledTicksList: NbtTag[] = [];
    const ticks = chunk.getScheduledTicks().getEntries();

    for (const tick of ticks) {
      const tickCompound = new Map<string, NbtTag>();
      tickCompound.set('x', nbt.int(tick.localX));
      tickCompound.set('y', nbt.int(tick.localY));
      tickCompound.set('z', nbt.int(tick.localZ));
      tickCompound.set('id', nbt.int(tick.blockId));
      tickCompound.set('time', nbt.int(tick.dueTick));
      tickCompound.set('seq', nbt.int(tick.sequence));
      scheduledTicksList.push(nbt.compound(tickCompound));
    }

    const levelMap = new Map<string, NbtTag>();
    levelMap.set('xPos', nbt.int(chunk.chunkX));
    levelMap.set('zPos', nbt.int(chunk.chunkZ));
    levelMap.set('LastUpdate', nbt.long(lastUpdate));
    levelMap.set('Blocks', nbt.bytes(blocks));
    levelMap.set('Data', nbt.bytes(metadata));
    levelMap.set('SkyLight', nbt.bytes(skyLight));
    levelMap.set('BlockLight', nbt.bytes(blockLight));
    levelMap.set('HeightMap', nbt.bytes(heightMap));
    levelMap.set('TerrainPopulated', nbt.byte(1));
    levelMap.set('Entities', nbt.list('compound', []));
    levelMap.set('TileEntities', nbt.list('compound', []));
    levelMap.set('TileTicks', nbt.list('compound', scheduledTicksList));

    const rootMap = new Map<string, NbtTag>();
    rootMap.set('Level', nbt.compound(levelMap));

    return nbt.compound(rootMap);
  }

  public static decodeChunk(compound: NbtCompound): Chunk {
    const levelTag = compound.value.get('Level');
    if (levelTag?.type !== 'compound') {
      throw new Error('Chunk missing Level compound');
    }

    const level = levelTag.value;
    const xPosTag = level.get('xPos');
    const zPosTag = level.get('zPos');
    const blocksTag = level.get('Blocks');

    if (xPosTag?.type !== 'int' || zPosTag?.type !== 'int' || blocksTag?.type !== 'byteArray') {
      throw new Error('Chunk missing critical layout properties (xPos, zPos, Blocks)');
    }

    const chunk = new Chunk(xPosTag.value, zPosTag.value);

    const tsBlocks = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);
    const tsMeta = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);
    const tsLight = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);
    const tsHeight = new Int16Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);

    const betaBlocks = blocksTag.value;
    const dataTag = level.get('Data');
    const betaData = dataTag?.type === 'byteArray' ? dataTag.value : new Uint8Array(16384);

    const skyLightTag = level.get('SkyLight');
    const betaSkyLight = skyLightTag?.type === 'byteArray' ? skyLightTag.value : new Uint8Array(16384);

    const blockLightTag = level.get('BlockLight');
    const betaBlockLight = blockLightTag?.type === 'byteArray' ? blockLightTag.value : new Uint8Array(16384);

    const heightMapTag = level.get('HeightMap');
    const betaHeightMap = heightMapTag?.type === 'byteArray' ? heightMapTag.value : new Uint8Array(256);

    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        tsHeight[z * CHUNK_SIZE_X + x] = betaHeightMap[(z << 4) | x]!;
        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const tsIndex = x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
          const betaIndex = (x << 11) | (z << 7) | y;

          tsBlocks[tsIndex] = betaBlocks[betaIndex]!;

          const halfIndex = betaIndex >> 1;
          const shift = (betaIndex & 1) * 4;

          const meta = (betaData[halfIndex]! >> shift) & 0x0F;
          tsMeta[tsIndex] = meta;

          const sLight = (betaSkyLight[halfIndex]! >> shift) & 0x0F;
          const bLight = (betaBlockLight[halfIndex]! >> shift) & 0x0F;

          tsLight[tsIndex] = sLight | (bLight << 4);
        }
      }
    }

    chunk.loadGeneratedBlocks(tsBlocks);
    chunk.loadGeneratedMetadata(tsMeta);
    chunk.loadLightData(tsLight);
    chunk.loadHeightmap(tsHeight);
    chunk.setTerrainPopulated(true);

    const tileTicksTag = level.get('TileTicks');
    if (tileTicksTag?.type === 'list' && tileTicksTag.elementType === 'compound') {
      for (const t of tileTicksTag.value) {
        if (t.type === 'compound') {
          const x = t.value.get('x');
          const y = t.value.get('y');
          const z = t.value.get('z');
          const id = t.value.get('id');
          const time = t.value.get('time');
          const seq = t.value.get('seq');
          if (x?.type === 'int' && y?.type === 'int' && z?.type === 'int' && id?.type === 'int' && time?.type === 'int' && seq?.type === 'int') {
            chunk.getScheduledTicks().schedule(x.value, y.value, z.value, id.value, time.value, seq.value);
          }
        }
      }
    }

    chunk.markClean();
    return chunk;
  }
}
