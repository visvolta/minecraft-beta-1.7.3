import { Group } from 'three';
import { EntityModel } from '../../living/EntityModel';

/** Beta ModelBiped geometry, procedural because no hostile artwork is supplied. */
export class BipedModel extends EntityModel {
  protected readonly head = new Group();
  protected readonly body = new Group();
  protected readonly rightArm = new Group();
  protected readonly leftArm = new Group();
  protected readonly rightLeg = new Group();
  protected readonly leftLeg = new Group();

  public constructor(color = 0x668855, thinLimbs = false) {
    super();
    const material = this.createMaterial(color);
    this.head.position.set(0, 18 / 16, 0);
    this.addBox(this.head, { w: 8, h: 8, d: 8 }, material, 0, 2, 0);
    this.addBox(this.body, { w: 8, h: 12, d: 4 }, material, 0, 12, 0);
    const limb = thinLimbs ? 2 : 4;
    this.rightArm.position.set(-5 / 16, 18 / 16, 0); this.leftArm.position.set(5 / 16, 18 / 16, 0);
    this.addBox(this.rightArm, { w: limb, h: 12, d: limb }, material, 0, -6, 0);
    this.addBox(this.leftArm, { w: limb, h: 12, d: limb }, material, 0, -6, 0);
    this.rightLeg.position.set(-2 / 16, 12 / 16, 0); this.leftLeg.position.set(2 / 16, 12 / 16, 0);
    this.addBox(this.rightLeg, { w: limb, h: 12, d: limb }, material, 0, -6, 0);
    this.addBox(this.leftLeg, { w: limb, h: 12, d: limb }, material, 0, -6, 0);
    this.root.add(this.head, this.body, this.rightArm, this.leftArm, this.rightLeg, this.leftLeg);
  }

  public updatePose(limbPhase: number, limbAmount: number, headYaw: number, headPitch: number, attack: number): void {
    const walk = Math.cos(limbPhase * 0.6662) * 1.4 * limbAmount;
    this.rightLeg.rotation.x = walk;
    this.leftLeg.rotation.x = -walk;
    this.head.rotation.y = headYaw * Math.PI / 180;
    this.head.rotation.x = headPitch * Math.PI / 180;
    const attackSwing = Math.sin(attack * Math.PI);
    this.rightArm.rotation.x = -Math.PI / 2 - attackSwing * 1.2;
    this.leftArm.rotation.x = -Math.PI / 2 - attackSwing * 1.2;
    this.rightArm.rotation.z = 0.05;
    this.leftArm.rotation.z = -0.05;
  }
}
