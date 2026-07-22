import * as THREE from 'three';
import { type ArmourTextureLayer, ArmourTextureAssets } from '../../assets/ArmourTextureAssets';
import { ARMOUR_MATERIALS, type ArmourMaterialId } from '../../items/ArmourMaterial';
import { attachEntityLighting } from '../ChunkRenderer';

export type ArmourMaterialKey = `${ArmourMaterialId}:${ArmourTextureLayer}`;

interface ArmourLightingUniforms {
  readonly uStaticSkyLight?: { value: number };
  readonly uStaticBlockLight?: { value: number };
  readonly uSkylightSubtracted?: { value: number };
  readonly uSunBrightnessFactor?: { value: number };
}

/** Engine-owned cache of one entity-lit material per material/layer pair. */
export class ArmourMaterialCache {
  private readonly materials = new Map<ArmourMaterialKey, THREE.MeshBasicMaterial>();

  public constructor(textures: ArmourTextureAssets) {
    for (const material of Object.keys(ARMOUR_MATERIALS) as ArmourMaterialId[]) {
      for (const layer of [1, 2] as const) {
        const key: ArmourMaterialKey = `${material}:${layer}`;
        const renderMaterial = new THREE.MeshBasicMaterial({
          map: textures.get(material, layer),
          transparent: true,
          alphaTest: 0.1,
          depthTest: true,
          depthWrite: true,
          side: THREE.FrontSide,
          fog: true,
        });
        attachEntityLighting(renderMaterial);
        renderMaterial.userData.armourMaterial = material;
        renderMaterial.userData.armourLayer = layer;
        this.materials.set(key, renderMaterial);
      }
    }
  }

  public get(material: ArmourMaterialId, layer: ArmourTextureLayer): THREE.MeshBasicMaterial {
    const renderMaterial = this.materials.get(`${material}:${layer}`);
    if (renderMaterial === undefined) throw new Error(`Missing armour material ${material}:${layer}`);
    return renderMaterial;
  }

  public get size(): number {
    return this.materials.size;
  }

  public values(): IterableIterator<THREE.MeshBasicMaterial> {
    return this.materials.values();
  }

  public updateLighting(
    skyLight: number,
    blockLight: number,
    skylightSubtracted: number,
    sunBrightnessFactor: number,
  ): void {
    for (const material of this.materials.values()) {
      const uniforms = material.userData.dynamicLightingUniforms as ArmourLightingUniforms | undefined;
      if (uniforms?.uStaticSkyLight) uniforms.uStaticSkyLight.value = skyLight;
      if (uniforms?.uStaticBlockLight) uniforms.uStaticBlockLight.value = blockLight;
      if (uniforms?.uSkylightSubtracted) uniforms.uSkylightSubtracted.value = skylightSubtracted;
      if (uniforms?.uSunBrightnessFactor) uniforms.uSunBrightnessFactor.value = sunBrightnessFactor;
    }
  }

  public dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}
