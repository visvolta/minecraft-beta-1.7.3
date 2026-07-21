import { Group } from 'three';
import { EntityModel } from '../../living/EntityModel';

export class CreeperModel extends EntityModel {
  private readonly head = new Group();
  private readonly legs: Group[] = [];
  public constructor() {
    super(); const material = this.createMaterial(0x49a83e);
    this.addBox(this.head, { w: 8, h: 8, d: 8 }, material, 0, 20, 0);
    this.addBox(this.root, { w: 8, h: 12, d: 4 }, material, 0, 12, 0);
    this.root.add(this.head);
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
      const leg = new Group(); leg.position.set(x / 16, 6 / 16, z / 16);
      this.addBox(leg, { w: 4, h: 6, d: 4 }, material, 0, -3, 0); this.legs.push(leg); this.root.add(leg);
    }
  }
  public updatePose(phase: number, amount: number): void {
    const swing = Math.cos(phase * 0.6662) * 1.4 * amount;
    this.legs[0]!.rotation.x = swing; this.legs[1]!.rotation.x = -swing;
    this.legs[2]!.rotation.x = -swing; this.legs[3]!.rotation.x = swing;
  }
  public setFuse(progress: number): void {
    const p = Math.max(0, Math.min(1, progress)); const pulse = 1 + Math.sin(p * 100) * p * 0.01; const p4 = p ** 4;
    this.root.scale.set((1 + p4 * 0.4) * pulse, (1 + p4 * 0.1) / pulse, (1 + p4 * 0.4) * pulse);
    this.setHurtFlash(Math.floor(p * 10) % 2 === 1 ? p * 0.2 : 0);
  }
}
