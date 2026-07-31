/**
 * Queue drain behaviour tracker.
 *
 * Average FPS hides the failure mode that matters most during exploration: a
 * pipeline queue that grows and never recovers. A build can look smooth while
 * the generation backlog climbs monotonically, which is exactly what the
 * baseline profile showed (generation queue 39 -> 61 while standing still).
 *
 * This records, per queue:
 *   - the peak depth seen in the current "busy" episode;
 *   - how long the queue took to return to (near) empty after the peak;
 *   - the steady-state depth while idle;
 *   - whether the queue is currently failing to drain.
 *
 * Diagnostic only: nothing here influences scheduling or simulation.
 */

/** Depth at or below which a queue counts as drained. */
const DRAINED_THRESHOLD = 2;

/**
 * How long the queue must stay at/below {@link DRAINED_THRESHOLD} before the
 * episode is considered finished. Prevents a momentary dip from ending an
 * episode that is still actively churning.
 */
const DRAIN_CONFIRM_MS = 500;

/**
 * A queue that stays above the threshold for longer than this without its peak
 * decreasing is reported as `notDraining` — the failure state.
 */
const STALL_MS = 10_000;

export interface QueueDrainStats {
  /** Highest depth observed during the current or most recent episode. */
  readonly peakDepth: number;
  /** Milliseconds from peak to drained for the most recent completed episode. */
  readonly lastDrainMs: number;
  /** Depth right now. */
  readonly currentDepth: number;
  /** Depth observed while the queue is considered idle. */
  readonly steadyStateDepth: number;
  /** True while the queue is above the drained threshold. */
  readonly busy: boolean;
  /** True when the queue has been busy for a long time without its peak falling. */
  readonly notDraining: boolean;
  /** Completed busy episodes since construction. */
  readonly episodes: number;
}

export class QueueDrainTracker {
  private peakDepth = 0;
  private currentDepth = 0;
  private steadyStateDepth = 0;
  private lastDrainMs = 0;
  private episodes = 0;
  private busy = false;
  private notDraining = false;

  private episodeStartMs = 0;
  private peakAtMs = 0;
  private belowSinceMs: number | null = null;

  public constructor(private readonly now: () => number = () => performance.now()) {}

  /** Feeds the current depth. Call once per frame per queue. */
  public sample(depth: number): void {
    const t = this.now();
    this.currentDepth = depth;

    if (depth > DRAINED_THRESHOLD) {
      if (!this.busy) {
        // New busy episode.
        this.busy = true;
        this.episodeStartMs = t;
        this.peakDepth = depth;
        this.peakAtMs = t;
        this.notDraining = false;
      }
      if (depth >= this.peakDepth) {
        this.peakDepth = depth;
        this.peakAtMs = t;
      }
      this.belowSinceMs = null;
      // Still above threshold long after the peak, and the peak keeps being
      // re-hit: the queue is not making progress.
      if (t - this.episodeStartMs > STALL_MS && t - this.peakAtMs < STALL_MS) {
        this.notDraining = true;
      }
      return;
    }

    // At or below the drained threshold.
    if (this.busy) {
      if (this.belowSinceMs === null) {
        this.belowSinceMs = t;
      } else if (t - this.belowSinceMs >= DRAIN_CONFIRM_MS) {
        this.lastDrainMs = this.belowSinceMs - this.peakAtMs;
        this.busy = false;
        this.notDraining = false;
        this.episodes += 1;
        this.belowSinceMs = null;
      }
    } else {
      this.steadyStateDepth = depth;
    }
  }

  public getStats(): QueueDrainStats {
    return {
      peakDepth: this.peakDepth,
      lastDrainMs: this.lastDrainMs,
      currentDepth: this.currentDepth,
      steadyStateDepth: this.steadyStateDepth,
      busy: this.busy,
      notDraining: this.notDraining,
      episodes: this.episodes,
    };
  }

  /** Clears all state, e.g. at the start of a benchmark run. */
  public reset(): void {
    this.peakDepth = 0;
    this.currentDepth = 0;
    this.steadyStateDepth = 0;
    this.lastDrainMs = 0;
    this.episodes = 0;
    this.busy = false;
    this.notDraining = false;
    this.episodeStartMs = 0;
    this.peakAtMs = 0;
    this.belowSinceMs = null;
  }
}
