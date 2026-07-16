export interface PerformanceSnapshot {
  readonly frameTimeMs: number;
  readonly worstFrameTimeMs: number;
  readonly updateTimeMs: number;
  readonly renderTimeMs: number;
  readonly meshUploadsThisFrame: number;
  readonly generationQueueSize: number;
  readonly oldestCriticalGenerationAgeMs: number;
  readonly meshingQueueSize: number;
  readonly activeWorkerCount: number;
  readonly completedWorkerJobs: number;
  readonly staleWorkerJobs: number;
  readonly workerErrors: number;
  readonly approximateGeometryMemoryMb: number;
}

export class PerformanceProfiler {
  private readonly frameSamples: number[] = [];
  private readonly maxSamples = 120;
  private frameStart = 0;
  private updateStart = 0;
  private renderStart = 0;
  private lastFrameTime = 0;
  private lastUpdateTime = 0;
  private lastRenderTime = 0;
  private meshUploadsThisFrame = 0;

  private generationQueueSize = 0;
  private oldestCriticalGenerationAgeMs = 0;
  private meshingQueueSize = 0;
  private activeWorkerCount = 0;
  private completedWorkerJobs = 0;
  private staleWorkerJobs = 0;
  private workerErrors = 0;
  private approximateGeometryMemoryMb = 0;

  public beginFrame(): void {
    this.frameStart = performance.now();
    this.meshUploadsThisFrame = 0;
  }

  public endFrame(): void {
    this.lastFrameTime = performance.now() - this.frameStart;
    this.frameSamples.push(this.lastFrameTime);
    if (this.frameSamples.length > this.maxSamples) {
      this.frameSamples.shift();
    }
  }

  public beginUpdate(): void {
    this.updateStart = performance.now();
  }

  public endUpdate(): void {
    this.lastUpdateTime = performance.now() - this.updateStart;
  }

  public beginRender(): void {
    this.renderStart = performance.now();
  }

  public endRender(): void {
    this.lastRenderTime = performance.now() - this.renderStart;
  }

  public recordMeshUpload(count = 1): void {
    this.meshUploadsThisFrame += count;
  }

  public setQueues(generation: number, meshing: number, activeWorkers: number, oldestCriticalGenerationAgeMs = 0): void {
    this.generationQueueSize = generation;
    this.meshingQueueSize = meshing;
    this.activeWorkerCount = activeWorkers;
    this.oldestCriticalGenerationAgeMs = oldestCriticalGenerationAgeMs;
  }

  public setWorkerCounters(completed: number, stale: number, errors: number): void {
    this.completedWorkerJobs = completed;
    this.staleWorkerJobs = stale;
    this.workerErrors = errors;
  }

  public setApproximateGeometryMemoryMb(value: number): void {
    this.approximateGeometryMemoryMb = value;
  }

  public getSnapshot(): PerformanceSnapshot {
    return {
      frameTimeMs: this.lastFrameTime,
      worstFrameTimeMs: this.frameSamples.length === 0 ? 0 : Math.max(...this.frameSamples),
      updateTimeMs: this.lastUpdateTime,
      renderTimeMs: this.lastRenderTime,
      meshUploadsThisFrame: this.meshUploadsThisFrame,
      generationQueueSize: this.generationQueueSize,
      oldestCriticalGenerationAgeMs: this.oldestCriticalGenerationAgeMs,
      meshingQueueSize: this.meshingQueueSize,
      activeWorkerCount: this.activeWorkerCount,
      completedWorkerJobs: this.completedWorkerJobs,
      staleWorkerJobs: this.staleWorkerJobs,
      workerErrors: this.workerErrors,
      approximateGeometryMemoryMb: this.approximateGeometryMemoryMb,
    };
  }
}
