import type * as THREE from 'three';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';

/**
 * Applies world lighting to entity materials.
 *
 * `attachEntityLighting` gives every entity material the same Beta lighting
 * uniforms the chunk shader uses, but they default to full skylight. Without
 * something writing them each frame, mobs, dropped items, arrows and minecarts
 * render fully lit in caves and at night. This is that writer.
 *
 * Cost control: the light level at a block only changes when the entity moves
 * to a different cell or the world's own light/time state changes, so the
 * sample is cached per material group and recomputed only then. A frame where
 * nothing moves does no world lookups at all.
 */

interface EntityLightingUniforms {
  readonly uSkylightSubtracted?: { value: number };
  readonly uSunBrightnessFactor?: { value: number };
  readonly uStaticSkyLight?: { value: number };
  readonly uStaticBlockLight?: { value: number };
}

interface CacheEntry {
  blockX: number;
  blockY: number;
  blockZ: number;
  skyLight: number;
  blockLight: number;
  /** Atmosphere generation this sample was written for. */
  generation: number;
}

/** Anything the updater can light: an object3D plus its world position. */
export interface LightableEntity {
  readonly renderObject: THREE.Object3D | null;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

export class EntityLightingUpdater {
  private readonly cache = new WeakMap<THREE.Material, CacheEntry>();
  /** Bumped whenever sky darkness or sun brightness changes. */
  private generation = 0;
  private skylightSubtracted = 0;
  private sunBrightnessFactor = 1;

  public constructor(private readonly world: BlockUpdateWorld) {}

  /**
   * Records the current atmosphere. Changing it invalidates cached samples,
   * because the same block light produces different output brightness.
   */
  public setAtmosphere(skylightSubtracted: number, sunBrightnessFactor: number): void {
    if (skylightSubtracted === this.skylightSubtracted && sunBrightnessFactor === this.sunBrightnessFactor) return;
    this.skylightSubtracted = skylightSubtracted;
    this.sunBrightnessFactor = sunBrightnessFactor;
    this.generation++;
  }

  /** Lights one entity's whole material tree from its current position. */
  public update(entity: LightableEntity): void {
    const root = entity.renderObject;
    if (root === null) return;

    // Beta samples the light at the block containing the entity's eye/centre.
    const blockX = Math.floor(entity.position.x);
    const blockY = Math.floor(entity.position.y + 0.5);
    const blockZ = Math.floor(entity.position.z);

    root.traverse((node) => {
      const material = (node as THREE.Mesh).material;
      if (material === undefined || material === null) return;
      if (Array.isArray(material)) {
        for (const entry of material) this.applyToMaterial(entry, blockX, blockY, blockZ);
        return;
      }
      this.applyToMaterial(material, blockX, blockY, blockZ);
    });
  }

  private applyToMaterial(material: THREE.Material, blockX: number, blockY: number, blockZ: number): void {
    const uniforms = material.userData['dynamicLightingUniforms'] as EntityLightingUniforms | undefined;
    if (uniforms === undefined) return;

    const cached = this.cache.get(material);
    const stale = cached === undefined
      || cached.blockX !== blockX || cached.blockY !== blockY || cached.blockZ !== blockZ
      || cached.generation !== this.generation;

    let skyLight: number;
    let blockLight: number;
    if (stale) {
      skyLight = this.world.getSkylight(blockX, blockY, blockZ);
      blockLight = this.world.getBlocklight(blockX, blockY, blockZ);
      this.cache.set(material, { blockX, blockY, blockZ, skyLight, blockLight, generation: this.generation });
    } else {
      skyLight = cached.skyLight;
      blockLight = cached.blockLight;
    }

    if (uniforms.uStaticSkyLight !== undefined) uniforms.uStaticSkyLight.value = skyLight;
    if (uniforms.uStaticBlockLight !== undefined) uniforms.uStaticBlockLight.value = blockLight;
    if (uniforms.uSkylightSubtracted !== undefined) uniforms.uSkylightSubtracted.value = this.skylightSubtracted;
    if (uniforms.uSunBrightnessFactor !== undefined) uniforms.uSunBrightnessFactor.value = this.sunBrightnessFactor;
  }
}
