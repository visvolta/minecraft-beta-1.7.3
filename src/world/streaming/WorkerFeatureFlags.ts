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

/**
 * Mesh-heavy worker scaling (post mesh-buffer optimizations):
 * - Reserve capacity for the main/render thread.
 * - Keep generation modest (terrain is less parallelizable per-job).
 * - Allow more meshing workers on multi-core CPUs.
 * - Hard total cap avoids excessive snapshot RAM.
 */
export function getWorkerCount(feature: WorkerFeature): number {
  const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
  const reserve = hw >= 8 ? 2 : 1;
  const usable = Math.max(2, hw - reserve);
  // Hard total workers across both features.
  const totalCap = Math.min(8, usable);
  const gen = Math.max(1, Math.min(2, Math.floor(totalCap / 3)));
  const mesh = Math.max(1, totalCap - gen);
  return feature === 'generation' ? gen : mesh;
}
