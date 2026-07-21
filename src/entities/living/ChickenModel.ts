import { Group, MeshBasicMaterial } from 'three';
import { EntityModel, clamp01 } from './EntityModel';

const WHITE = 0xf5f5f5;
const ORANGE = 0xe89020;
const WATTLE = 0xcc3030;

function deg2rad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Procedural chicken model (Beta ModelChicken), a small bird built on the
 * shared {@link EntityModel}. Dimensions/pivots use the shared world-16th
 * convention (Beta model values converted; body uses the rendered-equivalent
 * box of Beta's 6×8×6 rotated 90° about X → effective 6×6×8). Faces +Z at yaw 0.
 */
export class ChickenModel extends EntityModel {
  private readonly bodyYawGroup = new Group();
  private readonly headGroup = new Group();
  private readonly rightLeg = new Group();
  private readonly leftLeg = new Group();
  private readonly rightWing = new Group();
  private readonly leftWing = new Group();

  private readonly bodyMat: MeshBasicMaterial;

  public constructor() {
    super();
    this.bodyMat = this.createMaterial(WHITE);
    const orangeMat = this.createMaterial(ORANGE);
    const wattleMat = this.createMaterial(WATTLE);

    // Body (effective 6×6×8), centred at y=8.
    this.addBox(this.bodyYawGroup, { w: 6, h: 6, d: 8 }, this.bodyMat, 0, 8, 0);

    // Head + bill + wattle (bill/wattle follow the head group).
    this.addBox(this.headGroup, { w: 4, h: 6, d: 3 }, this.bodyMat, 0, 3, 0.5);
    this.addBox(this.headGroup, { w: 4, h: 2, d: 2 }, orangeMat, 0, 3, 3);
    this.addBox(this.headGroup, { w: 2, h: 2, d: 2 }, wattleMat, 0, 1, 2);
    this.headGroup.position.set(0, 9 * (1 / 16), 4 * (1 / 16));
    this.bodyYawGroup.add(this.headGroup);

    // Biped legs (hip-pivoted), hanging below the pivot.
    this.buildLeg(this.rightLeg, -2);
    this.buildLeg(this.leftLeg, 2);

    // Wings (shoulder-pivoted, flap about the forward/Z axis).
    this.buildWing(this.rightWing, -4);
    this.buildWing(this.leftWing, 4);

    this.root.add(this.bodyYawGroup);
  }

  private buildLeg(group: Group, xPixels: number): void {
    const orangeMat = this.createMaterial(ORANGE);
    this.addBox(group, { w: 3, h: 5, d: 3 }, orangeMat, 0, -2.5, 0);
    group.position.set(xPixels * (1 / 16), 5 * (1 / 16), -1 * (1 / 16));
    this.bodyYawGroup.add(group);
  }

  private buildWing(group: Group, xPixels: number): void {
    this.addBox(group, { w: 1, h: 4, d: 6 }, this.bodyMat, xPixels < 0 ? 0.5 : -0.5, -2, 0);
    group.position.set(xPixels * (1 / 16), 11 * (1 / 16), 0);
    this.bodyYawGroup.add(group);
  }

  /**
   * Applies the animated pose. `wingRotation` accumulates the flap phase and
   * `wingSpread` (0 grounded → 1 airborne) scales the flap amplitude, so the
   * chicken flaps harder while slow-falling.
   */
  public updatePose(
    legYaw: number,
    legSwing: number,
    bodyYawDeg: number,
    headRelYawDeg: number,
    headPitchDeg: number,
    wingRotation: number,
    wingSpread: number,
  ): void {
    this.bodyYawGroup.rotation.y = -deg2rad(bodyYawDeg);
    this.headGroup.rotation.y = -deg2rad(headRelYawDeg);
    this.headGroup.rotation.x = deg2rad(headPitchDeg);

    // Biped walk (opposite phase), Beta amplitude 1.4 and frequency 0.6662.
    const swing = Math.cos(legYaw * 0.6662) * 1.4 * legSwing;
    this.rightLeg.rotation.x = swing;
    this.leftLeg.rotation.x = -swing;

    // Wing flap (amplitude grows while airborne).
    const flap = Math.sin(wingRotation) * (0.2 + clamp01(wingSpread));
    this.rightWing.rotation.z = flap;
    this.leftWing.rotation.z = -flap;
  }

  /** Death collapse: rolls onto its side as `progress` goes 0 → 1. */
  public setDeathProgress(progress: number): void {
    this.bodyYawGroup.rotation.z = clamp01(progress) * (Math.PI / 2);
  }

  public get bodyMaterial(): MeshBasicMaterial {
    return this.bodyMat;
  }
}
