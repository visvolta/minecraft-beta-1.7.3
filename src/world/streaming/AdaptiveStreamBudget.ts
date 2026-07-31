/**
 * Adaptive per-frame streaming budget.
 *
 * The streaming pipeline previously used fixed constants (2 integrations /
 * 3 ms per frame) regardless of how the frame was actually going. That is
 * simultaneously too generous on a struggling frame and too stingy when there
 * is headroom and a backlog to clear.
 *
 * This computes a budget from two independent signals:
 *
 *   frame-time health   — how close the smoothed frame time is to target
 *   pipeline pressure   — how much work is queued
 *
 * and combines them so that:
 *
 *   bad frame + low pressure   -> shrink aggressively (nothing urgent to do)
 *   bad frame + high pressure  -> shrink only to the guaranteed minimum
 *   good frame + pressure      -> grow gradually to clear the backlog
 *   good frame + no pressure   -> stay conservative (don't burn budget idly)
 *
 * Three properties are non-negotiable:
 *
 *  1. **Guaranteed forward progress.** The budget never reaches zero. A
 *     scheduler that "fixes" frame time by refusing to finish chunks would
 *     look good on paper and never load the world.
 *  2. **Smoothed input.** Decisions run off an EMA, never a single frame, so a
 *     GC pause, shader compile, tab resume or resize cannot collapse the
 *     budget. Frame deltas are clamped before they enter the average.
 *  3. **Hysteresis + cooldown.** Separate raise/lower thresholds and a minimum
 *     interval between changes prevent oscillation around a threshold.
 */

/** Frame-time band the scheduler aims to stay inside. */
const TARGET_FRAME_MS = 13;
/** Above this smoothed frame time the budget shrinks. */
const HIGH_FRAME_MS = 18;
/** Severe overrun: shrink hard (but never below the guaranteed minimum). */
const SEVERE_FRAME_MS = 24;

/**
 * Frame deltas above this are treated as outliers and clamped before entering
 * the EMA: a 500 ms frame from a background-tab resume says nothing about how
 * much streaming work the machine can absorb.
 */
const MAX_CREDIBLE_FRAME_MS = 100;

/** EMA smoothing factor. ~0.1 gives a time constant of roughly 10 frames. */
const EMA_ALPHA = 0.1;

/** Minimum ms between budget changes, so the budget cannot oscillate. */
const CHANGE_COOLDOWN_MS = 250;

/** Pipeline depth above which the backlog is considered significant. */
const PRESSURE_BACKLOG = 24;
/** Pipeline depth above which the backlog is considered severe. */
const PRESSURE_SEVERE = 96;

export interface StreamBudget {
  /** Maximum chunk integrations to adopt this frame. Always >= 1. */
  readonly integrations: number;
  /** Wall-clock allowance in ms for integration work. Always > 0. */
  readonly integrationMs: number;
  /** Wall-clock allowance in ms for the lighting drain. Always > 0. */
  readonly lightingMs: number;
}

/** Aggregated pipeline depth, mirroring the reference's pressure model. */
export interface PipelinePressure {
  readonly generationQueue: number;
  readonly meshQueue: number;
  readonly pendingUploads: number;
  readonly pendingLighting: number;
}

/** Guaranteed floor. Progress must never stop, however bad the frame time. */
const MIN_BUDGET: StreamBudget = { integrations: 1, integrationMs: 1.5, lightingMs: 1 };

/**
 * Throughput floor used when the pipeline is severely backed up.
 *
 * Dropping to the absolute minimum in that state is self-defeating: the queue
 * would never recover and the world would stop filling in. This keeps a
 * modest but non-trivial rate even while frame time is poor.
 */
const BACKLOG_FLOOR: StreamBudget = { integrations: 2, integrationMs: 2.5, lightingMs: 1.5 };

/** Ceiling, so a long idle stretch cannot authorise an enormous burst. */
const MAX_BUDGET: StreamBudget = { integrations: 8, integrationMs: 10, lightingMs: 6 };

/** Starting point, equivalent to the previous fixed constants. */
const BASE_BUDGET: StreamBudget = { integrations: 2, integrationMs: 3, lightingMs: 2 };

export class AdaptiveStreamBudget {
  /** Smoothed frame time. Seeded at target so startup is not treated as slow. */
  private emaFrameMs = TARGET_FRAME_MS;
  private current: StreamBudget = BASE_BUDGET;
  /** Last time the budget was re-evaluated (rate limit, independent of change). */
  private lastEvalMs = Number.NEGATIVE_INFINITY;
  /** Diagnostic: why the budget last moved. */
  private lastReason = 'init';

  public constructor(private readonly now: () => number = () => performance.now()) {}

  /**
   * Feeds one frame's wall-clock delta. Outliers are clamped rather than
   * dropped, so a genuinely slow machine still registers as slow.
   */
  public sampleFrame(frameMs: number): void {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    const credible = frameMs > MAX_CREDIBLE_FRAME_MS ? MAX_CREDIBLE_FRAME_MS : frameMs;
    this.emaFrameMs += (credible - this.emaFrameMs) * EMA_ALPHA;
  }

  /**
   * Recomputes the budget from smoothed frame time and current pressure.
   * Safe to call every frame; the cooldown limits how often it actually moves.
   */
  public update(pressure: PipelinePressure): StreamBudget {
    const total = pressure.generationQueue + pressure.meshQueue
      + pressure.pendingUploads + pressure.pendingLighting;

    const t = this.now();
    // Rate-limit EVALUATION, not just mutation. Gating on the last *change*
    // meant a budget sitting at its ceiling had a stale timestamp, so the very
    // next sample could move it immediately — the oscillation this is meant to
    // prevent.
    if (t - this.lastEvalMs < CHANGE_COOLDOWN_MS) return this.current;
    this.lastEvalMs = t;

    const frame = this.emaFrameMs;
    const backlog = total >= PRESSURE_BACKLOG;
    const severeBacklog = total >= PRESSURE_SEVERE;

    let next = this.current;
    let reason: string;

    if (frame >= SEVERE_FRAME_MS) {
      // Severely over budget. With a severe backlog we still guarantee more
      // than the bare minimum, or the queue would never recover.
      next = severeBacklog ? scale(this.current, 0.6, BACKLOG_FLOOR) : MIN_BUDGET;
      reason = severeBacklog ? 'severe-frame+severe-backlog' : 'severe-frame';
    } else if (frame >= HIGH_FRAME_MS) {
      next = backlog
        ? scale(this.current, 0.8, severeBacklog ? BACKLOG_FLOOR : MIN_BUDGET)
        : scale(this.current, 0.65, MIN_BUDGET);
      reason = backlog ? 'high-frame+backlog' : 'high-frame';
    } else if (frame <= TARGET_FRAME_MS && backlog) {
      // Headroom AND work to do: grow, faster when the backlog is severe.
      next = grow(this.current, severeBacklog ? 1.5 : 1.25);
      reason = severeBacklog ? 'headroom+severe-backlog' : 'headroom+backlog';
    } else if (!backlog && frame <= TARGET_FRAME_MS) {
      // Idle and healthy: drift back toward the conservative base so the next
      // burst starts from a sane place rather than a stale high budget.
      next = towards(this.current, BASE_BUDGET);
      reason = 'idle-normalise';
    } else {
      return this.current; // Inside the hysteresis band: leave it alone.
    }

    if (!equal(next, this.current)) {
      this.current = next;
      this.lastReason = reason;
    }
    return this.current;
  }

  public get budget(): StreamBudget { return this.current; }
  public get smoothedFrameMs(): number { return this.emaFrameMs; }
  public get reason(): string { return this.lastReason; }

  /** Diagnostic snapshot for the profiler/benchmark. */
  public getStats(): {
    readonly smoothedFrameMs: number;
    readonly integrations: number;
    readonly integrationMs: number;
    readonly lightingMs: number;
    readonly reason: string;
  } {
    return {
      smoothedFrameMs: this.emaFrameMs,
      integrations: this.current.integrations,
      integrationMs: this.current.integrationMs,
      lightingMs: this.current.lightingMs,
      reason: this.lastReason,
    };
  }
}

function scale(b: StreamBudget, factor: number, floor: StreamBudget): StreamBudget {
  return {
    integrations: Math.max(floor.integrations, Math.floor(b.integrations * factor)),
    integrationMs: Math.max(floor.integrationMs, b.integrationMs * factor),
    lightingMs: Math.max(floor.lightingMs, b.lightingMs * factor),
  };
}

function grow(b: StreamBudget, factor: number): StreamBudget {
  return {
    integrations: Math.min(MAX_BUDGET.integrations, Math.max(b.integrations + 1, Math.ceil(b.integrations * factor))),
    integrationMs: Math.min(MAX_BUDGET.integrationMs, b.integrationMs * factor),
    lightingMs: Math.min(MAX_BUDGET.lightingMs, b.lightingMs * factor),
  };
}

/** Moves one step toward `target` rather than snapping, avoiding a visible jolt. */
function towards(b: StreamBudget, target: StreamBudget): StreamBudget {
  const step = (from: number, to: number): number => from + (to - from) * 0.34;
  return {
    integrations: b.integrations > target.integrations ? b.integrations - 1
      : b.integrations < target.integrations ? b.integrations + 1 : b.integrations,
    integrationMs: step(b.integrationMs, target.integrationMs),
    lightingMs: step(b.lightingMs, target.lightingMs),
  };
}

function equal(a: StreamBudget, b: StreamBudget): boolean {
  return a.integrations === b.integrations
    && Math.abs(a.integrationMs - b.integrationMs) < 0.01
    && Math.abs(a.lightingMs - b.lightingMs) < 0.01;
}
