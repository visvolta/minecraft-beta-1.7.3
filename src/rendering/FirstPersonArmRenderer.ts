import { Scene, Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import {
  PLAYER_MODEL_SCALE,
  FIRST_PERSON_ARM_SCALE
} from '../player/PlayerConstants.ts';

export class FirstPersonArmRenderer {
  public readonly scene = new Scene();
  public readonly armGroup = new Group();

  public constructor() {
    const px = PLAYER_MODEL_SCALE;
    const matArm = new MeshBasicMaterial({ color: 0xffccaa });

    // First person arm is the right arm, 4x12x4.
    const armGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    const armMesh = new Mesh(armGeo, matArm);

    // Position it so the pivot is at the shoulder.
    armMesh.position.set(0, -6 * px, 0);
    this.armGroup.add(armMesh);
    this.armGroup.scale.set(FIRST_PERSON_ARM_SCALE, FIRST_PERSON_ARM_SCALE, FIRST_PERSON_ARM_SCALE);

    // Initial default placement
    this.scene.add(this.armGroup);
  }

  public setVisible(visible: boolean): void {
    this.armGroup.visible = visible;
  }
}
