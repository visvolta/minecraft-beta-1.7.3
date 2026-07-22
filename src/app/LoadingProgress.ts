export type LoadingStage = 'metadata' | 'storage' | 'terrain' | 'chunks' | 'entities' | 'player' | 'finalizing';
export interface LoadingProgress {
  readonly stage: LoadingStage;
  readonly completed: number;
  readonly total: number | undefined;
  readonly primaryMessage: string;
  readonly secondaryMessage?: string;
}
export function progressRatio(progress: LoadingProgress): number | undefined {
  return progress.total === undefined || progress.total <= 0 ? undefined : Math.max(0, Math.min(1, progress.completed / progress.total));
}
