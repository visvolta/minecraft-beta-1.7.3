import { measureSaveAsync, recordSaveEvent } from '../debug/SavePipelineTrace';

export type SaveExitStage =
  | 'idle'
  | 'preparing'
  | 'snapshotting'
  | 'saving_chunks'
  | 'committing_regions'
  | 'writing_metadata'
  | 'shutting_down'
  | 'complete'
  | 'failed';

export interface SaveExitOperationSnapshot {
  readonly id: number;
  readonly stage: SaveExitStage;
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
  readonly error: string | undefined;
}

export interface SaveExitOperationSteps {
  readonly prepare: () => Promise<void>;
  readonly snapshot: () => Promise<void>;
  readonly saveChunks: () => Promise<void>;
  readonly commitRegions: () => Promise<void>;
  readonly writeMetadata: () => Promise<void>;
  readonly shutdown: () => Promise<void>;
}

let nextOperationId = 1;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Owns one explicit, observable Save and Exit transaction. */
export class SaveExitOperation {
  private currentStage: SaveExitStage = 'idle';
  private startedAtMs: number | null = null;
  private endedAtMs: number | null = null;
  private error: string | undefined;
  private activePromise: Promise<SaveExitOperationSnapshot> | null = null;

  public readonly id = nextOperationId++;

  public get stage(): SaveExitStage { return this.currentStage; }
  public get isActive(): boolean { return this.activePromise !== null; }

  public getSnapshot(): SaveExitOperationSnapshot {
    return {
      id: this.id,
      stage: this.currentStage,
      startedAtMs: this.startedAtMs ?? Date.now(),
      endedAtMs: this.endedAtMs,
      error: this.error,
    };
  }

  public run(steps: SaveExitOperationSteps): Promise<SaveExitOperationSnapshot> {
    if (this.activePromise !== null) return this.activePromise;
    this.startedAtMs = Date.now();
    this.endedAtMs = null;
    this.error = undefined;
    this.activePromise = this.execute(steps).finally(() => {
      this.activePromise = null;
    });
    return this.activePromise;
  }

  private async execute(steps: SaveExitOperationSteps): Promise<SaveExitOperationSnapshot> {
    try {
      await this.runStage('preparing', steps.prepare);
      await this.runStage('snapshotting', steps.snapshot);
      await this.runStage('saving_chunks', steps.saveChunks);
      await this.runStage('committing_regions', steps.commitRegions);
      await this.runStage('writing_metadata', steps.writeMetadata);
      await this.runStage('shutting_down', steps.shutdown);
      this.currentStage = 'complete';
      recordSaveEvent('save.operation.complete', { ...this.getSnapshot() });
    } catch (error) {
      this.error = messageOf(error);
      this.currentStage = 'failed';
      recordSaveEvent('save.operation.failed', { ...this.getSnapshot() });
      throw error;
    } finally {
      this.endedAtMs = Date.now();
      recordSaveEvent('save.operation.ended', { ...this.getSnapshot() });
    }
    return this.getSnapshot();
  }

  private async runStage(stage: Exclude<SaveExitStage, 'idle' | 'complete' | 'failed'>, work: () => Promise<void>): Promise<void> {
    this.currentStage = stage;
    console.info('[SavePipelineTrace] save.operation.stage', { operationId: this.id, stage });
    recordSaveEvent(`save.operation.stage.${stage}`, { ...this.getSnapshot() });
    await measureSaveAsync(`save.operation.${stage}`, { ...this.getSnapshot() }, work);
  }
}
