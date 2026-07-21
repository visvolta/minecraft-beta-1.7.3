import { QuadrupedModel, type QuadrupedConfig } from './QuadrupedModel';

const COW_BROWN = 0x5b4030;
const HORN = 0xdddddd;
const UDDER = 0xe8a0a0;

/**
 * Beta cow proportions (ModelCow extends ModelQuadruped(12, 0)), in the shared
 * world-16th convention. The body uses the rendered-equivalent box of Beta's
 * 12×18×10 body rotated 90° about X (effective 12 wide × 10 tall × 18 long).
 */
const COW_CONFIG: QuadrupedConfig = {
  body: { w: 12, h: 10, d: 18, y: 17 },
  head: { w: 8, h: 8, d: 6, pivotY: 20, pivotZ: 8 },
  headOffset: { x: 0, y: 0, z: 3 },
  leg: { w: 4, h: 12, d: 4 },
  legPivotY: 12,
  legs: [
    { x: -4, z: 6 }, // front-left
    { x: 4, z: 6 }, // front-right
    { x: -4, z: -7 }, // back-left
    { x: 4, z: -7 }, // back-right
  ],
  bodyColor: COW_BROWN,
};

/**
 * Cow model: the shared {@link QuadrupedModel} with cow proportions, plus horns
 * (parented to the head so they follow the head look) and an udder.
 */
export class CowModel extends QuadrupedModel {
  public constructor() {
    super(COW_CONFIG);

    // Horns on the top sides of the head (follow the head group).
    const hornMaterial = this.createMaterial(HORN);
    this.addBox(this.headGroup, { w: 1, h: 3, d: 1 }, hornMaterial, -3.5, 4.5, 2.5);
    this.addBox(this.headGroup, { w: 1, h: 3, d: 1 }, hornMaterial, 3.5, 4.5, 2.5);

    // Udder beneath the rear of the body (rendered-equivalent of Beta's
    // 4×6×2 box rotated 90° about X → effective 4 wide × 2 tall × 6 long).
    const udderMaterial = this.createMaterial(UDDER);
    this.addBox(this.bodyYawGroup, { w: 4, h: 2, d: 6 }, udderMaterial, 0, 11, -6);
  }
}
