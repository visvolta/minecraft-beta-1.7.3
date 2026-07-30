import { Group } from 'three';
import { EntityModel } from './EntityModel';

/**
 * Beta `ModelSquid`: body + 8 tentacles. Tentacles rotate based on `tentacleAngle`
 * (the squid's swimming animation). Body rotates around Y based on `squidRotation`.
 */
export class SquidModel extends EntityModel {
  private readonly bodyGroup = new Group();
  private readonly tentacles: Group[] = [];

  public constructor(texture?: import('three').Texture) {
    super();
    const material = this.createMaterial(texture ? 0xffffff : 0x6b4e9b, texture);
    // Body: 8×8×8 cube.
    this.addBox(this.bodyGroup, { w: 8, h: 8, d: 8 }, material, 0, -4, 0, { u: 0, v: 0, textureHeight: 32 });
    this.root.add(this.bodyGroup);
    // 8 tentacles: 4 per side (X+/X-), each 1×8×1.
    for (let i = 0; i < 8; i++) {
      const tentacle = new Group();
      const x = (i < 4 ? 1 : -1) * 3;
      const z = (i % 4 - 1.5) * 2;
      tentacle.position.set(x / 16, -8 / 16, z / 16);
      this.addBox(tentacle, { w: 1, h: 8, d: 1 }, material, 0, -4, 0, { u: 0, v: 0, textureHeight: 32 });
      this.tentacles.push(tentacle);
      this.root.add(tentacle);
    }
  }

  public updateTentacles(tentacleAngle: number, squidRotation: number): void {
    this.root.rotation.y = -squidRotation;
    for (let i = 0; i < this.tentacles.length; i++) {
      this.tentacles[i]!.rotation.x = tentacleAngle * (i < 4 ? 1 : -1);
    }
  }
}
