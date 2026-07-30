import { Group } from 'three';
import { EntityModel } from '../../living/EntityModel';

/**
 * Beta `ModelSlime`: a single 8×8×8 cube body that squishes.
 * Scale on jump (squish > 0 → wider/shorter) and on land (squish < 0 → taller/narrower).
 * Overall model scale grows with slimeSize.
 */
export class SlimeModel extends EntityModel {
  private readonly bodyGroup = new Group();
  public constructor(texture?: import('three').Texture) {
    super();
    const material = this.createMaterial(texture ? 0xffffff : 0x5fa84e, texture);
    // Body: 8×8×8 cube, centered horizontally, sitting on the ground.
    this.addBox(this.bodyGroup, { w: 8, h: 8, d: 8 }, material, 0, 4, 0, { u: 0, v: 0, textureHeight: 32 });
    this.root.add(this.bodyGroup);
  }

  /** Updates the squish scale from the entity's squishFactor/squishAmount. */
  public updateSquish(squish: number, slimeSize: number): void {
    const baseScale = 0.6 * slimeSize; // matches setSize(0.6 * size, 0.6 * size)
    const factor = (squish + 1) / 2; // Beta: (squishFactor + 1) / 2
    const invFactor = 1 / factor;
    this.root.scale.set(factor * baseScale, invFactor * baseScale, factor * baseScale);
  }
}
