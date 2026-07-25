/**
 * Development-only performance profiler.
 *
 * Every metric is gated behind the `enabled` flag. When disabled, all
 * `record*` / `begin*` / `end*` methods are no-ops — zero overhead in
 * production builds.
 *
 * Frame-time statistics use a rolling window. Percentiles are computed
 * from a sorted copy of the window each snapshot (cheap for 240 samples).
 */

export interface QueueHistory {
  readonly current: number;
  readonly average: number;
  readonly maximum: number;
}

export interface WeatherSubTimings {
  readonly simulationMs: number;
  readonly splashMs: number;
  readonly heightmapResampleMs: number;
  readonly geometryRebuildMs: number;
  readonly drawMs: number;
  readonly transparentRenderingMs: number;
}

export interface LightingSubTimings {
  readonly propagationMs: number;
  readonly averageBfsQueueSize: number;
  readonly maximumBfsQueueSize: number;
  readonly propagationCalls: number;
}

export interface MeshUploadSubTimings {
  readonly gpuBufferUploadMs: number;
  readonly sceneInsertionMs: number;
  readonly totalUploadMs: number;
  readonly uploadsThisFrame: number;
}

export interface PerformanceSnapshot {
  readonly frameTimeMs: number;
  readonly averageFrameTimeMs: number;
  readonly worstFrameTimeMs: number;
  readonly p95FrameTimeMs: number;
  readonly p99FrameTimeMs: number;
  readonly averageFps: number;
  readonly onePercentLowFps: number;
  readonly updateTimeMs: number;
  readonly renderTimeMs: number;
  readonly meshUploadsThisFrame: number;
  readonly generationQueue: QueueHistory;
  readonly meshingQueue: QueueHistory;
  readonly lightingQueue: QueueHistory;
  readonly persistenceQueue: QueueHistory;
  readonly oldestCriticalGenerationAgeMs: number;
  readonly activeWorkerCount: number;
  readonly completedWorkerJobs: number;
  readonly staleWorkerJobs: number;
  readonly workerErrors: number;
  readonly approximateGeometryMemoryMb: number;
  readonly jsHeapUsedMb: number;
  readonly jsHeapTotalMb: number;
  readonly dirtyChunkScanMs: number;
  readonly loadedChunks: number;
  readonly visibleChunks: number;
  readonly dirtyChunks: number;
  readonly weather: WeatherSubTimings;
  readonly lighting: LightingSubTimings;
  readonly meshUpload: MeshUploadSubTimings;
  readonly generationMs: number;
  readonly meshingMs: number;
}

/** Rolling-window history tracker for a single scalar metric. */
class RollingHistory {
  private readonly samples: number[] = [];
  private readonly maxSamples: number;
  private maximum = 0;

  public constructor(maxSamples = 120) {
    this.maxSamples = maxSamples;
  }

  public record(value: number): void {
    this.samples.push(value);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
    if (value > this.maximum) {
      this.maximum = value;
    }
  }

  public current(): number {
    return this.samples.length === 0 ? 0 : this.samples[this.samples.length - 1]!;
  }

  public average(): number {
    if (this.samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.samples.length; i++) sum += this.samples[i]!;
    return sum / this.samples.length;
  }

  public max(): number {
    return this.maximum;
  }

  public toHistory(): QueueHistory {
    return { current: this.current(), average: this.average(), maximum: this.max() };
  }
}

const FRAME_WINDOW = 240;

export class PerformanceProfiler {
  /** Master enable switch. When false, every method is a no-op. */
  public enabled = false;

  private readonly frameSamples: number[] = [];
  private frameStart = 0;
  private updateStart = 0;
  private renderStart = 0;
  private lastFrameTime = 0;
  private lastUpdateTime = 0;
  private lastRenderTime = 0;
  private meshUploadsThisFrame = 0;

  private oldestCriticalGenerationAgeMs = 0;
  private activeWorkerCount = 0;
  private completedWorkerJobs = 0;
  private staleWorkerJobs = 0;
  private workerErrors = 0;
  private approximateGeometryMemoryMb = 0;

  // Queue histories
  private readonly generationHistory = new RollingHistory();
  private readonly meshingHistory = new RollingHistory();
  private readonly lightingHistory = new RollingHistory();
  private readonly persistenceHistory = new RollingHistory();

  // Per-system timings
  private lastGenerationMs = 0;
  private lastMeshingMs = 0;
  private lastDirtyChunkScanMs = 0;

  // Weather sub-timings
  private weatherSimulationMs = 0;
  private weatherSplashMs = 0;
  private weatherHeightmapResampleMs = 0;
  private weatherGeometryRebuildMs = 0;
  private weatherDrawMs = 0;
  private weatherTransparentRenderingMs = 0;

  // Lighting sub-timings
  private lightingPropagationMs = 0;
  private lightingAvgBfsQueueSize = 0;
  private lightingMaxBfsQueueSize = 0;
  private lightingPropagationCalls = 0;

  // Mesh upload sub-timings
  private meshUploadGpuMs = 0;
  private meshUploadSceneInsertMs = 0;
  private meshUploadTotalMs = 0;

  // Chunk counts
  private loadedChunks = 0;
  private visibleChunks = 0;
  private dirtyChunks = 0;

  // ---- Frame ----

  public beginFrame(): void {
    if (!this.enabled) return;
    this.frameStart = performance.now();
    this.meshUploadsThisFrame = 0;
  }

  public endFrame(): void {
    if (!this.enabled) return;
    this.lastFrameTime = performance.now() - this.frameStart;
    this.frameSamples.push(this.lastFrameTime);
    if (this.frameSamples.length > FRAME_WINDOW) {
      this.frameSamples.shift();
    }
  }

  // ---- Update / Render ----

  public beginUpdate(): void {
    if (!this.enabled) return;
    this.updateStart = performance.now();
  }

  public endUpdate(): void {
    if (!this.enabled) return;
    this.lastUpdateTime = performance.now() - this.updateStart;
  }

  public beginRender(): void {
    if (!this.enabled) return;
    this.renderStart = performance.now();
  }

  public endRender(): void {
    if (!this.enabled) return;
    this.lastRenderTime = performance.now() - this.renderStart;
  }

  // ---- Mesh uploads ----

  public recordMeshUpload(count = 1): void {
    if (!this.enabled) return;
    this.meshUploadsThisFrame += count;
  }

  public recordMeshUploadTimings(gpuBufferMs: number, sceneInsertionMs: number, totalMs: number): void {
    if (!this.enabled) return;
    this.meshUploadGpuMs = gpuBufferMs;
    this.meshUploadSceneInsertMs = sceneInsertionMs;
    this.meshUploadTotalMs = totalMs;
  }

  // ---- Queue depths ----

  public setQueues(generation: number, meshing: number, activeWorkers: number, oldestCriticalGenerationAgeMs = 0): void {
    if (!this.enabled) return;
    this.activeWorkerCount = activeWorkers;
    this.oldestCriticalGenerationAgeMs = oldestCriticalGenerationAgeMs;
    this.generationHistory.record(generation);
    this.meshingHistory.record(meshing);
  }

  public setWorkerCounters(completed: number, stale: number, errors: number): void {
    if (!this.enabled) return;
    this.completedWorkerJobs = completed;
    this.staleWorkerJobs = stale;
    this.workerErrors = errors;
  }

  public setApproximateGeometryMemoryMb(value: number): void {
    if (!this.enabled) return;
    this.approximateGeometryMemoryMb = value;
  }

  public setLightingQueueDepth(depth: number): void {
    if (!this.enabled) return;
    this.lightingHistory.record(depth);
  }

  public setPersistenceQueueDepth(depth: number): void {
    if (!this.enabled) return;
    this.persistenceHistory.record(depth);
  }

  // ---- Per-system timings ----

  public recordGenerationTime(ms: number): void {
    if (!this.enabled) return;
    this.lastGenerationMs = ms;
  }

  public recordMeshingTime(ms: number): void {
    if (!this.enabled) return;
    this.lastMeshingMs = ms;
  }

  public recordDirtyChunkScanTime(ms: number): void {
    if (!this.enabled) return;
    this.lastDirtyChunkScanMs = ms;
  }

  // ---- Weather sub-timings ----

  public recordWeatherTimings(t: WeatherSubTimings): void {
    if (!this.enabled) return;
    this.weatherSimulationMs = t.simulationMs;
    this.weatherSplashMs = t.splashMs;
    this.weatherHeightmapResampleMs = t.heightmapResampleMs;
    this.weatherGeometryRebuildMs = t.geometryRebuildMs;
    this.weatherDrawMs = t.drawMs;
    this.weatherTransparentRenderingMs = t.transparentRenderingMs;
  }

  // ---- Lighting sub-timings ----

  public recordLightingTimings(t: LightingSubTimings): void {
    if (!this.enabled) return;
    this.lightingPropagationMs = t.propagationMs;
    this.lightingAvgBfsQueueSize = t.averageBfsQueueSize;
    this.lightingMaxBfsQueueSize = t.maximumBfsQueueSize;
    this.lightingPropagationCalls = t.propagationCalls;
  }

  // ---- Chunk counts ----

  public recordChunkCounts(loaded: number, visible: number, dirty: number): void {
    if (!this.enabled) return;
    this.loadedChunks = loaded;
    this.visibleChunks = visible;
    this.dirtyChunks = dirty;
  }

  // ---- Snapshot ----

  public getSnapshot(): PerformanceSnapshot {
    const sorted = [...this.frameSamples].sort((a, b) => a - b);
    const n = sorted.length;
    const averageFrameTime = n === 0 ? 0 : sorted.reduce((s, v) => s + v, 0) / n;
    const worst = n === 0 ? 0 : sorted[n - 1]!;
    const p95Index = n === 0 ? 0 : Math.min(n - 1, Math.floor(n * 0.95));
    const p99Index = n === 0 ? 0 : Math.min(n - 1, Math.floor(n * 0.99));
    const p95 = sorted[p95Index] ?? 0;
    const p99 = sorted[p99Index] ?? 0;
    const averageFps = averageFrameTime > 0 ? 1000 / averageFrameTime : 0;

    // 1% low: worst 1% of frame times → lowest FPS from those
    const onePercentCount = Math.max(1, Math.floor(n * 0.01));
    let worstOnePercentSum = 0;
    for (let i = n - onePercentCount; i < n; i++) worstOnePercentSum += sorted[i]!;
    const worstOnePercentAvg = worstOnePercentSum / onePercentCount;
    const onePercentLowFps = worstOnePercentAvg > 0 ? 1000 / worstOnePercentAvg : 0;

    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;

    return {
      frameTimeMs: this.lastFrameTime,
      averageFrameTimeMs: averageFrameTime,
      worstFrameTimeMs: worst,
      p95FrameTimeMs: p95,
      p99FrameTimeMs: p99,
      averageFps,
      onePercentLowFps,
      updateTimeMs: this.lastUpdateTime,
      renderTimeMs: this.lastRenderTime,
      meshUploadsThisFrame: this.meshUploadsThisFrame,
      generationQueue: this.generationHistory.toHistory(),
      meshingQueue: this.meshingHistory.toHistory(),
      lightingQueue: this.lightingHistory.toHistory(),
      persistenceQueue: this.persistenceHistory.toHistory(),
      oldestCriticalGenerationAgeMs: this.oldestCriticalGenerationAgeMs,
      activeWorkerCount: this.activeWorkerCount,
      completedWorkerJobs: this.completedWorkerJobs,
      staleWorkerJobs: this.staleWorkerJobs,
      workerErrors: this.workerErrors,
      approximateGeometryMemoryMb: this.approximateGeometryMemoryMb,
      jsHeapUsedMb: mem ? mem.usedJSHeapSize / (1024 * 1024) : 0,
      jsHeapTotalMb: mem ? mem.totalJSHeapSize / (1024 * 1024) : 0,
      dirtyChunkScanMs: this.lastDirtyChunkScanMs,
      loadedChunks: this.loadedChunks,
      visibleChunks: this.visibleChunks,
      dirtyChunks: this.dirtyChunks,
      weather: {
        simulationMs: this.weatherSimulationMs,
        splashMs: this.weatherSplashMs,
        heightmapResampleMs: this.weatherHeightmapResampleMs,
        geometryRebuildMs: this.weatherGeometryRebuildMs,
        drawMs: this.weatherDrawMs,
        transparentRenderingMs: this.weatherTransparentRenderingMs,
      },
      lighting: {
        propagationMs: this.lightingPropagationMs,
        averageBfsQueueSize: this.lightingAvgBfsQueueSize,
        maximumBfsQueueSize: this.lightingMaxBfsQueueSize,
        propagationCalls: this.lightingPropagationCalls,
      },
      meshUpload: {
        gpuBufferUploadMs: this.meshUploadGpuMs,
        sceneInsertionMs: this.meshUploadSceneInsertMs,
        totalUploadMs: this.meshUploadTotalMs,
        uploadsThisFrame: this.meshUploadsThisFrame,
      },
      generationMs: this.lastGenerationMs,
      meshingMs: this.lastMeshingMs,
    };
  }
}
