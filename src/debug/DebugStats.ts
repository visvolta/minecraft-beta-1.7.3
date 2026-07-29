/**
 * Plain data holder for one frame's worth of F3 debug-overlay values.
 *
 * Deliberately small: this is the *player-facing* debug screen, matching
 * Beta 1.7.3's compact `GuiIngame` overlay rather than a developer
 * dashboard. Detailed profiling (per-phase timings, worker counters,
 * queue histories, occlusion analysis, persistence lanes) stays in
 * PerformanceProfiler and is reachable through the `window.__mcDebug`
 * console API — never through this overlay.
 *
 * Every field here must be readable from an already-maintained counter
 * or a slow-cadence cached sample; populating F3 must never trigger a
 * world scan.
 */
export interface DebugStats {
  /** Instantaneous frames per second. */
  readonly fps: number;
  /** Smoothed frame time in milliseconds. */
  readonly frameTimeMs: number;

  readonly playerX: number;
  readonly playerY: number;
  readonly playerZ: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  /** Beta facing index: floor(yaw * 4 / 360 + 0.5) & 3. */
  readonly facingIndex: number;
  /** Human-readable compass direction for the facing index. */
  readonly facingName: string;

  /** Active dimension, e.g. "Nether (-1)". */
  readonly dimensionLabel: string;
  readonly loadedChunks: number;
  /** Live render distance in chunks (GameSettings.video.renderDistance). */
  readonly renderDistance: number;
  readonly entityCount: number;

  readonly triangleCount: number;
  readonly drawCalls: number;

  /** JS heap estimate in MB; zero when the browser does not expose it. */
  readonly memoryUsedMb: number;
  readonly memoryTotalMb: number;

  readonly generationQueueSize: number;
  readonly meshingQueueSize: number;
}

/**
 * Rolling window of recent frame deltas, so the overlay shows a stable
 * frame-time reading rather than the visually noisy single-frame delta.
 * Kept tiny and dependency-free.
 */
export class FrameTimeTracker {
  private readonly samples: number[] = [];
  private readonly maxSamples: number;
  /** Running sum, so the average is O(1) instead of reducing every read. */
  private sum = 0;

  public constructor(maxSamples = 30) {
    this.maxSamples = maxSamples;
  }

  /** Records this frame's delta (seconds). */
  public record(deltaSeconds: number): void {
    if (deltaSeconds <= 0) {
      // First frame (no previous timestamp yet) or a paused/zero-delta frame.
      return;
    }

    this.samples.push(deltaSeconds);
    this.sum += deltaSeconds;

    if (this.samples.length > this.maxSamples) {
      this.sum -= this.samples.shift()!;
    }
  }

  /** Average frame time in milliseconds over the current window. */
  public getAverageFrameTimeMs(): number {
    if (this.samples.length === 0) return 0;
    return (this.sum / this.samples.length) * 1000;
  }

  /** Frames per second derived from the average frame time. */
  public getFps(): number {
    const averageMs = this.getAverageFrameTimeMs();
    return averageMs > 0 ? 1000 / averageMs : 0;
  }
}
