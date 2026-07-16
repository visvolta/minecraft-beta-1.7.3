import * as THREE from 'three';
import type { TextureAtlas } from '../../assets/TextureAtlas';
import type { Chunk } from '../../world/Chunk';
import type { ChunkManager } from '../../world/ChunkManager';
import { getWorkerCount, isWorkerFeatureEnabled } from '../../world/streaming/WorkerFeatureFlags';
import type { ChunkMeshJob, ChunkMeshResult, MeshAttributeBuffers } from './ChunkMeshJobTypes';

interface PendingMeshJob {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly priority: number;
}

interface ActiveMeshJob {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly targetRevision: number;
  readonly worker: Worker;
}

export interface ChunkMeshQueueStats {
  readonly queued: number;
  readonly pendingUploads: number;
  readonly activeWorkers: number;
  readonly completed: number;
  readonly stale: number;
  readonly errors: number;
  readonly averageDurationMs: number;
  readonly maxDurationMs: number;
  readonly uploadTimeMs: number;
  readonly workerCount: number;
}

export interface ChunkMeshGeometrySet {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly targetRevision: number;
  readonly terrain: THREE.BufferGeometry;
  readonly fluid: THREE.BufferGeometry;
  readonly cutout: THREE.BufferGeometry;
}

function key(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

function geometryFromBuffers(buffers: MeshAttributeBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(buffers.positions), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(buffers.normals), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(buffers.uvs), 2));
  geometry.setAttribute('normalColor', new THREE.Float32BufferAttribute(new Float32Array(buffers.normalColors), 3));
  geometry.setAttribute('debugColor', new THREE.Float32BufferAttribute(new Float32Array(buffers.debugColors), 3));
  geometry.setAttribute('aoColor', new THREE.Float32BufferAttribute(new Float32Array(buffers.aoColors), 3));
  geometry.setAttribute('tintColor', new THREE.Float32BufferAttribute(new Float32Array(buffers.tintColors), 3));
  geometry.setAttribute('skyLightLevel', new THREE.Float32BufferAttribute(new Float32Array(buffers.skyLightLevels), 1));
  geometry.setAttribute('blockLightLevel', new THREE.Float32BufferAttribute(new Float32Array(buffers.blockLightLevels), 1));
  geometry.setAttribute('aoFactorScalar', new THREE.Float32BufferAttribute(new Float32Array(buffers.aoFactorScalars), 1));
  geometry.setAttribute('fluidTextureKind', new THREE.Float32BufferAttribute(new Float32Array(buffers.fluidTextureKinds), 1));
  geometry.setAttribute('fluidFrameUv', new THREE.Float32BufferAttribute(new Float32Array(buffers.fluidFrameUvs), 2));
  geometry.setAttribute('color', geometry.getAttribute('normalColor'));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffers.indices), 1));
  return geometry;
}

export class ChunkMeshingQueue {
  private readonly chunkManager: ChunkManager;
  private readonly atlas: TextureAtlas;
  private useWorkers = typeof Worker !== 'undefined' && isWorkerFeatureEnabled('meshing');
  private readonly pending = new Map<string, PendingMeshJob>();
  private readonly active = new Map<number, ActiveMeshJob>();
  private readonly workers: Worker[] = [];
  private readonly idleWorkers: Worker[] = [];
  private readonly completedResults: ChunkMeshResult[] = [];
  private readonly pendingUploads: ChunkMeshResult[] = [];
  private readonly pendingUploadKeys = new Set<string>();
  private readonly uploadedRevisions = new Map<string, number>();
  private readonly dispatchCounts = new Map<string, number>();
  private readonly staleCounts = new Map<string, number>();
  private nextJobId = 1;
  private completed = 0;
  private stale = 0;
  private errors = 0;
  private totalDuration = 0;
  private maxDuration = 0;
  private lastUploadTime = 0;

  public constructor(chunkManager: ChunkManager, atlas: TextureAtlas) {
    this.chunkManager = chunkManager;
    this.atlas = atlas;
    if (this.useWorkers) {
      try {
        for (let i = 0; i < getWorkerCount('meshing'); i++) this.spawnWorker();
      } catch {
        this.errors += 1;
        this.useWorkers = false;
        this.dispose();
      }
    }
  }

  public isWorkerEnabled(): boolean {
    return this.useWorkers;
  }

  public dispose(): void {
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    this.idleWorkers.length = 0;
    this.pending.clear();
    this.active.clear();
    this.completedResults.length = 0;
    this.pendingUploads.length = 0;
  }

  public enqueue(chunk: Chunk, priority: number): void {
    const mapKey = key(chunk.chunkX, chunk.chunkZ);
    if (this.uploadedRevisions.get(mapKey) === chunk.getRevision()) return;
    if (this.pending.has(mapKey)) return;
    for (const active of this.active.values()) {
      if (active.chunkX === chunk.chunkX && active.chunkZ === chunk.chunkZ) return;
    }
    if (this.pendingUploadKeys.has(this.revisionKey(chunk.chunkX, chunk.chunkZ, chunk.getRevision()))) return;
    this.pending.set(mapKey, { chunkX: chunk.chunkX, chunkZ: chunk.chunkZ, priority });
  }

  public cancel(chunkX: number, chunkZ: number): void {
    this.pending.delete(key(chunkX, chunkZ));
  }

  public markUploaded(chunkX: number, chunkZ: number, revision: number): void {
    this.uploadedRevisions.set(key(chunkX, chunkZ), revision);
    this.pendingUploadKeys.delete(this.revisionKey(chunkX, chunkZ, revision));
  }

  public getChunkState(chunkX: number, chunkZ: number): {
    readonly queued: boolean;
    readonly activeJobId: number | null;
    readonly pendingUploadRevisions: readonly number[];
    readonly uploadedRevision: number | null;
    readonly dispatchCount: number;
    readonly staleCount: number;
  } {
    const mapKey = key(chunkX, chunkZ);
    let activeJobId: number | null = null;
    for (const [jobId, active] of this.active) {
      if (active.chunkX === chunkX && active.chunkZ === chunkZ) activeJobId = jobId;
    }
    return {
      queued: this.pending.has(mapKey),
      activeJobId,
      pendingUploadRevisions: this.pendingUploads.filter((r) => r.chunkX === chunkX && r.chunkZ === chunkZ).map((r) => r.targetRevision),
      uploadedRevision: this.uploadedRevisions.get(mapKey) ?? null,
      dispatchCount: this.dispatchCounts.get(mapKey) ?? 0,
      staleCount: this.staleCounts.get(mapKey) ?? 0,
    };
  }

  public process(): void {
    if (!this.useWorkers) return;
    this.drainResults();
    this.dispatch();
  }

  public takeUpload(maxCount: number, maxMs: number): ChunkMeshGeometrySet[] {
    const start = performance.now();
    this.lastUploadTime = 0;
    const uploads: ChunkMeshGeometrySet[] = [];
    while (uploads.length < maxCount && this.pendingUploads.length > 0) {
      if (performance.now() - start >= maxMs) break;
      const result = this.pendingUploads.shift()!;
      const chunk = this.chunkManager.getChunk(result.chunkX, result.chunkZ);
      if (chunk === undefined || chunk.getRevision() !== result.targetRevision) {
        this.recordStale(result.chunkX, result.chunkZ);
        this.pendingUploadKeys.delete(this.revisionKey(result.chunkX, result.chunkZ, result.targetRevision));
        continue;
      }
      uploads.push({
        chunkX: result.chunkX,
        chunkZ: result.chunkZ,
        targetRevision: result.targetRevision,
        terrain: geometryFromBuffers(result.terrain),
        fluid: geometryFromBuffers(result.fluid),
        cutout: geometryFromBuffers(result.cutout),
      });
    }
    this.lastUploadTime = performance.now() - start;
    return uploads;
  }

  public getStats(): ChunkMeshQueueStats {
    return {
      queued: this.pending.size,
      pendingUploads: this.pendingUploads.length,
      activeWorkers: this.active.size,
      completed: this.completed,
      stale: this.stale,
      errors: this.errors,
      averageDurationMs: this.completed === 0 ? 0 : this.totalDuration / this.completed,
      maxDurationMs: this.maxDuration,
      uploadTimeMs: this.lastUploadTime,
      workerCount: this.workers.length,
    };
  }

  private spawnWorker(): void {
    const worker = new Worker(new URL('../../workers/chunkMeshingWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ChunkMeshResult | { type: 'meshError'; jobId: number; message: string }>): void => {
      const message = event.data;
      if (message.type === 'meshResult') {
        this.completedResults.push(message);
      } else {
        this.errors += 1;
        const active = this.active.get(message.jobId);
        this.active.delete(message.jobId);
        if (active !== undefined) {
          this.pending.set(key(active.chunkX, active.chunkZ), {
            chunkX: active.chunkX,
            chunkZ: active.chunkZ,
            priority: 0,
          });
          this.idleWorkers.push(active.worker);
        }
      }
    };
    worker.onerror = (): void => {
      this.errors += 1;
      for (const [jobId, active] of this.active) {
        if (active.worker !== worker) continue;
        this.pending.set(key(active.chunkX, active.chunkZ), {
          chunkX: active.chunkX,
          chunkZ: active.chunkZ,
          priority: 0,
        });
        this.active.delete(jobId);
      }
      this.useWorkers = false;
      for (const candidate of this.workers) candidate.terminate();
      this.workers.length = 0;
      this.idleWorkers.length = 0;
      this.active.clear();
    };
    this.workers.push(worker);
    this.idleWorkers.push(worker);
  }

  private dispatch(): void {
    while (this.idleWorkers.length > 0) {
      const next = this.takeNextPending();
      if (next === undefined) return;
      const chunk = this.chunkManager.getChunk(next.chunkX, next.chunkZ);
      if (chunk === undefined) {
        this.stale += 1;
        continue;
      }
      const worker = this.idleWorkers.pop()!;
      const jobId = this.nextJobId++;
      const revision = chunk.getRevision();
      const job = this.buildJob(jobId, chunk, revision);
      this.active.set(jobId, {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        targetRevision: revision,
        worker,
      });
      const mapKey = key(chunk.chunkX, chunk.chunkZ);
      this.dispatchCounts.set(mapKey, (this.dispatchCounts.get(mapKey) ?? 0) + 1);
      const transfers: Transferable[] = [];
      for (const snapshot of job.chunks) {
        transfers.push(snapshot.blocks, snapshot.metadata, snapshot.light);
      }
      worker.postMessage(job, transfers);
    }
  }

  private drainResults(): void {
    while (this.completedResults.length > 0) {
      const result = this.completedResults.shift()!;
      const active = this.active.get(result.jobId);
      this.active.delete(result.jobId);
      if (active !== undefined) this.idleWorkers.push(active.worker);
      const chunk = this.chunkManager.getChunk(result.chunkX, result.chunkZ);
      if (active === undefined || chunk === undefined || chunk.getRevision() !== result.targetRevision) {
        this.recordStale(result.chunkX, result.chunkZ);
        continue;
      }
      this.completed += 1;
      this.totalDuration += result.durationMs;
      this.maxDuration = Math.max(this.maxDuration, result.durationMs);
      this.removePendingUploadsForChunk(result.chunkX, result.chunkZ);
      this.pendingUploads.push(result);
      this.pendingUploadKeys.add(this.revisionKey(result.chunkX, result.chunkZ, result.targetRevision));
    }
  }

  private buildJob(jobId: number, target: Chunk, revision: number): ChunkMeshJob {
    const chunks = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunkManager.getChunk(target.chunkX + dx, target.chunkZ + dz);
        if (chunk === undefined) continue;
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
    }
    return {
      type: 'mesh',
      jobId,
      targetChunkX: target.chunkX,
      targetChunkZ: target.chunkZ,
      targetRevision: revision,
      chunks,
      atlasUvs: this.atlas.getAllUvRects().map(([name, rect]) => ({ name, rect })),
    };
  }

  private removePendingUploadsForChunk(chunkX: number, chunkZ: number): void {
    for (let i = this.pendingUploads.length - 1; i >= 0; i--) {
      const result = this.pendingUploads[i]!;
      if (result.chunkX === chunkX && result.chunkZ === chunkZ) {
        this.pendingUploadKeys.delete(this.revisionKey(result.chunkX, result.chunkZ, result.targetRevision));
        this.pendingUploads.splice(i, 1);
      }
    }
  }

  private recordStale(chunkX: number, chunkZ: number): void {
    this.stale += 1;
    const mapKey = key(chunkX, chunkZ);
    this.staleCounts.set(mapKey, (this.staleCounts.get(mapKey) ?? 0) + 1);
  }

  private revisionKey(chunkX: number, chunkZ: number, revision: number): string {
    return `${chunkX},${chunkZ}@${revision}`;
  }

  private takeNextPending(): PendingMeshJob | undefined {
    let bestKey: string | undefined;
    let best: PendingMeshJob | undefined;
    for (const [mapKey, candidate] of this.pending) {
      if (best === undefined || candidate.priority < best.priority) {
        best = candidate;
        bestKey = mapKey;
      }
    }
    if (bestKey !== undefined) this.pending.delete(bestKey);
    return best;
  }
}
