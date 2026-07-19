import { Scene, Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import {
  PLAYER_MODEL_SCALE,
  FIRST_PERSON_ARM_SCALE,
  PLAYER_OUTER_LAYER_SCALE
} from '../player/PlayerConstants.ts';
import { attachEntityLighting } from './ChunkRenderer.ts';
import type { PlayerSkinManager } from '../player/PlayerSkinManager.ts';

export class FirstPersonArmRenderer {
  public readonly scene = new Scene();
  public readonly armGroup = new Group();

  public readonly material: MeshBasicMaterial;

  private readonly armGeo: BoxGeometry;
  private readonly sleeveGeo: BoxGeometry;

  public readonly armMesh: Mesh;
  public readonly sleeveMesh: Mesh;

  private armVisible = true;
  private isLegacy = true;

  public constructor() {
    const px = PLAYER_MODEL_SCALE;
    const ols = PLAYER_OUTER_LAYER_SCALE;

    // Create a dedicated textured material with fog disabled for the arm
    this.material = new MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.3,
      vertexColors: false,
      fog: false, // Exclude foreground arm overlay from distance fog
    });

    attachEntityLighting(this.material);

    // Geometries - Z-aligned first-person arm (width = 4 px, height = 4 px, depth = 12 px)
    this.armGeo = new BoxGeometry(4 * px, 4 * px, 12 * px);
    this.sleeveGeo = new BoxGeometry(4 * px * ols, 4 * px * ols, 12 * px * ols);

    // Meshes - offset by -6 * px in Z so the shoulder/pivot is at (0, 0, 0)
    this.armMesh = new Mesh(this.armGeo, this.material);
    this.armMesh.position.set(0, 0, -6 * px);

    this.sleeveMesh = new Mesh(this.sleeveGeo, this.material);
    this.sleeveMesh.position.set(0, 0, -6 * px);

    this.armGroup.add(this.armMesh);
    this.armGroup.add(this.sleeveMesh);
    this.armGroup.scale.set(FIRST_PERSON_ARM_SCALE, FIRST_PERSON_ARM_SCALE, FIRST_PERSON_ARM_SCALE);

    this.scene.add(this.armGroup);
  }

  public setVisible(visible: boolean): void {
    this.armGroup.visible = visible;
  }

  public setArmMeshVisible(visible: boolean): void {
    this.armVisible = visible;
    this.updateMeshVisibilities();
  }

  private updateMeshVisibilities(): void {
    this.armMesh.visible = this.armVisible;
    if (this.isLegacy) {
      this.sleeveMesh.visible = false;
    } else {
      this.sleeveMesh.visible = this.armVisible;
    }
  }

  /**
   * Applies the texture and right-arm UV mapping based on skin properties.
   */
  public updateSkin(skinManager: PlayerSkinManager): void {
    const texture = skinManager.getActiveTexture();
    if (texture) {
      this.material.map = texture;
      this.material.needsUpdate = true;
    }

    this.isLegacy = skinManager.getIsLegacy();

    // Map Right Arm: (40, 16) - Use unmirrored canonical first-person UV mapping
    skinManager.applyCanonicalFirstPersonArmUVs(this.armGeo, skinManager.getPartUVs(40, 16, 4, 12, 4, false));

    if (!this.isLegacy) {
      // Modern skin: map Right Sleeve: (40, 32)
      skinManager.applyCanonicalFirstPersonArmUVs(this.sleeveGeo, skinManager.getPartUVs(40, 32, 4, 12, 4, false));
    }

    this.updateMeshVisibilities();
  }
}
