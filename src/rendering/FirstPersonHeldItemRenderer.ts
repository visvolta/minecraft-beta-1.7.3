import * as THREE from 'three';
import type { Inventory } from '../inventory/Inventory';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../assets/ItemTextureAtlas';
import type { FirstPersonArmRenderer } from './FirstPersonArmRenderer';
import { presentationFor } from '../inventory/ItemRenderDefinition';
import { IsolatedBlockModelBuilder } from '../inventory/IsolatedBlockModelBuilder';
import { SpriteModelBuilder } from '../inventory/SpriteModelBuilder';
import { ItemIconResolver } from '../inventory/ItemIconResolver';
import { attachEntityLighting } from './ChunkRenderer';

/** Stage 1 first-person held model owner; deliberately no third-person or dropped path. */
export class FirstPersonHeldItemRenderer {
  readonly root = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private key = '';
  private blockMat: THREE.MeshBasicMaterial;
  private spriteMat: THREE.MeshBasicMaterial;
  private icons = new ItemIconResolver();

  constructor(
    arm: FirstPersonArmRenderer,
    private inv: Inventory,
    private blocks: BlockRegistry,
    private atlas: TextureAtlas,
    _items: ItemTextureAtlas
  ) {
    arm.armGroup.add(this.root);
    this.blockMat = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.1,
      transparent: true,
      fog: false,
    });
    this.spriteMat = new THREE.MeshBasicMaterial({
      map: _items.texture,
      alphaTest: 0.1,
      transparent: true,
      side: THREE.FrontSide,
      fog: false,
    });
    attachEntityLighting(this.blockMat);
    attachEntityLighting(this.spriteMat);
  }

  update(slot: number, _dt = 0): boolean {
    const s = this.inv.getStack(slot);
    const key = s ? `${s.identity.type}:${s.identity.id}:${s.metadata}` : '';
    if (key === this.key) return Boolean(s);
    this.key = key;

    if (this.mesh) {
      this.root.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.userData.ownedMaterial as THREE.Material | undefined)?.dispose();
      (this.mesh.userData.ownedTexture as THREE.Texture | undefined)?.dispose();
      this.mesh = null;
    }

    if (!s) return false;

    const d = presentationFor(s.identity, this.blocks);
    if (d.kind === 'block') {
      const def = this.blocks.getById(s.identity.id);
      if (!def) return false;
      this.mesh = new THREE.Mesh(IsolatedBlockModelBuilder.build(def, this.atlas), this.blockMat);
      this.mesh.userData.block = true;
    } else {
      const iconUrl = this.icons.resolve(String(s.identity.id));
      const texture = new THREE.TextureLoader().load(iconUrl);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = this.spriteMat.clone();
      material.map = texture;
      this.mesh = new THREE.Mesh(SpriteModelBuilder.build(0, 0, 1, 1, Boolean(d.flipHeldHorizontal)), material);
      this.mesh.userData.block = false;
      this.mesh.userData.ownedTexture = texture;
      this.mesh.userData.ownedMaterial = material;
    }

    this.mesh.position.set(...d.firstPerson.position);
    this.mesh.rotation.set(...d.firstPerson.rotation);
    this.mesh.scale.setScalar(d.firstPerson.scale);
    this.root.add(this.mesh);
    return true;
  }

  public updateLighting(skyLight: number, blockLight: number, skylightSubtracted: number, sunBrightnessFactor: number): void {
    const materials: THREE.MeshBasicMaterial[] = [this.blockMat, this.spriteMat];
    if (this.mesh && this.mesh.material instanceof THREE.MeshBasicMaterial && !materials.includes(this.mesh.material)) {
      materials.push(this.mesh.material);
    }
    for (const mat of materials) {
      const u = mat.userData.dynamicLightingUniforms as {
        uStaticSkyLight?: { value: number };
        uStaticBlockLight?: { value: number };
        uSkylightSubtracted?: { value: number };
        uSunBrightnessFactor?: { value: number };
      } | undefined;
      if (u && u.uStaticSkyLight && u.uStaticBlockLight && u.uSkylightSubtracted && u.uSunBrightnessFactor) {
        u.uStaticSkyLight.value = skyLight;
        u.uStaticBlockLight.value = blockLight;
        u.uSkylightSubtracted.value = skylightSubtracted;
        u.uSunBrightnessFactor.value = sunBrightnessFactor;
      }
    }
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    this.blockMat.dispose();
    this.spriteMat.dispose();
  }
}
