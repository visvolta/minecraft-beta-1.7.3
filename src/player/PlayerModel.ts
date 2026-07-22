import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { PLAYER_MODEL_SCALE, PLAYER_MODEL_SHOULDER_OFFSET_Y, PLAYER_OUTER_LAYER_SCALE } from './PlayerConstants.ts';
import type { PlayerSkinManager } from './PlayerSkinManager.ts';
import { attachEntityLighting } from '../rendering/ChunkRenderer.ts';

export class PlayerModel {
  public readonly root = new Group();
  
  public readonly headGroup = new Group();
  public readonly bodyGroup = new Group();
  public readonly leftArmGroup = new Group();
  public readonly rightArmGroup = new Group();
  public readonly leftLegGroup = new Group();
  public readonly rightLegGroup = new Group();

  public readonly material: MeshBasicMaterial;

  private readonly headGeo: BoxGeometry;
  private readonly hatGeo: BoxGeometry;
  private readonly bodyGeo: BoxGeometry;
  private readonly jacketGeo: BoxGeometry;
  private readonly leftArmGeo: BoxGeometry;
  private readonly leftSleeveGeo: BoxGeometry;
  private readonly rightArmGeo: BoxGeometry;
  private readonly rightSleeveGeo: BoxGeometry;
  private readonly leftLegGeo: BoxGeometry;
  private readonly leftTrouserGeo: BoxGeometry;
  private readonly rightLegGeo: BoxGeometry;
  private readonly rightTrouserGeo: BoxGeometry;

  private readonly hatMesh: Mesh;
  private readonly jacketMesh: Mesh;
  private readonly leftSleeveMesh: Mesh;
  private readonly rightSleeveMesh: Mesh;
  private readonly leftTrouserMesh: Mesh;
  private readonly rightTrouserMesh: Mesh;

  public constructor() {
    const px = PLAYER_MODEL_SCALE;
    const ols = PLAYER_OUTER_LAYER_SCALE;

    // Create a single textured material for the player body
    this.material = new MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.3,
      vertexColors: false,
    });
    // Attach custom entity static lighting pipeline
    attachEntityLighting(this.material);

    // Geometries
    this.headGeo = new BoxGeometry(8 * px, 8 * px, 8 * px);
    this.hatGeo = new BoxGeometry(8 * px * ols, 8 * px * ols, 8 * px * ols);

    this.bodyGeo = new BoxGeometry(8 * px, 12 * px, 4 * px);
    this.jacketGeo = new BoxGeometry(8 * px * ols, 12 * px * ols, 4 * px * ols);

    this.rightArmGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    this.rightSleeveGeo = new BoxGeometry(4 * px * ols, 12 * px * ols, 4 * px * ols);

    this.leftArmGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    this.leftSleeveGeo = new BoxGeometry(4 * px * ols, 12 * px * ols, 4 * px * ols);

    this.rightLegGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    this.rightTrouserGeo = new BoxGeometry(4 * px * ols, 12 * px * ols, 4 * px * ols);

    this.leftLegGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    this.leftTrouserGeo = new BoxGeometry(4 * px * ols, 12 * px * ols, 4 * px * ols);

    // Meshes
    const headMesh = new Mesh(this.headGeo, this.material);
    headMesh.position.set(0, 4 * px, 0);
    this.hatMesh = new Mesh(this.hatGeo, this.material);
    this.hatMesh.position.set(0, 4 * px, 0);
    this.headGroup.add(headMesh);
    this.headGroup.add(this.hatMesh);
    this.headGroup.position.set(0, 24 * px, 0);

    const bodyMesh = new Mesh(this.bodyGeo, this.material);
    bodyMesh.position.set(0, -6 * px, 0);
    this.jacketMesh = new Mesh(this.jacketGeo, this.material);
    this.jacketMesh.position.set(0, -6 * px, 0);
    this.bodyGroup.add(bodyMesh);
    this.bodyGroup.add(this.jacketMesh);
    this.bodyGroup.position.set(0, 24 * px, 0);

    const rightArmMesh = new Mesh(this.rightArmGeo, this.material);
    rightArmMesh.position.set(0, PLAYER_MODEL_SHOULDER_OFFSET_Y, 0);
    this.rightSleeveMesh = new Mesh(this.rightSleeveGeo, this.material);
    this.rightSleeveMesh.position.set(0, PLAYER_MODEL_SHOULDER_OFFSET_Y, 0);
    this.rightArmGroup.add(rightArmMesh);
    this.rightArmGroup.add(this.rightSleeveMesh);
    this.rightArmGroup.position.set(6 * px, 24 * px, 0);

    const leftArmMesh = new Mesh(this.leftArmGeo, this.material);
    leftArmMesh.position.set(0, PLAYER_MODEL_SHOULDER_OFFSET_Y, 0);
    this.leftSleeveMesh = new Mesh(this.leftSleeveGeo, this.material);
    this.leftSleeveMesh.position.set(0, PLAYER_MODEL_SHOULDER_OFFSET_Y, 0);
    this.leftArmGroup.add(leftArmMesh);
    this.leftArmGroup.add(this.leftSleeveMesh);
    this.leftArmGroup.position.set(-6 * px, 24 * px, 0);

    const rightLegMesh = new Mesh(this.rightLegGeo, this.material);
    rightLegMesh.position.set(0, -6 * px, 0);
    this.rightTrouserMesh = new Mesh(this.rightTrouserGeo, this.material);
    this.rightTrouserMesh.position.set(0, -6 * px, 0);
    this.rightLegGroup.add(rightLegMesh);
    this.rightLegGroup.add(this.rightTrouserMesh);
    this.rightLegGroup.position.set(2 * px, 12 * px, 0);

    const leftLegMesh = new Mesh(this.leftLegGeo, this.material);
    leftLegMesh.position.set(0, -6 * px, 0);
    this.leftTrouserMesh = new Mesh(this.leftTrouserGeo, this.material);
    this.leftTrouserMesh.position.set(0, -6 * px, 0);
    this.leftLegGroup.add(leftLegMesh);
    this.leftLegGroup.add(this.leftTrouserMesh);
    this.leftLegGroup.position.set(-2 * px, 12 * px, 0);

    this.root.add(this.headGroup);
    this.root.add(this.bodyGroup);
    this.root.add(this.leftArmGroup);
    this.root.add(this.rightArmGroup);
    this.root.add(this.leftLegGroup);
    this.root.add(this.rightLegGroup);
  }

  public setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  public setFirstPersonMode(firstPerson: boolean): void {
    if (firstPerson) {
        // DO NOT CHANGE THIS
      this.headGroup.visible = false;
      this.rightArmGroup.visible = false;
      this.bodyGroup.visible = false;
      this.leftArmGroup.visible = false;
      this.leftLegGroup.visible = false;
      this.rightLegGroup.visible = false;
    } else {
      this.headGroup.visible = true;
      this.rightArmGroup.visible = true;
      this.bodyGroup.visible = true;
      this.leftArmGroup.visible = true;
      this.leftLegGroup.visible = true;
      this.rightLegGroup.visible = true;
    }
  }

  public updateTransforms(x: number, y: number, z: number, bodyYaw: number, headYaw: number, headPitch: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = bodyYaw;
    this.headGroup.rotation.y = headYaw - bodyYaw;
    this.headGroup.rotation.x = headPitch;
  }

  /**
   * Applies the texture and correct skin UVs to all geometries based on legacy/modern status.
   */
  public updateSkin(skinManager: PlayerSkinManager): void {
    const texture = skinManager.getActiveTexture();
    if (texture) {
      this.material.map = texture;
      this.material.needsUpdate = true;
    }

    const isLegacy = skinManager.getIsLegacy();

    // Map base parts
    skinManager.applyUVsToGeometry(this.headGeo, skinManager.getPartUVs(0, 0, 8, 8, 8));
    skinManager.applyUVsToGeometry(this.hatGeo, skinManager.getPartUVs(32, 0, 8, 8, 8));

    skinManager.applyUVsToGeometry(this.bodyGeo, skinManager.getPartUVs(16, 16, 8, 12, 4));

    skinManager.applyUVsToGeometry(this.rightArmGeo, skinManager.getPartUVs(40, 16, 4, 12, 4));
    skinManager.applyUVsToGeometry(this.rightLegGeo, skinManager.getPartUVs(0, 16, 4, 12, 4));

    if (isLegacy) {
      // Legacy skins: mirror Left Arm and Left Leg from Right equivalents
      skinManager.applyUVsToGeometry(this.leftArmGeo, skinManager.getPartUVs(40, 16, 4, 12, 4, true));
      skinManager.applyUVsToGeometry(this.leftLegGeo, skinManager.getPartUVs(0, 16, 4, 12, 4, true));

      // Hide all outer overlays except Headwear/Hat
      this.hatMesh.visible = true;
      this.jacketMesh.visible = true;
      this.leftSleeveMesh.visible = true;
      this.rightSleeveMesh.visible = true;
      this.leftTrouserMesh.visible = true;
      this.rightTrouserMesh.visible = true;
    } else {
      // Modern skins: use distinct texture coords
      skinManager.applyUVsToGeometry(this.leftArmGeo, skinManager.getPartUVs(32, 48, 4, 12, 4));
      skinManager.applyUVsToGeometry(this.leftLegGeo, skinManager.getPartUVs(16, 48, 4, 12, 4));

      // Overlays
      skinManager.applyUVsToGeometry(this.jacketGeo, skinManager.getPartUVs(16, 32, 8, 12, 4));
      skinManager.applyUVsToGeometry(this.rightSleeveGeo, skinManager.getPartUVs(40, 32, 4, 12, 4));
      skinManager.applyUVsToGeometry(this.leftSleeveGeo, skinManager.getPartUVs(48, 48, 4, 12, 4));
      skinManager.applyUVsToGeometry(this.rightTrouserGeo, skinManager.getPartUVs(0, 32, 4, 12, 4));
      skinManager.applyUVsToGeometry(this.leftTrouserGeo, skinManager.getPartUVs(0, 48, 4, 12, 4));

      // All overlays are visible
      this.hatMesh.visible = true;
      this.jacketMesh.visible = true;
      this.leftSleeveMesh.visible = true;
      this.rightSleeveMesh.visible = true;
      this.leftTrouserMesh.visible = true;
      this.rightTrouserMesh.visible = true;
    }
  }

  public dispose(): void {
    this.root.removeFromParent();
    for (const geometry of [
      this.headGeo,
      this.hatGeo,
      this.bodyGeo,
      this.jacketGeo,
      this.leftArmGeo,
      this.leftSleeveGeo,
      this.rightArmGeo,
      this.rightSleeveGeo,
      this.leftLegGeo,
      this.leftTrouserGeo,
      this.rightLegGeo,
      this.rightTrouserGeo,
    ]) geometry.dispose();
    this.material.dispose();
  }
}
