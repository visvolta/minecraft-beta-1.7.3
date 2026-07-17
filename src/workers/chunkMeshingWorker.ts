import * as THREE from 'three';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { registerDefaultBlocks } from '../blocks/registerDefaultBlocks';
import { ChunkManager } from '../world/ChunkManager';
import { ChunkMesher } from '../rendering/ChunkMesher';
import type { AtlasUvRect } from '../assets/TextureAtlas';
import type {
  ChunkMeshJob,
  ChunkMeshResult,
  ChunkMeshWorkerError,
  MeshAttributeBuffers,
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

function attributeBuffer(geometry: THREE.BufferGeometry, name: string): ArrayBuffer {
  const attribute = geometry.getAttribute(name);
  if (attribute === undefined) {
    return new Float32Array().buffer;
  }
  return attribute.array.slice().buffer as ArrayBuffer;
}

function extractGeometry(geometry: THREE.BufferGeometry): MeshAttributeBuffers {
  const index = geometry.getIndex();
  const indices = index === null ? new Uint32Array() : new Uint32Array(index.array as ArrayLike<number>);
  const position = geometry.getAttribute('position');
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
    indices: indices.buffer as ArrayBuffer,
    vertexCount: position?.count ?? 0,
    indexCount: index?.count ?? 0,
  };
}

function transferList(result: ChunkMeshResult): Transferable[] {
  const list: Transferable[] = [];
  for (const mesh of [result.terrain, result.water, result.lava, result.cutout, result.fire, result.translucent]) {
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

const workerSelf = self as unknown as {
  onmessage: ((event: MessageEvent<ChunkMeshJob>) => void) | null;
  postMessage: (message: ChunkMeshResult | ChunkMeshWorkerError, transfer?: Transferable[]) => void;
};

workerSelf.onmessage = (event: MessageEvent<ChunkMeshJob>): void => {
  const job = event.data;
  if (job.type !== 'mesh') return;

  try {
    const start = performance.now();
    const manager = new ChunkManager();
    for (const snapshot of job.chunks) {
      const chunk = manager.getOrCreateChunk(snapshot.chunkX, snapshot.chunkZ);
      chunk.loadGeneratedBlocks(new Uint8Array(snapshot.blocks));
      chunk.loadGeneratedMetadata(new Uint8Array(snapshot.metadata));
      chunk.loadLightData(new Uint8Array(snapshot.light));
      chunk.markClean();
    }

    const target = manager.getChunk(job.targetChunkX, job.targetChunkZ);
    if (target === undefined) {
      throw new Error(`Missing target chunk ${job.targetChunkX},${job.targetChunkZ}`);
    }

    const atlas = new WorkerAtlas();
    atlas.set(job.atlasUvs);
    const mesher = new ChunkMesher(manager, registry, atlas as never);
    const terrainGeometry = mesher.build(target);
    const waterGeometry = mesher.buildWater(target);
    const lavaGeometry = mesher.buildLava(target);
    const cutoutGeometry = mesher.buildCutouts(target);
    const fireGeometry = mesher.buildFires(target);
    const translucentGeometry = mesher.buildTranslucent(target);

    const result: ChunkMeshResult = {
      type: 'meshResult',
      jobId: job.jobId,
      chunkX: job.targetChunkX,
      chunkZ: job.targetChunkZ,
      targetRevision: job.targetRevision,
      terrain: extractGeometry(terrainGeometry),
      water: extractGeometry(waterGeometry),
      lava: extractGeometry(lavaGeometry),
      cutout: extractGeometry(cutoutGeometry),
      fire: extractGeometry(fireGeometry),
      translucent: extractGeometry(translucentGeometry),
      durationMs: performance.now() - start,
    };
    terrainGeometry.dispose();
    waterGeometry.dispose();
    lavaGeometry.dispose();
    cutoutGeometry.dispose();
    fireGeometry.dispose();
    translucentGeometry.dispose();
    workerSelf.postMessage(result, transferList(result));
  } catch (error) {
    workerSelf.postMessage({
      type: 'meshError',
      jobId: job.jobId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
