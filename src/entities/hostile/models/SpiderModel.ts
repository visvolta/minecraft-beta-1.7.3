import { Group } from 'three';
import { EntityModel } from '../../living/EntityModel';

export class SpiderModel extends EntityModel {
  private readonly head = new Group();
  private readonly legs: Group[] = [];
  public constructor() {
    super(); const material = this.createMaterial(0x332b2b);
    // Shared project convention: local +Z is forward. Beta source coordinates
    // are mirrored here once at the model boundary (head forward, abdomen rear).
    this.addBox(this.head, { w: 8, h: 8, d: 8 }, material, 0, 4, 3);
    this.addBox(this.root, { w: 6, h: 6, d: 6 }, material, 0, 4, 0);
    this.addBox(this.root, { w: 10, h: 8, d: 12 }, material, 0, 4, -9);
    this.root.add(this.head);
    for (let i = 0; i < 8; i++) {
      const leg = new Group(); const left = i % 2 === 0;
      leg.position.set((left ? -4 : 4) / 16, 4 / 16, (-2 + Math.floor(i / 2)) / 16);
      this.addBox(leg, { w: 16, h: 2, d: 2 }, material, left ? -7 : 7, 0, 0);
      leg.rotation.z = (left ? -1 : 1) * (i < 2 || i >= 6 ? Math.PI / 4 : Math.PI * 0.185);
      this.legs.push(leg); this.root.add(leg);
    }
  }
  public updatePose(phase: number, amount: number, yaw: number, pitch: number): void {
    this.head.rotation.y = -yaw * Math.PI / 180; this.head.rotation.x = pitch * Math.PI / 180;
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      this.legs[i]!.rotation.y = side * Math.cos(phase * 1.3324 + Math.floor(i / 2) * Math.PI / 2) * 0.4 * amount;
    }
  }
}
