import { Group, type Texture } from 'three';
import { QuadrupedModel, type QuadrupedConfig } from './QuadrupedModel';

const WOLF_CONFIG: QuadrupedConfig = {
  body: { w: 6, h: 6, d: 8, y: 12 },
  head: { w: 3, h: 3, d: 4, pivotY: 16, pivotZ: -6 },
  leg: { w: 2, h: 6, d: 2 },
  legPivotY: 8,
  legs: [{ x: -3, z: -4 }, { x: 3, z: -4 }, { x: -3, z: 4 }, { x: 3, z: 4 }],
  bodyColor: 0xffffff,
};

export class WolfModel extends QuadrupedModel {
  private readonly tail = new Group();
  private readonly collar = new Group();

  public constructor(wild?: Texture, tame?: Texture, angry?: Texture, collar?: Texture) {
    super({ ...WOLF_CONFIG, ...(wild ? { texture: wild } : {}) });
    void tame; void angry;

    this.root.add(this.tail);
    const tailMaterial = this.createMaterial(wild ? 0xffffff : 0xcccccc, wild);
    this.tail.position.set(0, 6 / 16, -8 / 16);
    this.addBox(this.tail, { w: 2, h: 2, d: 2 }, tailMaterial, 0, 0, 0, { u: 0, v: 0, textureHeight: 32 });

    this.root.add(this.collar);
    const collarMaterial = this.createMaterial(collar ? 0xffffff : 0x0000ff, collar);
    this.addBox(this.collar, { w: 6, h: 3, d: 6 }, collarMaterial, 0, 12 / 16, -2 / 16, { u: 0, v: 0, textureHeight: 32 });
    this.collar.visible = false;
  }

  public updateWolfState(tamed: boolean, _angry: boolean, sitting: boolean, healthRatio: number): void {
    this.collar.visible = tamed;
    this.tail.rotation.x = (healthRatio - 0.5) * 1.2;
    this.root.position.y = sitting ? -2 / 16 : 0;
  }
}
