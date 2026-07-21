import { Group, MeshBasicMaterial } from 'three';
import { EntityModel, PX, type BoxSpec } from './EntityModel';

function deg2rad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Configuration a quadruped subclass supplies. The base owns no mob-specific
 * assumptions — every dimension, pivot and colour comes from here, so pig, cow
 * and sheep each describe their own proportions and add their own geometry.
 */
export interface QuadrupedConfig {
  /** Torso box (pixels) and the Y of its centre (pixels). */
  readonly body: BoxSpec & { readonly y: number };
  /** Head box (pixels) and the head-group pivot position (pixels, relative to body). */
  readonly head: BoxSpec & { readonly pivotY: number; readonly pivotZ: number };
  /** Offset of the head mesh centre from the head pivot (world 16ths; default 0). */
  readonly headOffset?: { readonly x: number; readonly y: number; readonly z: number };
  /** Leg box (pixels). */
  readonly leg: BoxSpec;
  /** Height of the leg hip pivots (pixels). */
  readonly legPivotY: number;
  /** Four leg hip positions in order [front-left, front-right, back-left, back-right] (pixels). */
  readonly legs: readonly { x: number; z: number }[];
  /** Base body colour. */
  readonly bodyColor: number;
  /** Walk-cycle leg swing amplitude (Beta = 1.4 radians). */
  readonly legSwingAmplitude?: number;
}

/**
 * Shared procedural quadruped model: body + head groups, four hip-pivoted legs,
 * walk cycle, interpolated body yaw, independent head yaw and death collapse.
 * Material handling, the hurt flash and disposal come from {@link EntityModel}.
 * Purely a rendering/animation abstraction — no entity logic.
 *
 * Hierarchy: `root` (feet) → `bodyYawGroup` (body heading) → body mesh,
 * `headGroup` (relative head turn) and four leg groups. Faces +Z at yaw 0.
 *
 * Subclasses build extra geometry (snout, horns, wool…) via the inherited
 * {@link addBox}/{@link createMaterial}; materials created there join the flash
 * and disposal automatically.
 */
export abstract class QuadrupedModel extends EntityModel {
  protected readonly bodyYawGroup = new Group();
  protected readonly headGroup = new Group();
  protected readonly legGroups: Group[] = [];

  private readonly bodyMat: MeshBasicMaterial;
  private readonly swingAmplitude: number;

  protected constructor(config: QuadrupedConfig) {
    super();
    this.swingAmplitude = config.legSwingAmplitude ?? 1.4;

    this.bodyMat = this.createMaterial(config.bodyColor);

    // Body.
    this.addBox(this.bodyYawGroup, config.body, this.bodyMat, 0, config.body.y, 0);

    // Head (centred at the head pivot plus the head offset).
    const ho = config.headOffset ?? { x: 0, y: 0, z: 0 };
    this.addBox(this.headGroup, config.head, this.bodyMat, ho.x, ho.y, ho.z);
    this.headGroup.position.set(0, config.head.pivotY * PX, config.head.pivotZ * PX);
    this.bodyYawGroup.add(this.headGroup);

    // Four hip-pivoted legs (front toward +Z).
    for (const leg of config.legs) {
      const group = new Group();
      this.addBox(group, config.leg, this.bodyMat, 0, -config.leg.h / 2, 0);
      group.position.set(leg.x * PX, config.legPivotY * PX, leg.z * PX);
      this.legGroups.push(group);
      this.bodyYawGroup.add(group);
    }

    this.root.add(this.bodyYawGroup);
  }

  /**
   * Applies the animated pose. `legYaw`/`legSwing` drive the diagonal walk
   * cycle; `bodyYawDeg` is the body heading and `headRelYawDeg` the head turn
   * relative to the body (both in degrees).
   */
  public updatePose(legYaw: number, legSwing: number, _bodyYawDeg: number, headRelYawDeg: number, headPitchDeg = 0): void {
    this.headGroup.rotation.y = -deg2rad(headRelYawDeg);
    this.headGroup.rotation.x = deg2rad(headPitchDeg);

    // Beta walk cycle: cos(phase * 0.6662) * 1.4 * swing. The diagonal pairing
    // below is the rendered-equivalent of Beta's leg1/leg4 vs leg2/leg3 phasing
    // once the Y-up rotation flip is accounted for.
    const swing = Math.cos(legYaw * 0.6662) * this.swingAmplitude * legSwing;
    if (this.legGroups[0]) this.legGroups[0].rotation.x = swing;
    if (this.legGroups[3]) this.legGroups[3].rotation.x = swing;
    if (this.legGroups[1]) this.legGroups[1].rotation.x = -swing;
    if (this.legGroups[2]) this.legGroups[2].rotation.x = -swing;
  }

  /** Death collapse: rolls the body onto its side as `progress` goes 0 → 1. */
  public setDeathProgress(progress: number): void {
    this.bodyYawGroup.rotation.z = Math.max(0, Math.min(1, progress)) * (Math.PI / 2);
  }

  /** The main body material (exposed so the hurt flash can be inspected). */
  public get bodyMaterial(): MeshBasicMaterial {
    return this.bodyMat;
  }
}
