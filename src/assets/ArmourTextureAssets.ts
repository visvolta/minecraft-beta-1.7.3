import * as THREE from 'three';
import type { ArmourMaterialId, ArmourSlot } from '../items/ArmourMaterial';

export type ArmourTextureLayer = 1 | 2;
export type ArmourTextureKey = `${ArmourMaterialId}:${ArmourTextureLayer}`;

const MATERIAL_FILE_PREFIX: Readonly<Record<ArmourMaterialId, string>> = {
  leather: 'leather',
  chain: 'chainmail',
  iron: 'iron',
  gold: 'gold',
  diamond: 'diamond',
};

export function armourTextureLayerForSlot(slot: ArmourSlot): ArmourTextureLayer {
  return slot === 'leggings' ? 2 : 1;
}

export function configureArmourTexture(texture: THREE.Texture): void {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
}

/** Engine-owned cache of the ten supplied 64×32 armour textures. */
export class ArmourTextureAssets {
  private constructor(private readonly textures: ReadonlyMap<ArmourTextureKey, THREE.Texture>) {}

  public static async load(): Promise<ArmourTextureAssets> {
    const loader = new THREE.TextureLoader();
    const entries: Array<readonly [ArmourTextureKey, THREE.Texture]> = [];
    for (const material of Object.keys(MATERIAL_FILE_PREFIX) as ArmourMaterialId[]) {
      for (const layer of [1, 2] as const) {
        const key: ArmourTextureKey = `${material}:${layer}`;
        const prefix = MATERIAL_FILE_PREFIX[material];
        const texture = await loader.loadAsync(`/textures/armour/${prefix}_layer_${layer}.png`);
        configureArmourTexture(texture);
        entries.push([key, texture]);
      }
    }
    return new ArmourTextureAssets(new Map(entries));
  }

  public static fromTextures(textures: ReadonlyMap<ArmourTextureKey, THREE.Texture>): ArmourTextureAssets {
    for (const texture of textures.values()) configureArmourTexture(texture);
    return new ArmourTextureAssets(textures);
  }

  public get(material: ArmourMaterialId, layer: ArmourTextureLayer): THREE.Texture {
    const texture = this.textures.get(`${material}:${layer}`);
    if (texture === undefined) throw new Error(`Missing armour texture ${material}:${layer}`);
    return texture;
  }

  public get size(): number {
    return this.textures.size;
  }

  public dispose(): void {
    for (const texture of this.textures.values()) texture.dispose();
  }
}
