/**
 * Plain data holder for one frame's worth of F3 debug-overlay values.
 * No DOM, no Three.js, no world/engine references — DebugOverlay only
 * ever reads a DebugStats instance to render text; something else
 * (DebugStatsCollector, wired up in Engine) is responsible for filling
 * one in each frame.
 */
export interface DebugStats {
  readonly fps: number;
  readonly frameTimeMs: number;

  readonly playerX: number;
  readonly playerY: number;
  readonly playerZ: number;
  readonly chunkX: number;
  readonly chunkZ: number;

  readonly biomeName: string;
  readonly worldSeed: string;
  readonly worldTime: number;
  readonly dayNumber: number;
  readonly celestialAngle: number;
  readonly skyPhase: string;
  readonly loadedChunks: number;
  readonly visibleChunkMeshes: number;

  readonly triangleCount: number;
  readonly drawCalls: number;
  readonly dirtyChunkQueueSize: number;

  readonly fogMode: string;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly starOpacity: number;
  readonly sunAltitude: number;
  readonly skyColorHex: string;
  readonly fogColorHex: string;

  readonly noClip: boolean;
}

/**
 * Tracks a short rolling window of frame times to produce a stable FPS /
 * frame-time reading, rather than the instantaneous (and visually noisy)
 * single-frame delta. Kept tiny and dependency-free.
 */
export class FrameTimeTracker {
  private readonly samples: number[] = [];
  private readonly maxSamples: number;

  public constructor(maxSamples = 30) {
    this.maxSamples = maxSamples;
  }

  /** Records this frame's delta (seconds) and returns the current smoothed FPS. */
  public record(deltaSeconds: number): void {
    if (deltaSeconds <= 0) {
      // First frame (no previous timestamp yet) or a paused/zero-delta
      // frame; nothing meaningful to record.
      return;
    }

    this.samples.push(deltaSeconds);

    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /** Average frame time in milliseconds over the current window. */
  public getAverageFrameTimeMs(): number {
    if (this.samples.length === 0) {
      return 0;
    }

    const sum = this.samples.reduce((total, sample) => total + sample, 0);
    return (sum / this.samples.length) * 1000;
  }

  /** Frames per second derived from the average frame time. */
  public getFps(): number {
    const averageMs = this.getAverageFrameTimeMs();
    return averageMs > 0 ? 1000 / averageMs : 0;
  }
}
