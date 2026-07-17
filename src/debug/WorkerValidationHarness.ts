import * as THREE from 'three';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { registerDefaultBlocks } from '../blocks/registerDefaultBlocks';
import { Chunk } from '../world/Chunk';
import { BetaWorldGenerator } from '../world/generation/BetaWorldGenerator';
import { blockIdBlocksWeather } from '../world/weather/WeatherBlocking';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { ChunkManager } from '../world/ChunkManager';
import { LightEngine } from '../world/generation/lighting/LightEngine';
import { ChunkMesher } from '../rendering/ChunkMesher';
import type { TextureAtlas } from '../assets/TextureAtlas';
import type { ChunkGenerationJob, ChunkGenerationResult, ChunkWorkerError } from '../world/streaming/ChunkJobTypes';
import type { ChunkMeshJob, ChunkMeshResult, ChunkMeshWorkerError, MeshAttributeBuffers } from '../rendering/meshing/ChunkMeshJobTypes';

const VALIDATION_CHUNKS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 2], [-3, -1], [4, -5], [8, 8], [-8, 7], [12, -12], [13, -12], [12, -13],
];

interface ValidationResult {
  readonly ok: boolean;
  readonly message: string;
}

function compareBytes(a: Uint8Array, b: Uint8Array, chunkX: number, chunkZ: number): string | null {
  if (a.length !== b.length) return `length mismatch ${a.length} !== ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const y = Math.floor(i / (CHUNK_SIZE_X * CHUNK_SIZE_Z));
    const rem = i - y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
    const z = Math.floor(rem / CHUNK_SIZE_X);
    const x = rem - z * CHUNK_SIZE_X;
    return `block mismatch at chunk ${chunkX},${chunkZ} local ${x},${y},${z} index ${i}: sync=${a[i]} worker=${b[i]}`;
  }
  return null;
}

export class WorkerValidationHarness {
  private readonly registry = new BlockRegistry();

  public constructor(private readonly worldSeed: bigint, private readonly atlas: TextureAtlas | null = null) {
    registerDefaultBlocks(this.registry);
  }

  public async validateGenerationWorker(): Promise<ValidationResult> {
    for (const [chunkX, chunkZ] of VALIDATION_CHUNKS) {
      const sync = this.generateSync(chunkX, chunkZ);
      const workerResult = await this.generateWorker(chunkX, chunkZ);
      const mismatch = compareBytes(sync.copyBlocks(), workerResult.blocks, chunkX, chunkZ);
      if (mismatch !== null) return { ok: false, message: mismatch };
      const metadataMismatch = compareBytes(sync.copyMetadata(), workerResult.metadata, chunkX, chunkZ);
      if (metadataMismatch !== null) return { ok: false, message: `metadata ${metadataMismatch}` };

      const workerChunk = new Chunk(chunkX, chunkZ);
      workerChunk.loadGeneratedBlocks(workerResult.blocks);
      workerChunk.loadGeneratedMetadata(workerResult.metadata);
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const sh = sync.getHeight(x, z);
          const wh = workerChunk.getHeight(x, z);
          if (sh !== wh) return { ok: false, message: `height mismatch ${chunkX},${chunkZ} ${x},${z}: ${sh} !== ${wh}` };
          const sp = sync.getPrecipitationHeight(x, z, (id) => blockIdBlocksWeather(this.registry, id));
          const wp = workerChunk.getPrecipitationHeight(x, z, (id) => blockIdBlocksWeather(this.registry, id));
          if (sp !== wp) return { ok: false, message: `precipitation height mismatch ${chunkX},${chunkZ} ${x},${z}: ${sp} !== ${wp}` };
        }
      }
    }
    return { ok: true, message: `Generation worker matched sync generation for ${VALIDATION_CHUNKS.length} chunks.` };
  }

  public async validateMeshWorker(): Promise<ValidationResult> {
    if (this.atlas === null) return { ok: false, message: 'Mesh validation requires a real TextureAtlas.' };
    const manager = new ChunkManager();
    const generator = new BetaWorldGenerator(this.worldSeed);
    const light = new LightEngine(manager, this.registry);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = manager.getOrCreateChunk(dx, dz);
        generator.populate(chunk);
        light.initializeChunkLighting(chunk);
        light.reconcileChunkBorders(chunk);
        chunk.markClean();
      }
    }
    const target = manager.getChunk(0, 0)!;
    const mesher = new ChunkMesher(manager, this.registry, this.atlas);
    const expected = [mesher.build(target), mesher.buildWater(target), mesher.buildLava(target), mesher.buildCutouts(target)];
    const result = await this.meshWorker(manager, target);
    const actual = [result.terrain, result.water, result.lava, result.cutout];
    const names = ['terrain', 'water', 'lava', 'cutout'];
    for (let i = 0; i < expected.length; i++) {
      const mismatch = this.compareGeometry(expected[i]!, actual[i]!, names[i]!);
      expected[i]!.dispose();
      if (mismatch !== null) return { ok: false, message: mismatch };
    }
    return { ok: true, message: 'Mesh worker matched synchronous mesh output for validation chunk 0,0.' };
  }

  private generateSync(chunkX: number, chunkZ: number): Chunk {
    const chunk = new Chunk(chunkX, chunkZ);
    new BetaWorldGenerator(this.worldSeed).populate(chunk);
    return chunk;
  }

  private compareGeometry(expected: THREE.BufferGeometry, actual: MeshAttributeBuffers, label: string): string | null {
    const checks: Array<[string, Float32Array, Float32Array, number]> = [
      ['position', expected.getAttribute('position')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.positions), 1e-6],
      ['normal', expected.getAttribute('normal')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.normals), 1e-6],
      ['uv', expected.getAttribute('uv')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.uvs), 1e-6],
      ['normalColor', expected.getAttribute('normalColor')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.normalColors), 1e-5],
      ['debugColor', expected.getAttribute('debugColor')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.debugColors), 1e-5],
      ['aoColor', expected.getAttribute('aoColor')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.aoColors), 1e-5],
      ['tintColor', expected.getAttribute('tintColor')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.tintColors), 1e-5],
      ['skyLightLevel', expected.getAttribute('skyLightLevel')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.skyLightLevels), 0],
      ['blockLightLevel', expected.getAttribute('blockLightLevel')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.blockLightLevels), 0],
      ['aoFactorScalar', expected.getAttribute('aoFactorScalar')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.aoFactorScalars), 1e-5],
      ['faceBrightness', expected.getAttribute('faceBrightness')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.faceBrightness), 1e-5],
      ['fluidTextureKind', expected.getAttribute('fluidTextureKind')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.fluidTextureKinds), 0],
      ['fluidFrameUv', expected.getAttribute('fluidFrameUv')?.array as Float32Array ?? new Float32Array(), new Float32Array(actual.fluidFrameUvs), 1e-6],
    ];
    for (const [name, a, b, epsilon] of checks) {
      if (a.length !== b.length) return `${label}.${name} length mismatch ${a.length} !== ${b.length}`;
      for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i]!) || !Number.isFinite(b[i]!)) return `${label}.${name}[${i}] is non-finite`;
        const diff = Math.abs(a[i]! - b[i]!);
        if (diff > epsilon) return `${label}.${name}[${i}] mismatch: sync=${a[i]} worker=${b[i]} diff=${diff}`;
      }
    }
    const expectedVertexCount = expected.getAttribute('position')?.count ?? 0;
    if (expectedVertexCount !== actual.vertexCount) return `${label}.vertexCount mismatch ${expectedVertexCount} !== ${actual.vertexCount}`;
    const expectedIndex = expected.getIndex()?.array as ArrayLike<number> | undefined;
    const expectedIndices = expectedIndex === undefined ? new Uint32Array() : new Uint32Array(expectedIndex);
    const actualIndices = new Uint32Array(actual.indices);
    if (expectedIndices.length !== actualIndices.length) return `${label}.indices length mismatch ${expectedIndices.length} !== ${actualIndices.length}`;
    for (let i = 0; i < expectedIndices.length; i++) {
      if (expectedIndices[i] !== actualIndices[i]) return `${label}.indices[${i}] mismatch: ${expectedIndices[i]} !== ${actualIndices[i]}`;
    }
    return null;
  }

  private meshWorker(manager: ChunkManager, target: Chunk): Promise<ChunkMeshResult> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/chunkMeshingWorker.ts', import.meta.url), { type: 'module' });
      worker.onerror = (): void => {
        worker.terminate();
        reject(new Error('mesh worker failed'));
      };
      worker.onmessage = (event: MessageEvent<ChunkMeshResult | ChunkMeshWorkerError>): void => {
        worker.terminate();
        const message = event.data;
        if (message.type === 'meshError') reject(new Error(message.message));
        else resolve(message);
      };
      const chunks = [];
      for (const chunk of manager) {
        const blocks = chunk.copyBlocks();
        const metadata = chunk.copyMetadata();
        const light = chunk.copyLight();
        chunks.push({
          chunkX: chunk.chunkX,
          chunkZ: chunk.chunkZ,
          revision: chunk.getRevision(),
          blocks: blocks.buffer as ArrayBuffer,
          metadata: metadata.buffer as ArrayBuffer,
          light: light.buffer as ArrayBuffer,
        });
      }
      const job: ChunkMeshJob = {
        type: 'mesh',
        jobId: 1,
        targetChunkX: target.chunkX,
        targetChunkZ: target.chunkZ,
        targetRevision: target.getRevision(),
        chunks,
        atlasUvs: this.atlas!.getAllUvRects().map(([name, rect]) => ({ name, rect })),
      };
      worker.postMessage(job, chunks.flatMap((chunk) => [chunk.blocks, chunk.metadata, chunk.light]));
    });
  }

  private generateWorker(chunkX: number, chunkZ: number): Promise<{ blocks: Uint8Array; metadata: Uint8Array }> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/chunkGenerationWorker.ts', import.meta.url), { type: 'module' });
      worker.onerror = (): void => {
        worker.terminate();
        reject(new Error(`generation worker failed for ${chunkX},${chunkZ}`));
      };
      worker.onmessage = (event: MessageEvent<ChunkGenerationResult | ChunkWorkerError>): void => {
        worker.terminate();
        const message = event.data;
        if (message.type === 'error') {
          reject(new Error(message.message));
          return;
        }
        resolve({ blocks: new Uint8Array(message.blocks), metadata: new Uint8Array(message.metadata) });
      };
      const job: ChunkGenerationJob = {
        type: 'generate',
        jobId: 1,
        chunkX,
        chunkZ,
        seed: this.worldSeed.toString(),
      };
      worker.postMessage(job);
    });
  }
}
