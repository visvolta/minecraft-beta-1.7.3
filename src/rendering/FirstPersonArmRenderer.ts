import { Scene, Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import {
  PLAYER_MODEL_SCALE,
  FIRST_PERSON_ARM_SCALE,
  PLAYER_MODEL_SHOULDER_OFFSET_Y,
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

  private readonly sleeveMesh: Mesh;

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

    // Geometries
    this.armGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    this.sleeveGeo = new BoxGeometry(4 * px * ols, 12 * px * ols, 4 * px * ols);

    // Meshes
    const armMesh = new Mesh(this.armGeo, this.material);
    armMesh.position.set(0, PLAYER_MODEL_SHOULDER_OFFSET_Y, 0);

    this.sleeveMesh = new Mesh(this.sleeveGeo, this.material);
    this.sleeveMesh.position.set(0, PLAYER_MODEL_SHOULDER_OFFSET_Y, 0);

    this.armGroup.add(armMesh);
    this.armGroup.add(this.sleeveMesh);
    this.armGroup.scale.set(FIRST_PERSON_ARM_SCALE, FIRST_PERSON_ARM_SCALE, FIRST_PERSON_ARM_SCALE);

    this.scene.add(this.armGroup);
  }

  public setVisible(visible: boolean): void {
    this.armGroup.visible = visible;
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

    const isLegacy = skinManager.getIsLegacy();

    // Map Right Arm: (40, 16)
    skinManager.applyUVsToGeometry(this.armGeo, skinManager.getPartUVs(40, 16, 4, 12, 4, true));

    if (isLegacy) {
      // Legacy skin: right sleeve overlay does not exist
      this.sleeveMesh.visible = false;
    } else {
      // Modern skin: map Right Sleeve: (40, 32)
      skinManager.applyUVsToGeometry(this.sleeveGeo, skinManager.getPartUVs(40, 32, 4, 12, 4));
      this.sleeveMesh.visible = true;
    }
  }
}
