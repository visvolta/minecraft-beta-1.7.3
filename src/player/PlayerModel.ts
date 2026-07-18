import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';

export class PlayerModel {
  public readonly root = new Group();
  
  public readonly headGroup = new Group();
  public readonly bodyGroup = new Group();
  public readonly leftArmGroup = new Group();
  public readonly rightArmGroup = new Group();
  public readonly leftLegGroup = new Group();
  public readonly rightLegGroup = new Group();

  public constructor() {
    // 1 pixel = 1/16 block
    const px = 1 / 16;

    // We'll use simple untextured materials with distinguishable colors
    const matHead = new MeshBasicMaterial({ color: 0xffccaa });
    const matBody = new MeshBasicMaterial({ color: 0x00aaff });
    const matArm = new MeshBasicMaterial({ color: 0xffccaa });
    const matLeg = new MeshBasicMaterial({ color: 0x2233cc });

    // Head: 8x8x8
    const headGeo = new BoxGeometry(8 * px, 8 * px, 8 * px);
    const headMesh = new Mesh(headGeo, matHead);
    headMesh.position.set(0, 4 * px, 0); // Pivot at bottom of head (neck)
    this.headGroup.add(headMesh);
    this.headGroup.position.set(0, 24 * px, 0); // 1.5 blocks up from feet

    // Body: 8x12x4
    const bodyGeo = new BoxGeometry(8 * px, 12 * px, 4 * px);
    const bodyMesh = new Mesh(bodyGeo, matBody);
    bodyMesh.position.set(0, -6 * px, 0); // Pivot at top of body? Pivot at player root is fine for body. Let's put body pivot at neck.
    this.bodyGroup.add(bodyMesh);
    this.bodyGroup.position.set(0, 24 * px, 0); // Start at neck, extend downwards

    // Left Arm: 4x12x4
    const leftArmGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    const leftArmMesh = new Mesh(leftArmGeo, matArm);
    leftArmMesh.position.set(0, -4 * px, 0); // Pivot is 2 px down from top of arm
    this.leftArmGroup.add(leftArmMesh);
    this.leftArmGroup.position.set(6 * px, 22 * px, 0); // X offset 4px body half + 2px arm half = 6px. Y is 24px - 2px shoulder drop = 22px

    // Right Arm: 4x12x4
    const rightArmGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    const rightArmMesh = new Mesh(rightArmGeo, matArm);
    rightArmMesh.position.set(0, -4 * px, 0);
    this.rightArmGroup.add(rightArmMesh);
    this.rightArmGroup.position.set(-6 * px, 22 * px, 0);

    // Left Leg: 4x12x4
    const leftLegGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    const leftLegMesh = new Mesh(leftLegGeo, matLeg);
    leftLegMesh.position.set(0, -6 * px, 0); // Pivot at top
    this.leftLegGroup.add(leftLegMesh);
    this.leftLegGroup.position.set(2 * px, 12 * px, 0); // X offset 2px. Y is 12px (hip)

    // Right Leg: 4x12x4
    const rightLegGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    const rightLegMesh = new Mesh(rightLegGeo, matLeg);
    rightLegMesh.position.set(0, -6 * px, 0);
    this.rightLegGroup.add(rightLegMesh);
    this.rightLegGroup.position.set(-2 * px, 12 * px, 0);

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
    // Three.js rotation: Y is up. Camera points -Z. 
    // Usually yaw=0 means facing -Z. 
    this.root.rotation.y = bodyYaw;

    // Head rotates relative to body
    this.headGroup.rotation.y = headYaw - bodyYaw;
    this.headGroup.rotation.x = headPitch;
  }
}
