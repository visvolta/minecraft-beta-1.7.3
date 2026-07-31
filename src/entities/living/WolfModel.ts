import { Group, MeshBasicMaterial, type Texture } from 'three';
import { EntityModel, PX } from './EntityModel';

/**
 * Beta `ModelWolf`, transcribed part-for-part.
 *
 * Coordinate mapping from Beta's model space (Y down from 24 at the feet,
 * -Z forward) to this project's convention (Y up from 0 at the feet, +Z
 * forward):
 *
 *   projectX = betaX
 *   projectY = 24 - betaY
 *   projectZ = -betaZ
 *
 * Rotations about X are preserved by that mapping (conjugating Rx by
 * diag(1,-1,-1) leaves Rx unchanged), so Beta's `rotateAngleX` values are
 * used verbatim. Rotations about Y and Z negate.
 *
 * Every part keeps Beta's own box dimensions and UV origin; the 90° body/mane
 * pitch is applied as a group rotation rather than baked into the geometry, so
 * the texture net still lines up with `wolf.png` (64×32).
 */

/** Beta rotationPoint → project pivot (pixels). */
function pivot(bx: number, by: number, bz: number): readonly [number, number, number] {
  return [bx, 24 - by, -bz];
}

/** Beta addBox origin+size → project mesh-centre offset from the pivot (pixels). */
function centre(ox: number, oy: number, oz: number, w: number, h: number, d: number): readonly [number, number, number] {
  return [ox + w / 2, -(oy + h / 2), -(oz + d / 2)];
}

const TEX_W = 64;
const TEX_H = 32;

/** Beta's head/ear/snout rotation point height (`var2 = 13.5F`). */
const HEAD_Y = 13.5;

export class WolfModel extends EntityModel {
  /**
   * Everything hangs off this group, never off `root`. `root` is owned by the
   * entity's render interpolation (world position and body yaw); writing to it
   * from the model would pin the wolf to the world origin.
   */
  readonly pose = new Group();

  private readonly head = new Group();
  private readonly rightEar = new Group();
  private readonly leftEar = new Group();
  private readonly snout = new Group();
  private readonly body = new Group();
  private readonly mane = new Group();
  private readonly tail = new Group();
  private readonly legs: Group[] = [];
  private readonly collar = new Group();

  private readonly bodyMaterial: MeshBasicMaterial;
  private readonly wildTexture: Texture | undefined;
  private readonly tameTexture: Texture | undefined;
  private readonly angryTexture: Texture | undefined;

  public constructor(wild?: Texture, tame?: Texture, angry?: Texture, collar?: Texture) {
    super();
    this.wildTexture = wild;
    this.tameTexture = tame;
    this.angryTexture = angry;

    this.root.add(this.pose);

    // A single material for the whole body, so a state change swaps one map.
    this.bodyMaterial = this.createMaterial(wild ? 0xffffff : 0xd7d3d3, wild);
    const m = this.bodyMaterial;

    // Head — ModelRenderer(0, 0), addBox(-3, -3, -2, 6, 6, 4), rp(-1, 13.5, -7).
    this.addPart(this.head, pivot(-1, HEAD_Y, -7), centre(-3, -3, -2, 6, 6, 4), { w: 6, h: 6, d: 4 }, m, 0, 0);

    // Right ear — ModelRenderer(16, 14), addBox(-3, -5, 0, 2, 2, 1), same rp as head.
    this.addPart(this.rightEar, pivot(-1, HEAD_Y, -7), centre(-3, -5, 0, 2, 2, 1), { w: 2, h: 2, d: 1 }, m, 16, 14);

    // Left ear — ModelRenderer(16, 14), addBox(1, -5, 0, 2, 2, 1), same rp as head.
    this.addPart(this.leftEar, pivot(-1, HEAD_Y, -7), centre(1, -5, 0, 2, 2, 1), { w: 2, h: 2, d: 1 }, m, 16, 14);

    // Snout — ModelRenderer(0, 10), addBox(-2, 0, -5, 3, 3, 4), rp(-0.5, 13.5, -7).
    this.addPart(this.snout, pivot(-0.5, HEAD_Y, -7), centre(-2, 0, -5, 3, 3, 4), { w: 3, h: 3, d: 4 }, m, 0, 10);

    // Body — ModelRenderer(18, 14), addBox(-4, -2, -3, 6, 9, 6), rp(0, 14, 2).
    this.addPart(this.body, pivot(0, 14, 2), centre(-4, -2, -3, 6, 9, 6), { w: 6, h: 9, d: 6 }, m, 18, 14);

    // Mane — ModelRenderer(21, 0), addBox(-4, -3, -3, 8, 6, 7), rp(-1, 14, 2).
    this.addPart(this.mane, pivot(-1, 14, 2), centre(-4, -3, -3, 8, 6, 7), { w: 8, h: 6, d: 7 }, m, 21, 0);

    // Tail — ModelRenderer(9, 18), addBox(-1, 0, -1, 2, 8, 2), rp(-1, 12, 8).
    this.addPart(this.tail, pivot(-1, 12, 8), centre(-1, 0, -1, 2, 8, 2), { w: 2, h: 8, d: 2 }, m, 9, 18);

    // Four legs — ModelRenderer(0, 18), addBox(-1, 0, -1, 2, 8, 2).
    // Beta order: leg1/leg2 are the rear pair (z = 7), leg3/leg4 the front pair (z = -4).
    const legPoints: readonly (readonly [number, number, number])[] = [
      [-2.5, 16, 7], [0.5, 16, 7], [-2.5, 16, -4], [0.5, 16, -4],
    ];
    for (const [lx, ly, lz] of legPoints) {
      const leg = new Group();
      this.addPart(leg, pivot(lx, ly, lz), centre(-1, 0, -1, 2, 8, 2), { w: 2, h: 8, d: 2 }, m, 0, 18);
      this.legs.push(leg);
    }

    // Collar — Beta renders the tamed collar as a second pass over the mane box
    // using `wolf_collar.png`. Kept as its own material so it can be tinted and
    // hidden independently; only visible once tamed.
    const collarMaterial = this.createMaterial(collar ? 0xffffff : 0xff0000, collar, true);
    this.addPart(this.collar, pivot(-1, 14, 2), centre(-4, -3, -3, 8, 6, 7), { w: 8, h: 6, d: 7 }, collarMaterial, 21, 0);
    this.collar.visible = false;
  }

  /** Builds one Beta part: a pivot group holding a single offset box mesh. */
  private addPart(
    group: Group,
    [px, py, pz]: readonly [number, number, number],
    [cx, cy, cz]: readonly [number, number, number],
    spec: { readonly w: number; readonly h: number; readonly d: number },
    material: MeshBasicMaterial,
    u: number,
    v: number,
  ): void {
    group.position.set(px * PX, py * PX, pz * PX);
    this.addBox(group, spec, material, cx, cy, cz, { u, v, textureWidth: TEX_W, textureHeight: TEX_H });
    this.pose.add(group);
  }

  /**
   * Applies Beta `ModelWolf.setLivingAnimations` + `setRotationAngles`.
   *
   * `legYaw`/`legSwing` are Beta's limb-swing phase and amount; `headRelYawDeg`
   * and `headPitchDeg` are the head look relative to the body, ALREADY with the
   * interested tilt added by the caller. `tailAngleRad` is Beta setTailRotation
   * value in radians.
   * Never touches `root` — the entity owns that transform.
   */
  public updatePose(
    tamed: boolean,
    angry: boolean,
    sitting: boolean,
    legYaw: number,
    legSwing: number,
    headRelYawRad: number,
    headPitchRad: number,
    tailAngleRad: number,
    timeShaking: number,
    prevTimeShaking: number,
  ): void {
    this.collar.visible = tamed;
    this.applyStateTexture(tamed, angry);

    // Head look (already in radians from the entity, with interested tilt added).
    for (const part of [this.head, this.rightEar, this.leftEar, this.snout]) {
      part.rotation.y = -headRelYawRad; // negate for Y-up/Z-forward mapping
      part.rotation.x = headPitchRad;
    }

    // Wet shake: shake the whole pose around Y while drying off.
    if (timeShaking > 0) {
      const shakeProg = (prevTimeShaking + (timeShaking - prevTimeShaking)) / 1.8;
      const clamped = Math.max(0, Math.min(1, shakeProg));
      const shakeAngle = Math.sin(clamped * Math.PI) * Math.sin(clamped * Math.PI * 11) * 0.15 * Math.PI;
      this.pose.rotation.y = shakeAngle;
    } else {
      this.pose.rotation.y = 0;
    }

    if (sitting) {
      // Beta sitting pose: body pitched back 45°, mane 72°, forelegs folded.
      this.setPivot(this.mane, -1, 16, -3);
      this.mane.rotation.x = 1.2566371;
      this.mane.rotation.y = 0;
      this.setPivot(this.body, 0, 18, 0);
      this.body.rotation.x = 0.7853982;
      this.setPivot(this.tail, -1, 21, 6);
      this.setPivot(this.legs[0]!, -2.5, 22, 2);
      this.legs[0]!.rotation.x = 4.712389;
      this.setPivot(this.legs[1]!, 0.5, 22, 2);
      this.legs[1]!.rotation.x = 4.712389;
      this.setPivot(this.legs[2]!, -2.49, 17, -4);
      this.legs[2]!.rotation.x = 5.811947;
      this.setPivot(this.legs[3]!, 0.51, 17, -4);
      this.legs[3]!.rotation.x = 5.811947;
      this.tail.rotation.x = tailAngleRad;
    } else {
      this.setPivot(this.body, 0, 14, 2);
      this.body.rotation.x = 1.5707964;
      this.setPivot(this.mane, -1, 14, -3);
      this.mane.rotation.x = this.body.rotation.x;
      this.mane.rotation.y = 0;
      this.setPivot(this.tail, -1, 12, 8);
      this.setPivot(this.legs[0]!, -2.5, 16, 7);
      this.setPivot(this.legs[1]!, 0.5, 16, 7);
      this.setPivot(this.legs[2]!, -2.5, 16, -4);
      this.setPivot(this.legs[3]!, 0.5, 16, -4);

      // Beta walk cycle: diagonal pairs 180° out of phase.
      const swing = Math.cos(legYaw * 0.6662) * 1.4 * legSwing;
      this.legs[0]!.rotation.x = swing;
      this.legs[3]!.rotation.x = swing;
      this.legs[1]!.rotation.x = -swing;
      this.legs[2]!.rotation.x = -swing;
      this.tail.rotation.x = tailAngleRad;
    }

    // Tail yaw wag: angry = no wag; otherwise wag with walk cycle.
    this.tail.rotation.y = angry ? 0 : -Math.cos(legYaw * 0.6662) * 1.4 * legSwing;
  }

  /** Sets a part's pivot from Beta rotation-point pixels. */
  private setPivot(group: Group, bx: number, by: number, bz: number): void {
    const [px, py, pz] = pivot(bx, by, bz);
    group.position.set(px * PX, py * PX, pz * PX);
  }

  /** Beta `RenderWolf.getEntityTexture`: wild → tame → angry. */
  private applyStateTexture(tamed: boolean, angry: boolean): void {
    const next = angry ? this.angryTexture : tamed ? this.tameTexture : this.wildTexture;
    if (next !== undefined && this.bodyMaterial.map !== next) {
      this.bodyMaterial.map = next;
      this.bodyMaterial.needsUpdate = true;
    }
  }
}
