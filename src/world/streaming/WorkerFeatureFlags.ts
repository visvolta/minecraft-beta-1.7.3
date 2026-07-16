export type WorkerFeature = 'generation' | 'meshing';

const DEFAULTS: Record<WorkerFeature, boolean> = {
  generation: true,
  meshing: true,
};

function storageKey(feature: WorkerFeature): string {
  return `minecraft.workers.${feature}`;
}

/**
 * Central worker feature configuration. Defaults are code-owned; localStorage
 * is only a developer override so runtime behaviour is not implicitly owned by
 * browser storage.
 */
export function isWorkerFeatureEnabled(feature: WorkerFeature): boolean {
  try {
    const override = window.localStorage.getItem(storageKey(feature));
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // Ignore unavailable storage; use code default.
  }
  return DEFAULTS[feature];
}

function totalWorkerBudget(): number {
  const logicalCores = navigator.hardwareConcurrency ?? 4;
  return Math.max(2, Math.min(4, logicalCores - 1));
}

export function getWorkerCount(feature: WorkerFeature): number {
  const total = totalWorkerBudget();
  if (feature === 'generation') {
    return Math.ceil(total / 2);
  }
  return Math.floor(total / 2);
}
