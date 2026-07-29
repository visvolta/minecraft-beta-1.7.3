import { BlockRegistry } from '../blocks/BlockRegistry';
import { registerDefaultBlocks } from '../blocks/registerDefaultBlocks';
import { ChunkManager } from '../world/ChunkManager';
import { ChunkMesher } from '../rendering/ChunkMesher';
import type { AtlasUvRect } from '../assets/TextureAtlas';
import { VegetationColorProvider } from '../world/generation/climate/VegetationColors';
import type {
  ChunkMeshResult,
  ChunkMeshWorkerError,
  ChunkMeshWorkerMessage,
} from '../rendering/meshing/ChunkMeshJobTypes';
import {
  extractGeometryBuffers,
  transferListForBuffers,
  isPopulatedMeshAttributeBuffers,
} from '../rendering/meshing/ChunkMeshTransfer';

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

/**
 * Collects every ArrayBuffer the populated passes must move to the main thread.
 * Delegated to the shared transfer module so the transfer list can never drift
 * from the attribute set that {@link extractGeometryBuffers} produces.
 */
function transferList(result: ChunkMeshResult): Transferable[] {
  const list: Transferable[] = [];
  for (const mesh of [result.terrain, result.water, result.lava, result.cutout, result.leaves, result.fire, result.translucent, result.portal]) {
    if (!isPopulatedMeshAttributeBuffers(mesh)) continue;
    list.push(...transferListForBuffers(mesh));
  }
  return list;
}

let workerWorldSeed: string | null = null;
let workerVegetationColors: VegetationColorProvider | null = null;
const workerManager = new ChunkManager();
let sharedMesher: ChunkMesher | null = null;
function getMesher(seed: string): ChunkMesher {
  if (sharedMesher === null || workerWorldSeed !== seed) {
    workerWorldSeed = seed;
    workerVegetationColors = new VegetationColorProvider(BigInt(seed));
    sharedMesher = new ChunkMesher(workerManager, registry, atlas as never, workerVegetationColors);
  }
  return sharedMesher;
}


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
      chunk.loadLightData(new Uint16Array(snapshot.light));
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
    const mesher = getMesher(seed);
    mesher.beginBuild();
    // Single-pass classify-and-emit (one voxel walk).
    const passes = mesher.buildAllPasses(target);
    const result: ChunkMeshResult = {
      type: 'meshResult',
      jobId: job.jobId,
      chunkX: job.targetChunkX,
      chunkZ: job.targetChunkZ,
      targetRevision: job.targetRevision,
      terrain: extractGeometryBuffers(passes.terrain),
      water: extractGeometryBuffers(passes.water),
      lava: extractGeometryBuffers(passes.lava),
      cutout: extractGeometryBuffers(passes.cutout),
      leaves: extractGeometryBuffers(passes.leaves),
      fire: extractGeometryBuffers(passes.fire),
      translucent: extractGeometryBuffers(passes.translucent),
      portal: extractGeometryBuffers(passes.portal),
      durationMs: performance.now() - start,
      voxelVisits: mesher.lastVoxelVisits,
    };
    passes.terrain.dispose();
    passes.water.dispose();
    passes.lava.dispose();
    passes.cutout.dispose();
    passes.leaves.dispose();
    passes.fire.dispose();
    passes.translucent.dispose();
    passes.portal.dispose();
    workerSelf.postMessage(result, transferList(result));
  } catch (error) {
    workerSelf.postMessage({
      type: 'meshError',
      jobId: job.jobId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
