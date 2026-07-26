import * as THREE from 'three';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { registerDefaultBlocks } from '../blocks/registerDefaultBlocks';
import { ChunkManager } from '../world/ChunkManager';
import { ChunkMesher } from '../rendering/ChunkMesher';
import type { AtlasUvRect } from '../assets/TextureAtlas';
import { VegetationColorProvider } from '../world/generation/climate/VegetationColors';
import { ChunkPassMask, computeChunkPassMask, hasChunkPass } from '../rendering/meshing/ChunkPassMask';
import type {
  ChunkMeshResult,
  ChunkMeshWorkerError,
  MeshAttributeBuffers,
  ChunkMeshWorkerMessage,
  PopulatedMeshAttributeBuffers,
} from '../rendering/meshing/ChunkMeshJobTypes';

const registry = new BlockRegistry();
registerDefaultBlocks(registry);

class WorkerAtlas {
  private readonly uvs = new Map<string, AtlasUvRect>();
  public set(entries: readonly { name: string; rect: AtlasUvRect }[]): void {
    this.uvs.clear();
    for (const entry of entries) {
      this.uvs.set(entry.name, entry.rect);
    }
  }
  public getUvRect(name: string): AtlasUvRect | undefined {
    return this.uvs.get(name);
  }
}

const atlas = new WorkerAtlas();

function ownArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength) {
    return view.buffer as ArrayBuffer;
  }
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

function attributeBuffer(geometry: THREE.BufferGeometry, name: string): ArrayBuffer {
  const attribute = geometry.getAttribute(name);
  if (attribute === undefined) {
    return new Float32Array().buffer;
  }
  return ownArrayBuffer(attribute.array as ArrayBufferView);
}

function extractGeometry(geometry: THREE.BufferGeometry): MeshAttributeBuffers {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  const vertexCount = position?.count ?? 0;
  const indexCount = index?.count ?? 0;
  if (vertexCount === 0 || indexCount === 0) return createEmptyMeshAttributeBuffers();
  return {
    positions: attributeBuffer(geometry, 'position'),
    normals: attributeBuffer(geometry, 'normal'),
    uvs: attributeBuffer(geometry, 'uv'),
    normalColors: attributeBuffer(geometry, 'normalColor'),
    debugColors: attributeBuffer(geometry, 'debugColor'),
    aoColors: attributeBuffer(geometry, 'aoColor'),
    tintColors: attributeBuffer(geometry, 'tintColor'),
    skyLightLevels: attributeBuffer(geometry, 'skyLightLevel'),
    blockLightLevels: attributeBuffer(geometry, 'blockLightLevel'),
    aoFactorScalars: attributeBuffer(geometry, 'aoFactorScalar'),
    faceBrightness: attributeBuffer(geometry, 'faceBrightness'),
    fluidTextureKinds: attributeBuffer(geometry, 'fluidTextureKind'),
    fluidFrameUvs: attributeBuffer(geometry, 'fluidFrameUv'),
    indices: index === null ? new Uint32Array().buffer : ownArrayBuffer(index.array as ArrayBufferView),
    indexType: index !== null && index.array instanceof Uint16Array ? 'uint16' : 'uint32',
    vertexCount,
    indexCount,
  };
}

function createEmptyMeshAttributeBuffers(): MeshAttributeBuffers {
  return { empty: true, vertexCount: 0, indexCount: 0 };
}

function isPopulatedMesh(mesh: MeshAttributeBuffers): mesh is PopulatedMeshAttributeBuffers {
  return mesh.empty !== true;
}

function transferList(result: ChunkMeshResult): Transferable[] {
  const list: Transferable[] = [];
  for (const mesh of [result.terrain, result.water, result.lava, result.cutout, result.fire, result.translucent]) {
    if (!isPopulatedMesh(mesh)) continue;
    list.push(
      mesh.positions,
      mesh.normals,
      mesh.uvs,
      mesh.normalColors,
      mesh.debugColors,
      mesh.aoColors,
      mesh.tintColors,
      mesh.skyLightLevels,
      mesh.blockLightLevels,
      mesh.aoFactorScalars,
      mesh.faceBrightness,
      mesh.fluidTextureKinds,
      mesh.fluidFrameUvs,
      mesh.indices,
    );
  }
  return list;
}

let workerWorldSeed: string | null = null;
let workerVegetationColors: VegetationColorProvider | null = null;
const workerManager = new ChunkManager();

const workerSelf = self as unknown as {
  onmessage: ((event: MessageEvent<ChunkMeshWorkerMessage>) => void) | null;
  postMessage: (message: ChunkMeshResult | ChunkMeshWorkerError, transfer?: Transferable[]) => void;
};

workerSelf.onmessage = (event: MessageEvent<ChunkMeshWorkerMessage>): void => {
  const job = event.data;
  if (job.type === 'init') {
    workerManager.clear();
    atlas.set(job.atlasUvs);
    workerWorldSeed = job.worldSeed;
    workerVegetationColors = new VegetationColorProvider(BigInt(job.worldSeed));
    return;
  }
  if (job.type !== 'mesh') return;

  try {
    const start = performance.now();
    for (const snapshot of job.chunks) {
      const chunk = workerManager.getOrCreateChunk(snapshot.chunkX, snapshot.chunkZ);
      chunk.loadGeneratedBlocks(new Uint8Array(snapshot.blocks));
      chunk.loadGeneratedMetadata(new Uint8Array(snapshot.metadata));
      chunk.loadLightData(new Uint8Array(snapshot.light));
      chunk.markClean();
    }

    for (const chunk of workerManager) {
      if (Math.abs(chunk.chunkX - job.targetChunkX) > 1 || Math.abs(chunk.chunkZ - job.targetChunkZ) > 1) {
        workerManager.removeChunk(chunk.chunkX, chunk.chunkZ);
      }
    }

    const target = workerManager.getChunk(job.targetChunkX, job.targetChunkZ);
    if (target === undefined) {
      throw new Error(`Missing target chunk ${job.targetChunkX},${job.targetChunkZ}`);
    }

    if (job.atlasUvs !== undefined) atlas.set(job.atlasUvs);
    const seed = job.worldSeed ?? workerWorldSeed;
    if (seed === null) throw new Error('Chunk meshing worker received mesh job before init.');
    if (workerVegetationColors === null || workerWorldSeed !== seed) {
      workerWorldSeed = seed;
      workerVegetationColors = new VegetationColorProvider(BigInt(seed));
    }
    const mesher = new ChunkMesher(workerManager, registry, atlas as never, workerVegetationColors);
    const mask = computeChunkPassMask(target.getBlockDataView(), registry);
    const terrainGeometry = hasChunkPass(mask, ChunkPassMask.Terrain) ? mesher.build(target) : null;
    const waterGeometry = hasChunkPass(mask, ChunkPassMask.Water) ? mesher.buildWater(target) : null;
    const lavaGeometry = hasChunkPass(mask, ChunkPassMask.Lava) ? mesher.buildLava(target) : null;
    const cutoutGeometry = hasChunkPass(mask, ChunkPassMask.Cutout) ? mesher.buildCutouts(target) : null;
    const fireGeometry = hasChunkPass(mask, ChunkPassMask.Fire) ? mesher.buildFires(target) : null;
    const translucentGeometry = hasChunkPass(mask, ChunkPassMask.Translucent) ? mesher.buildTranslucent(target) : null;

    const result: ChunkMeshResult = {
      type: 'meshResult',
      jobId: job.jobId,
      chunkX: job.targetChunkX,
      chunkZ: job.targetChunkZ,
      targetRevision: job.targetRevision,
      terrain: terrainGeometry ? extractGeometry(terrainGeometry) : createEmptyMeshAttributeBuffers(),
      water: waterGeometry ? extractGeometry(waterGeometry) : createEmptyMeshAttributeBuffers(),
      lava: lavaGeometry ? extractGeometry(lavaGeometry) : createEmptyMeshAttributeBuffers(),
      cutout: cutoutGeometry ? extractGeometry(cutoutGeometry) : createEmptyMeshAttributeBuffers(),
      fire: fireGeometry ? extractGeometry(fireGeometry) : createEmptyMeshAttributeBuffers(),
      translucent: translucentGeometry ? extractGeometry(translucentGeometry) : createEmptyMeshAttributeBuffers(),
      durationMs: performance.now() - start,
    };
    terrainGeometry?.dispose();
    waterGeometry?.dispose();
    lavaGeometry?.dispose();
    cutoutGeometry?.dispose();
    fireGeometry?.dispose();
    translucentGeometry?.dispose();
    workerSelf.postMessage(result, transferList(result));
  } catch (error) {
    workerSelf.postMessage({
      type: 'meshError',
      jobId: job.jobId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
