import { Group, type Texture } from 'three';
import { EntityModel } from '../../living/EntityModel';

/** Beta ModelBiped geometry, procedural because no hostile artwork is supplied. */
export class BipedModel extends EntityModel {
  protected readonly head = new Group();
  protected readonly body = new Group();
  protected readonly rightArm = new Group();
  protected readonly leftArm = new Group();
  protected readonly rightLeg = new Group();
  protected readonly leftLeg = new Group();

  public constructor(color = 0x668855, thinLimbs = false,texture?:Texture,textureHeight=32) {
    super();
    const material = this.createMaterial(texture?0xffffff:color,texture);
    // Beta ModelBiped spans 32 pixels: legs 0..12, torso/arms 12..24, head 24..32.
    this.head.position.set(0, 24 / 16, 0);
    this.addBox(this.head, { w: 8, h: 8, d: 8 }, material, 0, 4, 0,{u:0,v:0,textureHeight});
    this.addBox(this.body, { w: 8, h: 12, d: 4 }, material, 0, 18, 0,{u:16,v:16,textureHeight});
    const limb = thinLimbs ? 2 : 4;
    this.rightArm.position.set(-5 / 16, 24 / 16, 0); this.leftArm.position.set(5 / 16, 24 / 16, 0);
    this.addBox(this.rightArm, { w: limb, h: 12, d: limb }, material, 0, -6, 0,{u:40,v:16,textureHeight});
    this.addBox(this.leftArm, { w: limb, h: 12, d: limb }, material, 0, -6, 0,{u:40,v:16,textureHeight,mirror:true});
    this.rightLeg.position.set(-2 / 16, 12 / 16, 0); this.leftLeg.position.set(2 / 16, 12 / 16, 0);
    this.addBox(this.rightLeg, { w: limb, h: 12, d: limb }, material, 0, -6, 0,{u:0,v:16,textureHeight});
    this.addBox(this.leftLeg, { w: limb, h: 12, d: limb }, material, 0, -6, 0,{u:0,v:16,textureHeight,mirror:true});
    this.root.add(this.head, this.body, this.rightArm, this.leftArm, this.rightLeg, this.leftLeg);
  }

  public get rightHandAttachment():Group{return this.rightArm;}

  public updatePose(limbPhase: number, limbAmount: number, headYaw: number, headPitch: number, attack: number, ranged = false,rangedProgress=0): void {
    const walk = Math.cos(limbPhase * 0.6662) * 1.4 * limbAmount;
    this.rightLeg.rotation.x = walk;
    this.leftLeg.rotation.x = -walk;
    this.head.rotation.y = -headYaw * Math.PI / 180;
    this.head.rotation.x = headPitch * Math.PI / 180;
    const attackSwing = Math.sin(attack * Math.PI);
    if (ranged) {
      const aimYaw=-headYaw*Math.PI/180,p=Math.max(0,Math.min(1,rangedProgress));
      this.rightArm.rotation.set(-Math.PI/2-headPitch*Math.PI/180*.25,-0.1+aimYaw,0);
      this.leftArm.rotation.set(-.7-p*.55+headPitch*Math.PI/180,0.35+p*.5+aimYaw,0);
    } else {
      this.rightArm.rotation.set(-Math.PI / 2 - attackSwing * 1.2, -(0.1 - attackSwing * 0.6), 0.05);
      this.leftArm.rotation.set(-Math.PI / 2 - attackSwing * 1.2, 0.1 - attackSwing * 0.6, -0.05);
    }
  }
}
