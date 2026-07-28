/**
 * Development performance profiler.
 *
 * The profiler is intentionally passive: systems push timings/counters into it,
 * and it only aggregates values for debug output / browser-run performance
 * captures. When disabled, all record methods are no-ops so callers can compare
 * instrumentation-enabled and instrumentation-disabled runs without changing the
 * frame pipeline.
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
  readonly nodesProcessed: number;
  readonly initializationMs: number;
  readonly borderReconcileMs: number;
  readonly localRelightMs: number;
  readonly blockReads: number;
  readonly lightReads: number;
  readonly lightWrites: number;
  readonly opacityQueries: number;
  readonly emissionQueries: number;
  readonly coordinateConversions: number;
  readonly chunkLookups: number;
  readonly missingChunkLookups: number;
  readonly boundaryTraversals: number;
  readonly queuePushes: number;
  readonly removeQueuePushes: number;
  readonly queueNodeAllocations: number;
  readonly remeshFanOutChunks: number;
}

export interface MeshUploadSubTimings {
  /** Main-thread BufferGeometry creation from worker-returned ArrayBuffers. */
  readonly gpuBufferUploadMs: number;
  /** Main-thread mesh replacement / scene insertion / depth-clone work. */
  readonly sceneInsertionMs: number;
  readonly totalUploadMs: number;
  readonly uploadsThisFrame: number;
}

export interface GenerationSubTimings {
  readonly queueProcessMs: number;
  readonly workerDurationMs: number;
  readonly integrationMs: number;
  readonly chunksCompleted: number;
  readonly bytesReceived: number;
  readonly transferLatencyMs: number;
  readonly lightingInitMs?: number;
  readonly borderReconcileMs?: number;
  readonly neighbourDirtyCount?: number;
}

export interface MeshingSubTimings {
  readonly jobBuildMs: number;
  readonly dispatchMs: number;
  readonly resultDrainMs: number;
  readonly workerDurationMs: number;
  readonly geometryCreationMs: number;
  readonly sceneInsertionMs: number;
  readonly bytesCopied: number;
  readonly bytesTransferred: number;
  readonly bytesReturned: number;
  readonly transferLatencyMs: number;
}

export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
}

export interface ProfilerOverheadStats {
  /** Time spent inside profiler bookkeeping itself during the current frame. */
  readonly selfMs: number;
  readonly debugCollectMs: number;
  readonly debugRenderMs: number;
  readonly totalMs: number;
  readonly enabled: boolean;
}

export interface LongFrameSample {
  readonly atMs: number;
  readonly frameTimeMs: number;
  readonly updateTimeMs: number;
  readonly renderTimeMs: number;
  readonly generationMs: number;
  readonly integrationMs: number;
  readonly meshingMs: number;
  readonly meshUploadMs: number;
  readonly lightingMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly generationQueueDepth: number;
  readonly meshingQueueDepth: number;
  readonly persistenceQueueDepth: number;
  readonly heapUsedMb: number;
}

export interface PerformanceCaptureSummary {
  readonly label: string;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly durationMs: number;
  readonly frameCount: number;
  readonly averageFps: number;
  readonly onePercentLowFps: number;
  readonly averageFrameTimeMs: number;
  readonly p95FrameTimeMs: number;
  readonly p99FrameTimeMs: number;
  readonly worstFrameTimeMs: number;
  readonly averageUpdateTimeMs: number;
  readonly maxUpdateTimeMs: number;
  readonly averageRenderTimeMs: number;
  readonly maxRenderTimeMs: number;
  readonly averageGenerationMs: number;
  readonly maxGenerationMs: number;
  readonly averageIntegrationMs: number;
  readonly maxIntegrationMs: number;
  readonly averageMeshingMs: number;
  readonly maxMeshingMs: number;
  readonly averageMeshUploadMs: number;
  readonly maxMeshUploadMs: number;
  readonly averageLightingMs: number;
  readonly maxLightingMs: number;
  readonly lightingNodesProcessed: number;
  readonly workerBytesCopied: number;
  readonly workerBytesTransferred: number;
  readonly workerBytesReturned: number;
  readonly maxGenerationQueueDepth: number;
  readonly maxMeshingQueueDepth: number;
  readonly maxPersistenceQueueDepth: number;
  readonly maxDrawCalls: number;
  readonly maxTriangles: number;
  readonly heapStartMb: number;
  readonly heapEndMb: number;
  readonly heapMaxMb: number;
  readonly profilerOverheadMs: number;
  readonly debugOverlayMs: number;
  readonly longFrames: readonly LongFrameSample[];
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
  readonly generation: GenerationSubTimings;
  readonly meshing: MeshingSubTimings;
  /** Backward-compatible aliases kept for existing debug text. */
  readonly generationMs: number;
  readonly meshingMs: number;
  readonly renderStats: RenderStats;
  readonly profilerOverhead: ProfilerOverheadStats;
  readonly longFrameCount: number;
  readonly longFrameThresholdMs: number;
  readonly activeCapture: PerformanceCaptureSummary | null;
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
    if (this.samples.length > this.maxSamples) this.samples.shift();
    if (value > this.maximum) this.maximum = value;
  }

  public current(): number { return this.samples.length === 0 ? 0 : this.samples[this.samples.length - 1]!; }
  public average(): number { if (this.samples.length === 0) return 0; let sum = 0; for (const sample of this.samples) sum += sample; return sum / this.samples.length; }
  public max(): number { return this.maximum; }
  public toHistory(): QueueHistory { return { current: this.current(), average: this.average(), maximum: this.max() }; }
}

interface ActiveCapture {
  label: string;
  startedAtMs: number;
  frameTimes: number[];
  updateTotal: number;
  updateMax: number;
  renderTotal: number;
  renderMax: number;
  generationTotal: number;
  generationMax: number;
  integrationTotal: number;
  integrationMax: number;
  meshingTotal: number;
  meshingMax: number;
  meshUploadTotal: number;
  meshUploadMax: number;
  lightingTotal: number;
  lightingMax: number;
  lightingNodesProcessed: number;
  workerBytesCopied: number;
  workerBytesTransferred: number;
  workerBytesReturned: number;
  maxGenerationQueueDepth: number;
  maxMeshingQueueDepth: number;
  maxPersistenceQueueDepth: number;
  maxDrawCalls: number;
  maxTriangles: number;
  heapStartMb: number;
  heapEndMb: number;
  heapMaxMb: number;
  profilerOverheadMs: number;
  debugOverlayMs: number;
  longFrames: LongFrameSample[];
}

const FRAME_WINDOW = 240;
const LONG_FRAME_LIMIT = 120;
const DEFAULT_LONG_FRAME_THRESHOLD_MS = 50;

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

function memoryMb(): { used: number; total: number } {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  return mem ? { used: mem.usedJSHeapSize / (1024 * 1024), total: mem.totalJSHeapSize / (1024 * 1024) } : { used: 0, total: 0 };
}

export class PerformanceProfiler {
  /** Master enable switch. When false, every record method is a no-op. */
  public enabled = false;

  private readonly frameSamples: number[] = [];
  private readonly longFrames: LongFrameSample[] = [];
  private frameStart = 0;
  private updateStart = 0;
  private renderStart = 0;
  private lastFrameTime = 0;
  private lastUpdateTime = 0;
  private lastRenderTime = 0;
  private meshUploadsThisFrame = 0;
  private longFrameThresholdMs = DEFAULT_LONG_FRAME_THRESHOLD_MS;

  private oldestCriticalGenerationAgeMs = 0;
  private activeWorkerCount = 0;
  private completedWorkerJobs = 0;
  private staleWorkerJobs = 0;
  private workerErrors = 0;
  private approximateGeometryMemoryMb = 0;

  private readonly generationHistory = new RollingHistory();
  private readonly meshingHistory = new RollingHistory();
  private readonly lightingHistory = new RollingHistory();
  private readonly persistenceHistory = new RollingHistory();

  private generationTimings: GenerationSubTimings = { queueProcessMs: 0, workerDurationMs: 0, integrationMs: 0, chunksCompleted: 0, bytesReceived: 0, transferLatencyMs: 0, lightingInitMs: 0, borderReconcileMs: 0, neighbourDirtyCount: 0 };
  private meshingTimings: MeshingSubTimings = { jobBuildMs: 0, dispatchMs: 0, resultDrainMs: 0, workerDurationMs: 0, geometryCreationMs: 0, sceneInsertionMs: 0, bytesCopied: 0, bytesTransferred: 0, bytesReturned: 0, transferLatencyMs: 0 };
  private weatherTimings: WeatherSubTimings = { simulationMs: 0, splashMs: 0, heightmapResampleMs: 0, geometryRebuildMs: 0, drawMs: 0, transparentRenderingMs: 0 };
  private lightingTimings: LightingSubTimings = { propagationMs: 0, averageBfsQueueSize: 0, maximumBfsQueueSize: 0, propagationCalls: 0, nodesProcessed: 0, initializationMs: 0, borderReconcileMs: 0, localRelightMs: 0, blockReads: 0, lightReads: 0, lightWrites: 0, opacityQueries: 0, emissionQueries: 0, coordinateConversions: 0, chunkLookups: 0, missingChunkLookups: 0, boundaryTraversals: 0, queuePushes: 0, removeQueuePushes: 0, queueNodeAllocations: 0, remeshFanOutChunks: 0 };
  private meshUploadTimings: MeshUploadSubTimings = { gpuBufferUploadMs: 0, sceneInsertionMs: 0, totalUploadMs: 0, uploadsThisFrame: 0 };
  private renderStats: RenderStats = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };

  private loadedChunks = 0;
  private visibleChunks = 0;
  private dirtyChunks = 0;
  private dirtyChunkScanMs = 0;

  private profilerSelfMs = 0;
  private debugCollectMs = 0;
  private debugRenderMs = 0;
  private activeCapture: ActiveCapture | null = null;

  public setEnabled(enabled: boolean): void { this.enabled = enabled; }
  public isEnabled(): boolean { return this.enabled; }
  public getLastFrameTimeMs(): number { return this.lastFrameTime; }

  public setLongFrameThresholdMs(value: number): void {
    this.longFrameThresholdMs = Math.max(1, value);
  }

  public beginFrame(): void {
    if (!this.enabled) return;
    this.frameStart = performance.now();
    this.meshUploadsThisFrame = 0;
    this.profilerSelfMs = 0;
    this.debugCollectMs = 0;
    this.debugRenderMs = 0;
  }

  public endFrame(): void {
    if (!this.enabled) return;
    const start = performance.now();
    this.lastFrameTime = start - this.frameStart;
    this.frameSamples.push(this.lastFrameTime);
    if (this.frameSamples.length > FRAME_WINDOW) this.frameSamples.shift();
    this.captureLongFrame(start);
    this.recordCaptureFrame(start);
    this.profilerSelfMs += performance.now() - start;
  }

  public beginUpdate(): void { if (this.enabled) this.updateStart = performance.now(); }
  public endUpdate(): void { if (this.enabled) this.lastUpdateTime = performance.now() - this.updateStart; }
  public beginRender(): void { if (this.enabled) this.renderStart = performance.now(); }
  public endRender(): void { if (this.enabled) this.lastRenderTime = performance.now() - this.renderStart; }

  public recordMeshUpload(count = 1): void { if (this.enabled) this.meshUploadsThisFrame += count; }

  public recordMeshUploadTimings(gpuBufferMs: number, sceneInsertionMs: number, totalMs: number): void {
    if (!this.enabled) return;
    this.meshUploadTimings = { gpuBufferUploadMs: gpuBufferMs, sceneInsertionMs, totalUploadMs: totalMs, uploadsThisFrame: this.meshUploadsThisFrame };
  }

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

  public setApproximateGeometryMemoryMb(value: number): void { if (this.enabled) this.approximateGeometryMemoryMb = value; }
  public setLightingQueueDepth(depth: number): void { if (this.enabled) this.lightingHistory.record(depth); }
  public setPersistenceQueueDepth(depth: number): void { if (this.enabled) this.persistenceHistory.record(depth); }

  public recordGenerationTimings(t: GenerationSubTimings): void { if (this.enabled) this.generationTimings = t; }
  public recordMeshingTimings(t: MeshingSubTimings): void { if (this.enabled) this.meshingTimings = t; }
  public recordWeatherTimings(t: WeatherSubTimings): void { if (this.enabled) this.weatherTimings = t; }
  public recordLightingTimings(t: LightingSubTimings): void { if (this.enabled) this.lightingTimings = t; }
  public recordRenderStats(t: RenderStats): void { if (this.enabled) this.renderStats = t; }

  public recordChunkCounts(loaded: number, visible: number, dirty: number): void {
    if (!this.enabled) return;
    this.loadedChunks = loaded;
    this.visibleChunks = visible;
    this.dirtyChunks = dirty;
  }

  public recordDirtyChunkScanMs(value: number): void {
    if (this.enabled) this.dirtyChunkScanMs = value;
  }

  public recordProfilerOverhead(ms: number): void { if (this.enabled) this.profilerSelfMs += Math.max(0, ms); }
  public recordDebugOverlayTimings(collectMs: number, renderMs: number): void {
    if (!this.enabled) return;
    this.debugCollectMs = collectMs;
    this.debugRenderMs = renderMs;
  }

  public beginCapture(label: string): void {
    const heap = memoryMb().used;
    this.activeCapture = {
      label,
      startedAtMs: performance.now(),
      frameTimes: [],
      updateTotal: 0,
      updateMax: 0,
      renderTotal: 0,
      renderMax: 0,
      generationTotal: 0,
      generationMax: 0,
      integrationTotal: 0,
      integrationMax: 0,
      meshingTotal: 0,
      meshingMax: 0,
      meshUploadTotal: 0,
      meshUploadMax: 0,
      lightingTotal: 0,
      lightingMax: 0,
      lightingNodesProcessed: 0,
      workerBytesCopied: 0,
      workerBytesTransferred: 0,
      workerBytesReturned: 0,
      maxGenerationQueueDepth: 0,
      maxMeshingQueueDepth: 0,
      maxPersistenceQueueDepth: 0,
      maxDrawCalls: 0,
      maxTriangles: 0,
      heapStartMb: heap,
      heapEndMb: heap,
      heapMaxMb: heap,
      profilerOverheadMs: 0,
      debugOverlayMs: 0,
      longFrames: [],
    };
  }

  public endCapture(): PerformanceCaptureSummary | null {
    if (this.activeCapture === null) return null;
    const summary = this.summarizeCapture(this.activeCapture, performance.now());
    this.activeCapture = null;
    return summary;
  }

  public getActiveCaptureSummary(): PerformanceCaptureSummary | null {
    return this.activeCapture === null ? null : this.summarizeCapture(this.activeCapture, performance.now());
  }

  public getLongFrames(limit = LONG_FRAME_LIMIT): readonly LongFrameSample[] {
    return this.longFrames.slice(Math.max(0, this.longFrames.length - Math.max(0, Math.floor(limit))));
  }

  public clearLongFrames(): void { this.longFrames.length = 0; }

  public getSnapshot(): PerformanceSnapshot {
    const overheadStart = performance.now();
    const sorted = [...this.frameSamples].sort((a, b) => a - b);
    const averageFrameTime = sorted.length === 0 ? 0 : sorted.reduce((s, v) => s + v, 0) / sorted.length;
    const worst = sorted.length === 0 ? 0 : sorted[sorted.length - 1]!;
    const averageFps = averageFrameTime > 0 ? 1000 / averageFrameTime : 0;
    const onePercentLowFps = this.onePercentLowFps(sorted);
    const mem = memoryMb();
    const snapshot: PerformanceSnapshot = {
      frameTimeMs: this.lastFrameTime,
      averageFrameTimeMs: averageFrameTime,
      worstFrameTimeMs: worst,
      p95FrameTimeMs: percentile(sorted, 0.95),
      p99FrameTimeMs: percentile(sorted, 0.99),
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
      jsHeapUsedMb: mem.used,
      jsHeapTotalMb: mem.total,
      dirtyChunkScanMs: this.dirtyChunkScanMs,
      loadedChunks: this.loadedChunks,
      visibleChunks: this.visibleChunks,
      dirtyChunks: this.dirtyChunks,
      weather: this.weatherTimings,
      lighting: this.lightingTimings,
      meshUpload: { ...this.meshUploadTimings, uploadsThisFrame: this.meshUploadsThisFrame },
      generation: this.generationTimings,
      meshing: this.meshingTimings,
      generationMs: this.generationTimings.queueProcessMs,
      meshingMs: this.meshingTimings.workerDurationMs,
      renderStats: this.renderStats,
      profilerOverhead: {
        selfMs: this.profilerSelfMs,
        debugCollectMs: this.debugCollectMs,
        debugRenderMs: this.debugRenderMs,
        totalMs: this.profilerSelfMs + this.debugCollectMs + this.debugRenderMs,
        enabled: this.enabled,
      },
      longFrameCount: this.longFrames.length,
      longFrameThresholdMs: this.longFrameThresholdMs,
      activeCapture: this.getActiveCaptureSummary(),
    };
    this.profilerSelfMs += performance.now() - overheadStart;
    return snapshot;
  }

  private onePercentLowFps(sortedFrameTimes: readonly number[]): number {
    if (sortedFrameTimes.length === 0) return 0;
    const onePercentCount = Math.max(1, Math.floor(sortedFrameTimes.length * 0.01));
    let worstOnePercentSum = 0;
    for (let i = sortedFrameTimes.length - onePercentCount; i < sortedFrameTimes.length; i++) worstOnePercentSum += sortedFrameTimes[i]!;
    const worstOnePercentAvg = worstOnePercentSum / onePercentCount;
    return worstOnePercentAvg > 0 ? 1000 / worstOnePercentAvg : 0;
  }

  private captureLongFrame(now: number): void {
    if (this.lastFrameTime < this.longFrameThresholdMs) return;
    const mem = memoryMb();
    const sample: LongFrameSample = {
      atMs: now,
      frameTimeMs: this.lastFrameTime,
      updateTimeMs: this.lastUpdateTime,
      renderTimeMs: this.lastRenderTime,
      generationMs: this.generationTimings.queueProcessMs,
      integrationMs: this.generationTimings.integrationMs,
      meshingMs: this.meshingTimings.workerDurationMs,
      meshUploadMs: this.meshUploadTimings.totalUploadMs,
      lightingMs: Math.max(this.lightingTimings.propagationMs, this.lightingTimings.initializationMs + this.lightingTimings.borderReconcileMs + this.lightingTimings.localRelightMs),
      drawCalls: this.renderStats.drawCalls,
      triangles: this.renderStats.triangles,
      generationQueueDepth: this.generationHistory.current(),
      meshingQueueDepth: this.meshingHistory.current(),
      persistenceQueueDepth: this.persistenceHistory.current(),
      heapUsedMb: mem.used,
    };
    this.longFrames.push(sample);
    if (this.longFrames.length > LONG_FRAME_LIMIT) this.longFrames.shift();
  }

  private recordCaptureFrame(_now: number): void {
    const capture = this.activeCapture;
    if (capture === null) return;
    const heap = memoryMb().used;
    const generationMs = this.generationTimings.queueProcessMs;
    const integrationMs = this.generationTimings.integrationMs;
    const meshingMs = this.meshingTimings.workerDurationMs;
    const meshUploadMs = this.meshUploadTimings.totalUploadMs;
    const lightingMs = Math.max(this.lightingTimings.propagationMs, this.lightingTimings.initializationMs + this.lightingTimings.borderReconcileMs + this.lightingTimings.localRelightMs);
    capture.frameTimes.push(this.lastFrameTime);
    capture.updateTotal += this.lastUpdateTime;
    capture.updateMax = Math.max(capture.updateMax, this.lastUpdateTime);
    capture.renderTotal += this.lastRenderTime;
    capture.renderMax = Math.max(capture.renderMax, this.lastRenderTime);
    capture.generationTotal += generationMs;
    capture.generationMax = Math.max(capture.generationMax, generationMs);
    capture.integrationTotal += integrationMs;
    capture.integrationMax = Math.max(capture.integrationMax, integrationMs);
    capture.meshingTotal += meshingMs;
    capture.meshingMax = Math.max(capture.meshingMax, meshingMs);
    capture.meshUploadTotal += meshUploadMs;
    capture.meshUploadMax = Math.max(capture.meshUploadMax, meshUploadMs);
    capture.lightingTotal += lightingMs;
    capture.lightingMax = Math.max(capture.lightingMax, lightingMs);
    capture.lightingNodesProcessed += this.lightingTimings.nodesProcessed;
    capture.workerBytesCopied += this.meshingTimings.bytesCopied;
    capture.workerBytesTransferred += this.meshingTimings.bytesTransferred + this.generationTimings.bytesReceived;
    capture.workerBytesReturned += this.meshingTimings.bytesReturned + this.generationTimings.bytesReceived;
    capture.maxGenerationQueueDepth = Math.max(capture.maxGenerationQueueDepth, this.generationHistory.current());
    capture.maxMeshingQueueDepth = Math.max(capture.maxMeshingQueueDepth, this.meshingHistory.current());
    capture.maxPersistenceQueueDepth = Math.max(capture.maxPersistenceQueueDepth, this.persistenceHistory.current());
    capture.maxDrawCalls = Math.max(capture.maxDrawCalls, this.renderStats.drawCalls);
    capture.maxTriangles = Math.max(capture.maxTriangles, this.renderStats.triangles);
    capture.heapEndMb = heap;
    capture.heapMaxMb = Math.max(capture.heapMaxMb, heap);
    capture.profilerOverheadMs += this.profilerSelfMs;
    capture.debugOverlayMs += this.debugCollectMs + this.debugRenderMs;
    if (this.lastFrameTime >= this.longFrameThresholdMs) {
      const last = this.longFrames[this.longFrames.length - 1];
      if (last !== undefined) capture.longFrames.push(last);
    }
  }

  private summarizeCapture(capture: ActiveCapture, endedAtMs: number): PerformanceCaptureSummary {
    const sorted = [...capture.frameTimes].sort((a, b) => a - b);
    const frameCount = capture.frameTimes.length;
    const averageFrameTime = frameCount === 0 ? 0 : capture.frameTimes.reduce((sum, value) => sum + value, 0) / frameCount;
    return {
      label: capture.label,
      startedAtMs: capture.startedAtMs,
      endedAtMs,
      durationMs: endedAtMs - capture.startedAtMs,
      frameCount,
      averageFps: averageFrameTime > 0 ? 1000 / averageFrameTime : 0,
      onePercentLowFps: this.onePercentLowFps(sorted),
      averageFrameTimeMs: averageFrameTime,
      p95FrameTimeMs: percentile(sorted, 0.95),
      p99FrameTimeMs: percentile(sorted, 0.99),
      worstFrameTimeMs: sorted[sorted.length - 1] ?? 0,
      averageUpdateTimeMs: frameCount === 0 ? 0 : capture.updateTotal / frameCount,
      maxUpdateTimeMs: capture.updateMax,
      averageRenderTimeMs: frameCount === 0 ? 0 : capture.renderTotal / frameCount,
      maxRenderTimeMs: capture.renderMax,
      averageGenerationMs: frameCount === 0 ? 0 : capture.generationTotal / frameCount,
      maxGenerationMs: capture.generationMax,
      averageIntegrationMs: frameCount === 0 ? 0 : capture.integrationTotal / frameCount,
      maxIntegrationMs: capture.integrationMax,
      averageMeshingMs: frameCount === 0 ? 0 : capture.meshingTotal / frameCount,
      maxMeshingMs: capture.meshingMax,
      averageMeshUploadMs: frameCount === 0 ? 0 : capture.meshUploadTotal / frameCount,
      maxMeshUploadMs: capture.meshUploadMax,
      averageLightingMs: frameCount === 0 ? 0 : capture.lightingTotal / frameCount,
      maxLightingMs: capture.lightingMax,
      lightingNodesProcessed: capture.lightingNodesProcessed,
      workerBytesCopied: capture.workerBytesCopied,
      workerBytesTransferred: capture.workerBytesTransferred,
      workerBytesReturned: capture.workerBytesReturned,
      maxGenerationQueueDepth: capture.maxGenerationQueueDepth,
      maxMeshingQueueDepth: capture.maxMeshingQueueDepth,
      maxPersistenceQueueDepth: capture.maxPersistenceQueueDepth,
      maxDrawCalls: capture.maxDrawCalls,
      maxTriangles: capture.maxTriangles,
      heapStartMb: capture.heapStartMb,
      heapEndMb: capture.heapEndMb,
      heapMaxMb: capture.heapMaxMb,
      profilerOverheadMs: capture.profilerOverheadMs,
      debugOverlayMs: capture.debugOverlayMs,
      longFrames: [...capture.longFrames],
    };
  }
}
