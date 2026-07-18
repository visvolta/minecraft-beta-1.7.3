import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { PLAYER_MODEL_SCALE, PLAYER_MODEL_SHOULDER_OFFSET_Y } from './PlayerConstants.ts';

export class PlayerModel {
  public readonly root = new Group();
  
  public readonly headGroup = new Group();
  public readonly bodyGroup = new Group();
  public readonly leftArmGroup = new Group();
  public readonly rightArmGroup = new Group();
  public readonly leftLegGroup = new Group();
  public readonly rightLegGroup = new Group();

  public constructor() {
    const px = PLAYER_MODEL_SCALE;

    const matHead = new MeshBasicMaterial({ color: 0xffccaa });
    const matBody = new MeshBasicMaterial({ color: 0x00aaff });
    const matArm = new MeshBasicMaterial({ color: 0xffccaa });
    const matLeg = new MeshBasicMaterial({ color: 0x2233cc });

    // Head: 8x8x8
    const headGeo = new BoxGeometry(8 * px, 8 * px, 8 * px);
    const headMesh = new Mesh(headGeo, matHead);
    headMesh.position.set(0, 4 * px, 0);
    this.headGroup.add(headMesh);
    this.headGroup.position.set(0, 24 * px, 0);

    // Body: 8x12x4
    const bodyGeo = new BoxGeometry(8 * px, 12 * px, 4 * px);
    const bodyMesh = new Mesh(bodyGeo, matBody);
    bodyMesh.position.set(0, -6 * px, 0);
    this.bodyGroup.add(bodyMesh);
    this.bodyGroup.position.set(0, 24 * px, 0);

    // Left Arm: 4x12x4 (Anatomical Left is -X when facing -Z)
    const leftArmGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    const leftArmMesh = new Mesh(leftArmGeo, matArm);
    leftArmMesh.position.set(0, PLAYER_MODEL_SHOULDER_OFFSET_Y, 0);
    this.leftArmGroup.add(leftArmMesh);
    this.leftArmGroup.position.set(-6 * px, 24 * px, 0);

    // Right Arm: 4x12x4 (Anatomical Right is +X when facing -Z)
    const rightArmGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    const rightArmMesh = new Mesh(rightArmGeo, matArm);
    rightArmMesh.position.set(0, PLAYER_MODEL_SHOULDER_OFFSET_Y, 0);
    this.rightArmGroup.add(rightArmMesh);
    this.rightArmGroup.position.set(6 * px, 24 * px, 0);

    // Left Leg: 4x12x4 (Anatomical Left is -X)
    const leftLegGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    const leftLegMesh = new Mesh(leftLegGeo, matLeg);
    leftLegMesh.position.set(0, -6 * px, 0);
    this.leftLegGroup.add(leftLegMesh);
    this.leftLegGroup.position.set(-2 * px, 12 * px, 0);

    // Right Leg: 4x12x4 (Anatomical Right is +X)
    const rightLegGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    const rightLegMesh = new Mesh(rightLegGeo, matLeg);
    rightLegMesh.position.set(0, -6 * px, 0);
    this.rightLegGroup.add(rightLegMesh);
    this.rightLegGroup.position.set(2 * px, 12 * px, 0);

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

  public updateTransforms(x: number, y: number, z: number, bodyYaw: number, headYaw: number, headPitch: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = bodyYaw;
    this.headGroup.rotation.y = headYaw - bodyYaw;
    this.headGroup.rotation.x = headPitch;
  }
}
