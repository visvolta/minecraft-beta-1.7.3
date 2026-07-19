import * as THREE from 'three';
import type { PlayerSkinManager } from '../player/PlayerSkinManager';
import { attachEntityLighting } from './ChunkRenderer';

/** Stage 1 owner of the dedicated first-person right-arm mesh and arm-only camera pose. */
export class FirstPersonArmRenderer {
  public readonly scene = new THREE.Scene();
  public readonly armGroup = new THREE.Group();
  public readonly material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.1, fog: false });
  public readonly armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), this.material);
  public readonly sleeveMesh = new THREE.Mesh(new THREE.BoxGeometry(0.252, 0.752, 0.252), this.material);

  public constructor() {
    attachEntityLighting(this.material);

    this.armMesh.position.set(0, -0.375, 0);
    this.sleeveMesh.position.set(0, -0.375, 0);
    this.sleeveMesh.visible = false;
    this.armGroup.add(this.armMesh, this.sleeveMesh);
    this.scene.add(this.armGroup);

    this.loadDedicatedTexture();
    this.applyDedicatedUVs(this.armMesh.geometry);
    this.applyDedicatedUVs(this.sleeveMesh.geometry);
  }

  private loadDedicatedTexture(): void {
    if (typeof document === 'undefined') return;
    const loader = new THREE.TextureLoader();
    loader.load(
      '/textures/gui/firstperson-handtexture.png',
      (texture) => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.needsUpdate = true;
        this.material.map = texture;
        this.material.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.error(
          '[FirstPersonArmRenderer] Failed to load dedicated first-person arm texture at /textures/gui/firstperson-handtexture.png:',
          err
        );
      }
    );
  }

  /**
   * Applies explicit UV mapping for the 8x8 dedicated firstperson-handtexture.png.
   * - lighter shading (u: 0.5 to 1.0) = top face (+Y, Face 2)
   * - darker shading (u: 0.0 to 0.5) = left face (-X, Face 1)
   * - remaining faces correctly oriented without horizontal flips, vertical flips, or mirrored faces.
   */
  private applyDedicatedUVs(geometry: THREE.BufferGeometry): void {
    const uvAttribute = geometry.getAttribute('uv');
    if (!uvAttribute) return;
    const array = uvAttribute.array as Float32Array;

    const setFaceUV = (faceIdx: number, u0: number, v0: number, u1: number, v1: number): void => {
      const offset = faceIdx * 8;
      array[offset + 0] = u0; array[offset + 1] = v0;
      array[offset + 2] = u1; array[offset + 3] = v0;
      array[offset + 4] = u0; array[offset + 5] = v1;
      array[offset + 6] = u1; array[offset + 7] = v1;
    };

    // Face 0: Right (+X) -> darker shading half
    setFaceUV(0, 0.0, 0.0, 0.5, 1.0);
    // Face 1: Left (-X) -> darker shading half
    setFaceUV(1, 0.0, 0.0, 0.5, 1.0);
    // Face 2: Top (+Y) -> lighter shading half
    setFaceUV(2, 0.5, 0.0, 1.0, 1.0);
    // Face 3: Bottom (-Y) -> darker shading half
    setFaceUV(3, 0.0, 0.0, 0.5, 1.0);
    // Face 4: Back (+Z) -> darker shading lower quadrant
    setFaceUV(4, 0.0, 0.5, 0.5, 1.0);
    // Face 5: Front (-Z) -> darker shading upper quadrant
    setFaceUV(5, 0.0, 0.0, 0.5, 0.5);

    uvAttribute.needsUpdate = true;
  }

  /**
   * No-op for player skin updates so the first-person arm no longer depends on the player skin texture or UV layout.
   */
  public updateSkin(_s: PlayerSkinManager): void {
    // Deliberately empty: first-person arm uses dedicated /textures/gui/firstperson-handtexture.png
  }

  public setVisible(v: boolean): void {
    this.armGroup.visible = v;
  }

  public setArmMeshVisible(v: boolean): void {
    if (this.armMesh.visible !== v) {
      this.armMesh.visible = v;
    }
    if (this.sleeveMesh.visible !== false) {
      this.sleeveMesh.visible = false;
    }
  }

  public updateLighting(skyLight: number, blockLight: number, skylightSubtracted: number, sunBrightnessFactor: number): void {
    const u = this.material.userData.dynamicLightingUniforms as {
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

  /** Camera-space base pose; FirstPersonMotionController layers bob/swing above this. */
  public setPose(camera: THREE.PerspectiveCamera): void {
    this.armGroup.position.copy(camera.position);
    this.armGroup.quaternion.copy(camera.quaternion);
    this.armGroup.translateX(0.65);
    this.armGroup.translateY(-0.4);
    this.armGroup.translateZ(-0.8);
    this.armGroup.rotateX(-Math.PI / 3.5);
  }

  public dispose(): void {
    this.armMesh.geometry.dispose();
    this.sleeveMesh.geometry.dispose();
    this.material.dispose();
  }
}
