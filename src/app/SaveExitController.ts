import type { Engine } from '../engine/Engine';
import { WRITE_PRIORITY_FORCED } from '../persistence2/WorldPersistenceService';

/**
 * Application-level Save-and-Quit orchestrator (Stage 3).
 *
 * State machine (correction 4):
 *   idle -> quiescing
 *   quiescing -> saving | failed | waiting_after_timeout
 *   saving -> completed | failed | waiting_after_timeout
 *   waiting_after_timeout -> completed | failed
 *   failed -> idle        (Return to World)
 *   failed -> quiescing   (Retry)
 * A timeout is NOT a terminal settlement state; Retry and Return-to-World remain
 * unavailable until the original operation settles.
 *
 * Watchdogs are DIAGNOSTIC ONLY (correction 1): they observe the operation
 * without owning, canceling or replacing it. On timeout they record the stalled
 * stage and move to waiting_after_timeout; the operation keeps running and the
 * state resolves to completed/failed when it settles. No Promise.race that
 * abandons the operation; timers are always cleared when a stage settles.
 *
 * Shutdown ordering (correction 5): freeze -> cancel reads -> settle reads +
 * unloads -> capture snapshots -> save chunks -> save metadata -> barrier ->
 * close service -> dispose engine -> (app navigates). If the service close
 * fails, the state is `failed` and the app never navigates to the title.
 */

export type SaveExitState = 'idle' | 'quiescing' | 'saving' | 'waiting_after_timeout' | 'failed' | 'completed';

export interface SaveExitDiagnostics {
  state: SaveExitState;
  stalledStage: string | null;
  elapsedMs: number;
  escalated: boolean;
  error: string | null;
  engine: ReturnType<Engine['getPersistenceDiagnostics']>;
}

export interface SaveExitCallbacks {
  onStateChange: (state: SaveExitState, diagnostics: SaveExitDiagnostics) => void;
  /** Called only on a fully successful save+close (the app may then navigate to the title). */
  onCompleted: () => void;
}

/** Per-stage watchdog budgets (correction 1). */
export const SAVE_EXIT_TIMEOUTS: SaveExitTimeouts = {
  quiesce: 10_000,
  settle: 20_000,
  dirtyFlush: 30_000,
  metadata: 20_000,
  close: 20_000,
  overall: 90_000,
};

/** Shape of the per-stage watchdog budgets. */
export interface SaveExitTimeouts {
  quiesce: number;
  settle: number;
  dirtyFlush: number;
  metadata: number;
  close: number;
  overall: number;
}

const VALID_TRANSITIONS: Record<SaveExitState, readonly SaveExitState[]> = {
  idle: ['quiescing'],
  quiescing: ['saving', 'failed', 'waiting_after_timeout'],
  saving: ['completed', 'failed', 'waiting_after_timeout'],
  waiting_after_timeout: ['completed', 'failed'],
  failed: ['idle', 'quiescing'],
  completed: [],
};

export class SaveExitController {
  private state: SaveExitState = 'idle';
  private stalledStage: string | null = null;
  private escalated = false;
  private error: string | null = null;
  private startedAtMs = 0;
  /** The original operation, retained for its whole life; watchdogs only observe it. */
  private activeOperation: Promise<void> | null = null;
  private overallTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly timeouts: SaveExitTimeouts;

  public constructor(
    private readonly engine: Engine,
    private readonly callbacks: SaveExitCallbacks,
    timeouts: Partial<SaveExitTimeouts> = {},
  ) {
    this.timeouts = { ...SAVE_EXIT_TIMEOUTS, ...timeouts };
  }

  public get currentState(): SaveExitState {
    return this.state;
  }

  /** Settled states allow Retry / Return-to-World; a timed-out (unsettled) operation does not. */
  public get isSettled(): boolean {
    return this.state === 'idle' || this.state === 'completed' || this.state === 'failed';
  }

  public getDiagnostics(): SaveExitDiagnostics {
    return {
      state: this.state,
      stalledStage: this.stalledStage,
      elapsedMs: this.startedAtMs > 0 ? Date.now() - this.startedAtMs : 0,
      escalated: this.escalated,
      error: this.error,
      engine: this.engine.getPersistenceDiagnostics(),
    };
  }

  /** Begin a Save-and-Quit attempt. Only from idle or failed (Retry). Prevents overlap/re-entrancy. */
  public start(): void {
    if (this.state !== 'idle' && this.state !== 'failed') return;
    this.error = null;
    this.escalated = false;
    this.stalledStage = null;
    this.startedAtMs = Date.now();
    this.engine.setSaveExitActive(true);
    this.transition('quiescing');
    this.overallTimer = setTimeout(() => {
      if (!this.isSettled) {
        this.escalated = true; // escalate severity; never abandon the operation
        this.notify();
      }
    }, this.timeouts.overall);
    this.activeOperation = this.runSequence();
    this.activeOperation.then(
      () => this.settle('completed'),
      (error) => this.settle('failed', error),
    );
  }

  /** Return to World (failed -> idle): resume gameplay; the world and service stay open. */
  public returnToWorld(): void {
    if (this.state !== 'failed') return; // unavailable unless settled in failed
    this.engine.resumeFromFailedSave();
    this.clearOverall();
    this.activeOperation = null;
    this.transition('idle');
  }

  private settle(state: 'completed' | 'failed', error?: unknown): void {
    this.clearOverall();
    if (state === 'failed') {
      this.error = error instanceof Error ? error.message : String(error);
    }
    this.transition(state);
    if (state === 'completed') {
      this.engine.setSaveExitActive(false);
      this.callbacks.onCompleted(); // navigate to title — only after a fully successful save+close
    }
  }

  private async runSequence(): Promise<void> {
    const service = this.engine.getPersistence();
    // 1. Freeze gameplay/streaming + cancel pending reads.
    await this.withWatchdog('quiesce', this.timeouts.quiesce, async () => {
      this.engine.freezeForSave();
    });
    // 2. Settle accepted reads + unloads. Rejects if an unload failed (abort final save).
    await this.withWatchdog('settle', this.timeouts.settle, async () => {
      await this.engine.settleAcceptedReads();
      await this.engine.settleAcceptedUnloads();
    });
    // 3. Capture immutable snapshots (mutations are frozen).
    const metadata = this.engine.captureMetadataSnapshot();
    const dirtyChunks = this.engine.dirtyChunkSnapshot();
    this.transition('saving');
    // 4. Save dirty chunks (forced) + barrier covering them.
    await this.withWatchdog('dirty-flush', this.timeouts.dirtyFlush, async () => {
      for (const chunk of dirtyChunks) service.saveChunk(chunk, WRITE_PRIORITY_FORCED).catch(() => undefined);
      await service.flushBarrier();
    });
    // 5. Save the captured metadata + barrier covering it (the final barrier).
    await this.withWatchdog('metadata', this.timeouts.metadata, async () => {
      await service.saveMetadata(metadata, WRITE_PRIORITY_FORCED);
      await service.flushBarrier();
    });
    // 6. Close the world service (never the shared backend). Failure here => failed (no navigation).
    await this.withWatchdog('close', this.timeouts.close, async () => {
      await service.close();
    });
    // 7. Dispose the engine (only after a successful close).
    this.engine.stop();
  }

  private withWatchdog(stage: string, timeoutMs: number, op: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          this.stalledStage = stage;
          this.transition('waiting_after_timeout'); // valid only from quiescing/saving
          this.notify();
        }
      }, timeoutMs);
      op().then(
        () => { settled = true; clearTimeout(timer); resolve(); },
        (error) => { settled = true; clearTimeout(timer); reject(error); },
      );
    });
  }

  private transition(to: SaveExitState): void {
    if (!VALID_TRANSITIONS[this.state].includes(to)) return; // ignore invalid transitions
    this.state = to;
    this.notify();
  }

  private notify(): void {
    this.callbacks.onStateChange(this.state, this.getDiagnostics());
  }

  private clearOverall(): void {
    if (this.overallTimer !== null) {
      clearTimeout(this.overallTimer);
      this.overallTimer = null;
    }
  }
}
