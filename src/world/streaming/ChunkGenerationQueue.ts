import { Chunk } from '../Chunk';
import type { ChunkManager } from '../ChunkManager';
import type { WorldGenerator } from '../WorldGenerator';
import type { ChunkGenerationJob, ChunkGenerationResult, ChunkWorkerError } from './ChunkJobTypes';
import { getWorkerCount, isWorkerFeatureEnabled } from './WorkerFeatureFlags';

interface PendingChunk {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly priority: number;
  readonly critical: boolean;
  readonly enqueuedAtMs: number;
}

interface ActiveJob {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly priority: number;
  readonly critical: boolean;
  readonly enqueuedAtMs: number;
  readonly worker: Worker;
}

export interface ChunkGenerationStats {
  readonly queued: number;
  readonly activeWorkers: number;
  readonly completed: number;
  readonly stale: number;
  readonly errors: number;
  readonly averageDurationMs: number;
  readonly maxDurationMs: number;
  readonly oldestCriticalAgeMs: number;
  readonly workerCount: number;
}

export interface CompletedChunkGeneration {
  readonly chunk: Chunk;
  readonly durationMs: number;
}

function key(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

/**
 * Owns desired chunk generation jobs. Worker buffers are worker-owned;
 * when transferred back, main thread copies them into Chunk storage via
 * loadGeneratedBlocks. Live Chunk buffers are never transferred.
 */
export class ChunkGenerationQueue {
  private readonly chunkManager: ChunkManager;
  private readonly fallbackGenerator: WorldGenerator;
  private readonly worldSeed: bigint;
  private useWorkers: boolean;
  private readonly pending = new Map<string, PendingChunk>();
  private readonly active = new Map<number, ActiveJob>();
  private readonly workers: Worker[] = [];
  private readonly idleWorkers: Worker[] = [];
  private readonly completedResults: ChunkGenerationResult[] = [];
  private nextJobId = 1;
  private completed = 0;
  private stale = 0;
  private errors = 0;
  private totalDuration = 0;
  private maxDuration = 0;

  public constructor(chunkManager: ChunkManager, fallbackGenerator: WorldGenerator, worldSeed: bigint) {
    this.chunkManager = chunkManager;
    this.fallbackGenerator = fallbackGenerator;
    this.worldSeed = worldSeed;
    this.useWorkers = typeof Worker !== 'undefined' && isWorkerFeatureEnabled('generation');

    if (this.useWorkers) {
      try {
        for (let i = 0; i < getWorkerCount('generation'); i++) {
          this.spawnWorker();
        }
      } catch {
        this.errors += 1;
        this.useWorkers = false;
        this.dispose();
      }
    }
  }

  public dispose(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers.length = 0;
    this.idleWorkers.length = 0;
    this.pending.clear();
    this.active.clear();
  }

  public enqueue(chunkX: number, chunkZ: number, priority: number, critical: boolean): void {
    const mapKey = key(chunkX, chunkZ);
    if (this.chunkManager.hasChunk(chunkX, chunkZ)) {
      return;
    }
    for (const active of this.active.values()) {
      if (active.chunkX === chunkX && active.chunkZ === chunkZ) {
        return;
      }
    }
    const existing = this.pending.get(mapKey);
    if (existing !== undefined && existing.priority <= priority && existing.critical === critical) {
      return;
    }
    this.pending.set(mapKey, {
      chunkX,
      chunkZ,
      priority,
      critical,
      enqueuedAtMs: existing?.enqueuedAtMs ?? performance.now(),
    });
  }

  public cancelUndesired(desired: ReadonlySet<string>): void {
    for (const mapKey of this.pending.keys()) {
      if (!desired.has(mapKey)) {
        this.pending.delete(mapKey);
      }
    }
  }

  public process(
    maxSyncJobs: number,
    maxSyncMs: number,
    desired: ReadonlySet<string>,
    allowNonCriticalDispatch: boolean,
  ): CompletedChunkGeneration[] {
    const completed: CompletedChunkGeneration[] = [];
    this.drainWorkerResults(completed, desired);

    if (this.useWorkers) {
      this.dispatchWorkers(allowNonCriticalDispatch);
      return completed;
    }

    const start = performance.now();
    let count = 0;
    while (count < maxSyncJobs && performance.now() - start < maxSyncMs) {
      const next = this.takeNextPending();
      if (next === undefined) {
        break;
      }
      if (!allowNonCriticalDispatch && !next.critical) {
        this.pending.set(key(next.chunkX, next.chunkZ), next);
        break;
      }
      if (!desired.has(key(next.chunkX, next.chunkZ))) {
        this.stale += 1;
        continue;
      }
      const t0 = performance.now();
      const chunk = this.chunkManager.getOrCreateChunk(next.chunkX, next.chunkZ);
      this.fallbackGenerator.populate(chunk);
      chunk.setTerrainPopulated(true);
      const duration = performance.now() - t0;
      this.recordDuration(duration);
      this.completed += 1;
      completed.push({ chunk, durationMs: duration });
      count += 1;
    }
    return completed;
  }

  public getStats(): ChunkGenerationStats {
    return {
      queued: this.pending.size,
      activeWorkers: this.active.size,
      completed: this.completed,
      stale: this.stale,
      errors: this.errors,
      averageDurationMs: this.completed === 0 ? 0 : this.totalDuration / this.completed,
      maxDurationMs: this.maxDuration,
      oldestCriticalAgeMs: this.getOldestCriticalAgeMs(),
      workerCount: this.workers.length,
    };
  }

  private spawnWorker(): void {
    const worker = new Worker(new URL('../../workers/chunkGenerationWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ChunkGenerationResult | ChunkWorkerError>): void => {
      const message = event.data;
      if (message.type === 'generated') {
        this.completedResults.push(message);
      } else {
        this.errors += 1;
        const active = this.active.get(message.jobId);
        this.active.delete(message.jobId);
        if (active !== undefined) {
          this.pending.set(key(active.chunkX, active.chunkZ), {
            chunkX: active.chunkX,
            chunkZ: active.chunkZ,
            priority: active.priority,
            critical: active.critical,
            enqueuedAtMs: active.enqueuedAtMs,
          });
        }
        this.idleWorkers.push(worker);
      }
    };
    worker.onerror = (): void => {
      this.errors += 1;
      for (const [jobId, active] of this.active) {
        if (active.worker !== worker) continue;
        this.pending.set(key(active.chunkX, active.chunkZ), {
          chunkX: active.chunkX,
          chunkZ: active.chunkZ,
          priority: active.priority,
          critical: active.critical,
          enqueuedAtMs: active.enqueuedAtMs,
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

  private dispatchWorkers(allowNonCriticalDispatch: boolean): void {
    while (this.idleWorkers.length > 0) {
      const next = this.takeNextPending();
      if (next === undefined) {
        return;
      }
      if (!allowNonCriticalDispatch && !next.critical) {
        this.pending.set(key(next.chunkX, next.chunkZ), next);
        return;
      }
      const worker = this.idleWorkers.pop()!;
      const jobId = this.nextJobId++;
      this.active.set(jobId, {
        chunkX: next.chunkX,
        chunkZ: next.chunkZ,
        priority: next.priority,
        critical: next.critical,
        enqueuedAtMs: next.enqueuedAtMs,
        worker,
      });
      const job: ChunkGenerationJob = {
        type: 'generate',
        jobId,
        chunkX: next.chunkX,
        chunkZ: next.chunkZ,
        seed: this.worldSeed.toString(),
      };
      worker.postMessage(job);
    }
  }

  private drainWorkerResults(completed: CompletedChunkGeneration[], desired: ReadonlySet<string>): void {
    while (this.completedResults.length > 0) {
      const result = this.completedResults.shift()!;
      const active = this.active.get(result.jobId);
      this.active.delete(result.jobId);
      if (active !== undefined) {
        this.idleWorkers.push(active.worker);
      }

      const mapKey = key(result.chunkX, result.chunkZ);
      if (active === undefined || !desired.has(mapKey) || this.chunkManager.hasChunk(result.chunkX, result.chunkZ)) {
        this.stale += 1;
        continue;
      }

      const chunk = this.chunkManager.getOrCreateChunk(result.chunkX, result.chunkZ);
      chunk.loadGeneratedBlocks(new Uint8Array(result.blocks));
      chunk.loadGeneratedMetadata(new Uint8Array(result.metadata));
      chunk.setTerrainPopulated(true);
      this.recordDuration(result.durationMs);
      this.completed += 1;
      completed.push({ chunk, durationMs: result.durationMs });
    }
  }

  private takeNextPending(): PendingChunk | undefined {
    let bestKey: string | undefined;
    let best: PendingChunk | undefined;
    let bestScore = Infinity;
    const now = performance.now();
    for (const [mapKey, candidate] of this.pending) {
      const ageBonus = Math.min(500, (now - candidate.enqueuedAtMs) * 0.02);
      const score = candidate.priority - ageBonus;
      if (best === undefined || score < bestScore) {
        best = candidate;
        bestKey = mapKey;
        bestScore = score;
      }
    }
    if (bestKey !== undefined) {
      this.pending.delete(bestKey);
    }
    return best;
  }

  private getOldestCriticalAgeMs(): number {
    const now = performance.now();
    let oldest = 0;
    for (const candidate of this.pending.values()) {
      if (candidate.critical) {
        oldest = Math.max(oldest, now - candidate.enqueuedAtMs);
      }
    }
    return oldest;
  }

  private recordDuration(duration: number): void {
    this.totalDuration += duration;
    this.maxDuration = Math.max(this.maxDuration, duration);
  }
}
