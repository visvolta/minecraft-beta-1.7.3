import * as THREE from 'three';
import type { MeshBasicMaterial, Object3D } from 'three';
import { wrapDegrees } from '../entities/living/LivingAnimationMath';
import type { EntityModel } from '../entities/living/EntityModel';

/** Single model-boundary conversion: entity yaw 0/+Z to Three.js local +Z. */
export function interpolateLivingBodyYaw(previousDegrees: number, currentDegrees: number, alpha: number): number {
  return previousDegrees + wrapDegrees(currentDegrees - previousDegrees) * alpha;
}

export function applyLivingRootYaw(root: Object3D, previousDegrees: number, currentDegrees: number, alpha: number): number {
  const bodyYaw = interpolateLivingBodyYaw(previousDegrees, currentDegrees, alpha);
  root.rotation.y = -bodyYaw * Math.PI / 180;
  return bodyYaw;
}

/**
 * Apply the shared hurt-flash + death rotation that every living entity model
 * should exhibit. Accepts a `tinter` callback so the helper works for models
 * that do NOT extend {@link EntityModel} (e.g. {@link PlayerModel}) — the
 * caller decides how to propagate the 0..1 red-flash amount.
 *
 *  - Hurt tint: ramps 0..1 over the 10-tick hurt window; 0 when alive and not
 *    recently hit.
 *  - Burning entities do NOT have their body colour changed; fire is drawn via
 *    the dedicated entity fire overlay, keeping dynamic lighting intact.
 *  - Death rotation: eases `deathGroup` over 90 degrees onto its side over 20
 *    ticks (Beta `deathTime`). Many models nest their parts under a dedicated
 *    body-yaw/pose group that sits below the entity root; rotating that group
 *    avoids fighting with the Y rotation applied by {@link applyLivingRootYaw}.
 */
export function applyLivingVisualState(
  applyTint: (amount: number) => void,
  deathGroup: Object3D,
  opts: {
    readonly hurtTime: number;
    readonly maxHurtTime: number;
    readonly dead: boolean;
    readonly deathTime: number;
  },
): void {
  const flash = !opts.dead && opts.maxHurtTime > 0
    ? opts.hurtTime / opts.maxHurtTime
    : 0;
  applyTint(flash);
  deathGroup.rotation.z = opts.dead ? Math.min(opts.deathTime / 20, 1) * (Math.PI / 2) : 0;
}

/** Variant for models that extend {@link EntityModel} (which exposes setHurtFlash). */
export function applyEntityModelVisualState(
  model: EntityModel,
  deathGroup: Object3D,
  opts: {
    readonly hurtTime: number;
    readonly maxHurtTime: number;
    readonly dead: boolean;
    readonly deathTime: number;
  },
): void {
  applyLivingVisualState((amount) => model.setHurtFlash(amount), deathGroup, opts);
}

/** Collect every MeshBasicMaterial under a root, for models that share one material. */
export function collectMaterials(root: Object3D): MeshBasicMaterial[] {
  const out: MeshBasicMaterial[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh === true && mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && 'color' in m) out.push(m as MeshBasicMaterial);
      }
    }
  });
  return out;
}
