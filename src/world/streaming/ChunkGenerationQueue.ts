import { Chunk } from '../Chunk';
import type { ChunkManager } from '../ChunkManager';
import type { WorldGenerator } from '../WorldGenerator';
import type { ChunkGenerationJob, ChunkGenerationResult, ChunkWorkerError } from './ChunkJobTypes';
import { getWorkerCount, isWorkerFeatureEnabled } from './WorkerFeatureFlags';
import { storeGeneratedFeatures } from '../generation/decoration/GeneratedFeaturesRegistry';
import type { GeneratedChunkFeatures } from '../generation/decoration/GeneratedChunkFeatures';

interface PendingChunk {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly priority: number;
  readonly critical: boolean;
  readonly enqueuedAtMs: number;
}

interface PendingGenerationHeapEntry {
  readonly mapKey: number;
  readonly job: PendingChunk;
}

interface ActiveJob {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly priority: number;
  readonly critical: boolean;
  readonly enqueuedAtMs: number;
  readonly sentAtMs: number;
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
  readonly processMs: number;
  readonly dispatchMs: number;
  readonly drainMs: number;
  readonly syncGenerationMs: number;
  readonly lastWorkerDurationMs: number;
  readonly lastTransferBytes: number;
  readonly totalTransferBytes: number;
  readonly lastTransferLatencyMs: number;
}

export interface CompletedChunkGeneration {
  readonly chunk: Chunk;
  readonly durationMs: number;
}

import { chunkKey } from '../chunkKey';

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
  private readonly pending = new Map<number, PendingChunk>();
  private readonly pendingHeap: PendingGenerationHeapEntry[] = [];
  private readonly active = new Map<number, ActiveJob>();
  private readonly activeChunkKeys = new Set<number>();
  private readonly workers: Worker[] = [];
  private readonly idleWorkers: Worker[] = [];
  private readonly completedResults: ChunkGenerationResult[] = [];
  private nextJobId = 1;
  private completed = 0;
  private stale = 0;
  private errors = 0;
  private totalDuration = 0;
  private maxDuration = 0;
  private lastProcessMs = 0;
  private lastDispatchMs = 0;
  private lastDrainMs = 0;
  private lastSyncGenerationMs = 0;
  private lastWorkerDurationMs = 0;
  private lastTransferBytes = 0;
  private totalTransferBytes = 0;
  private lastTransferLatencyMs = 0;

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
    this.pendingHeap.length = 0;
    this.active.clear();
    this.activeChunkKeys.clear();
  }

  public enqueue(chunkX: number, chunkZ: number, priority: number, critical: boolean): void {
    const mapKey = chunkKey(chunkX, chunkZ);
    if (this.chunkManager.hasChunk(chunkX, chunkZ)) {
      return;
    }
    if (this.activeChunkKeys.has(mapKey)) return;
    const existing = this.pending.get(mapKey);
    if (existing !== undefined && existing.priority <= priority && existing.critical === critical) {
      return;
    }
    this.setPending(mapKey, {
      chunkX,
      chunkZ,
      priority,
      critical,
      enqueuedAtMs: existing?.enqueuedAtMs ?? performance.now(),
    });
  }

  public cancelUndesired(desired: ReadonlySet<number>): void {
    for (const mapKey of this.pending.keys()) {
      if (!desired.has(mapKey)) {
        this.pending.delete(mapKey);
      }
    }
  }

  public process(
    maxSyncJobs: number,
    maxSyncMs: number,
    desired: ReadonlySet<number>,
    allowNonCriticalDispatch: boolean,
  ): CompletedChunkGeneration[] {
    const processStart = performance.now();
    this.lastTransferBytes = 0;
    this.lastTransferLatencyMs = 0;
    this.lastSyncGenerationMs = 0;
    const completed: CompletedChunkGeneration[] = [];
    const drainStart = performance.now();
    this.drainWorkerResults(completed, desired);
    this.lastDrainMs = performance.now() - drainStart;

    if (this.useWorkers) {
      const dispatchStart = performance.now();
      this.dispatchWorkers(allowNonCriticalDispatch);
      this.lastDispatchMs = performance.now() - dispatchStart;
      this.lastProcessMs = performance.now() - processStart;
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
        this.setPending(chunkKey(next.chunkX, next.chunkZ), next);
        break;
      }
      if (!desired.has(chunkKey(next.chunkX, next.chunkZ))) {
        this.stale += 1;
        continue;
      }
      const t0 = performance.now();
      const chunk = this.chunkManager.getOrCreateChunk(next.chunkX, next.chunkZ);
      this.fallbackGenerator.populate(chunk);
      chunk.setTerrainPopulated(true);
      const duration = performance.now() - t0;
      this.lastSyncGenerationMs += duration;
      this.recordDuration(duration);
      this.completed += 1;
      completed.push({ chunk, durationMs: duration });
      count += 1;
    }
    this.lastDispatchMs = 0;
    this.lastProcessMs = performance.now() - processStart;
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
      processMs: this.lastProcessMs,
      dispatchMs: this.lastDispatchMs,
      drainMs: this.lastDrainMs,
      syncGenerationMs: this.lastSyncGenerationMs,
      lastWorkerDurationMs: this.lastWorkerDurationMs,
      lastTransferBytes: this.lastTransferBytes,
      totalTransferBytes: this.totalTransferBytes,
      lastTransferLatencyMs: this.lastTransferLatencyMs,
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
          this.activeChunkKeys.delete(chunkKey(active.chunkX, active.chunkZ));
          this.setPending(chunkKey(active.chunkX, active.chunkZ), {
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
        this.activeChunkKeys.delete(chunkKey(active.chunkX, active.chunkZ));
        this.setPending(chunkKey(active.chunkX, active.chunkZ), {
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
      this.activeChunkKeys.clear();
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
        this.setPending(chunkKey(next.chunkX, next.chunkZ), next);
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
        sentAtMs: performance.now(),
        worker,
      });
      this.activeChunkKeys.add(chunkKey(next.chunkX, next.chunkZ));
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

  private drainWorkerResults(completed: CompletedChunkGeneration[], desired: ReadonlySet<number>): void {
    while (this.completedResults.length > 0) {
      const result = this.completedResults.shift()!;
      const active = this.active.get(result.jobId);
      this.active.delete(result.jobId);
      if (active !== undefined) {
        this.activeChunkKeys.delete(chunkKey(active.chunkX, active.chunkZ));
        this.idleWorkers.push(active.worker);
      }

      const mapKey = chunkKey(result.chunkX, result.chunkZ);
      if (active !== undefined) {
        const bytes = result.blocks.byteLength + result.metadata.byteLength;
        this.lastTransferBytes += bytes;
        this.totalTransferBytes += bytes;
        this.lastWorkerDurationMs = result.durationMs;
        this.lastTransferLatencyMs = Math.max(0, performance.now() - active.sentAtMs - result.durationMs);
      }
      if (active === undefined || !desired.has(mapKey) || this.chunkManager.hasChunk(result.chunkX, result.chunkZ)) {
        this.stale += 1;
        continue;
      }

      const chunk = this.chunkManager.getOrCreateChunk(result.chunkX, result.chunkZ);
      chunk.adoptGeneratedStorage(new Uint8Array(result.blocks), new Uint8Array(result.metadata));
      if (result.featuresJson) {
        storeGeneratedFeatures(result.chunkX, result.chunkZ, parseFeaturesJson(result.featuresJson));
      }
      chunk.setTerrainPopulated(true);
      this.recordDuration(result.durationMs);
      this.completed += 1;
      completed.push({ chunk, durationMs: result.durationMs });
    }
  }

  private setPending(mapKey: number, job: PendingChunk): void {
    this.pending.set(mapKey, job);
    const entry: PendingGenerationHeapEntry = { mapKey, job };
    this.pendingHeap.push(entry);
    this.siftPendingUp(this.pendingHeap.length - 1, performance.now());
  }

  private takeNextPending(): PendingChunk | undefined {
    const now = performance.now();
    while (this.pendingHeap.length > 0) {
      const entry = this.popPendingHeap(now);
      if (this.pending.get(entry.mapKey) !== entry.job) continue;
      this.pending.delete(entry.mapKey);
      return entry.job;
    }
    return undefined;
  }

  private pendingScore(job: PendingChunk, now: number): number {
    return job.priority - Math.min(500, (now - job.enqueuedAtMs) * 0.02);
  }

  private isPendingBefore(a: PendingGenerationHeapEntry, b: PendingGenerationHeapEntry, now: number): boolean {
    const scoreA = this.pendingScore(a.job, now);
    const scoreB = this.pendingScore(b.job, now);
    return scoreA < scoreB || (scoreA === scoreB && a.job.enqueuedAtMs < b.job.enqueuedAtMs);
  }

  private siftPendingUp(index: number, now: number): void {
    let child = index;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (!this.isPendingBefore(this.pendingHeap[child]!, this.pendingHeap[parent]!, now)) break;
      [this.pendingHeap[child], this.pendingHeap[parent]] = [this.pendingHeap[parent]!, this.pendingHeap[child]!];
      child = parent;
    }
  }

  private popPendingHeap(now: number): PendingGenerationHeapEntry {
    const first = this.pendingHeap[0]!;
    const last = this.pendingHeap.pop()!;
    if (this.pendingHeap.length > 0) {
      this.pendingHeap[0] = last;
      let parent = 0;
      while (true) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let best = parent;
        if (left < this.pendingHeap.length && this.isPendingBefore(this.pendingHeap[left]!, this.pendingHeap[best]!, now)) best = left;
        if (right < this.pendingHeap.length && this.isPendingBefore(this.pendingHeap[right]!, this.pendingHeap[best]!, now)) best = right;
        if (best === parent) break;
        [this.pendingHeap[parent], this.pendingHeap[best]] = [this.pendingHeap[best]!, this.pendingHeap[parent]!];
        parent = best;
      }
    }
    return first;
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


function parseFeaturesJson(json: string): GeneratedChunkFeatures {
  const raw = JSON.parse(json) as {
    dungeons: Array<{
      spawnerX: number;
      spawnerY: number;
      spawnerZ: number;
      mobId: string;
      chests: Array<{ x: number; y: number; z: number; contents: Array<[number, { id: string; count: number; metadata: number }]> }>;
    }>;
  };
  return {
    dungeons: raw.dungeons.map((d) => ({
      spawnerX: d.spawnerX,
      spawnerY: d.spawnerY,
      spawnerZ: d.spawnerZ,
      mobId: d.mobId,
      chests: d.chests.map((c) => ({
        x: c.x,
        y: c.y,
        z: c.z,
        contents: new Map(c.contents),
      })),
    })),
  };
}
