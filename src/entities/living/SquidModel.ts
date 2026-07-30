import { Group, type Texture } from 'three';
import { EntityModel, PX } from './EntityModel';

/**
 * Beta `ModelSquid`, transcribed part-for-part.
 *
 * Beta's constructor offsets every part by `var1 = -16`, so the body sits at
 * rotationPointY 8 and the tentacles at 15 in Beta's Y-down space. Mapping to
 * this project's Y-up, feet-at-zero convention:
 *
 *   projectX = betaX
 *   projectY = 24 - betaY
 *   projectZ = -betaZ
 *
 * Body:      ModelRenderer(0, 0),  addBox(-6, -8, -6, 12, 16, 12)
 * Tentacles: ModelRenderer(48, 0), addBox(-1, 0, -1, 2, 18, 2), ×8 arranged on
 *            a circle of radius 5 and pre-yawed so each faces outward.
 *
 * `squid.png` is 64×32, which is what the UV origins above are addressed
 * against.
 */

const TEX_W = 64;
const TEX_H = 32;

/** Beta's whole-model Y offset (`byte var1 = -16`). */
const BETA_Y_OFFSET = -16;

const TENTACLE_COUNT = 8;

export class SquidModel extends EntityModel {
  /**
   * Holds the swim orientation. Never write to `root` from here — the entity's
   * render interpolation owns world position and body yaw.
   */
  private readonly pose = new Group();
  private readonly tentacles: Group[] = [];

  public constructor(texture?: Texture) {
    super();
    this.root.add(this.pose);

    const material = this.createMaterial(texture ? 0xffffff : 0x6b4e9b, texture);

    // Body — rotationPointY = 24 + var1 = 8 (Beta space) → 24 - 8 = 16 here.
    const body = new Group();
    const bodyPivotY = 24 - (24 + BETA_Y_OFFSET);
    body.position.set(0, bodyPivotY * PX, 0);
    // addBox(-6, -8, -6, 12, 16, 12) centres the box on the pivot: Beta centre
    // is betaY 8, which is the pivot itself, so the offset is zero.
    this.addBox(body, { w: 12, h: 16, d: 12 }, material, 0, 0, 0, { u: 0, v: 0, textureWidth: TEX_W, textureHeight: TEX_H });
    this.pose.add(body);

    // Eight tentacles on a radius-5 circle, rotationPointY = 31 + var1 = 15.
    const tentaclePivotY = 24 - (31 + BETA_Y_OFFSET);
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const theta = (i * Math.PI * 2) / TENTACLE_COUNT;
      const x = Math.cos(theta) * 5;
      const z = Math.sin(theta) * 5;

      const tentacle = new Group();
      // Beta's Z axis is negated by the mapping, so the ring position flips in Z.
      tentacle.position.set(x * PX, tentaclePivotY * PX, -z * PX);
      // Beta: rotateAngleY = i * -2π / 8 + π/2. Y rotations negate under the
      // mapping, so the sign flips here.
      tentacle.rotation.y = -((i * Math.PI * -2) / TENTACLE_COUNT + Math.PI / 2);

      // addBox(-1, 0, -1, 2, 18, 2): centre offset (0, -9, 0) after the Y flip,
      // so each tentacle hangs downward from its pivot.
      this.addBox(tentacle, { w: 2, h: 18, d: 2 }, material, 0, -9, 0, { u: 48, v: 0, textureWidth: TEX_W, textureHeight: TEX_H });

      this.tentacles.push(tentacle);
      this.pose.add(tentacle);
    }
  }

  /**
   * Beta `ModelSquid.setRotationAngles` plus `RenderSquid.rotateCorpse`.
   *
   * Every tentacle takes the same `tentacleAngle` about X. `squidPitch` and
   * `squidYaw` are the already-interpolated Beta swim angles in degrees; the
   * 0.5/-1.2 block translations reproduce Beta's pivot shift so the squid
   * rotates about its body centre rather than its feet.
   */
  public updatePose(tentacleAngle: number, squidPitchDeg: number, squidYawDeg: number): void {
    for (const tentacle of this.tentacles) {
      tentacle.rotation.x = tentacleAngle;
    }

    // RenderSquid: translate(0, 0.5, 0) → rotate pitch about X → rotate yaw
    // about Y → translate(0, -1.2, 0).
    this.pose.position.set(0, 0.5, 0);
    this.pose.rotation.set((squidPitchDeg * Math.PI) / 180, -(squidYawDeg * Math.PI) / 180, 0, 'XYZ');
    this.pose.updateMatrix();
    // Apply the post-rotation offset in the rotated frame, as GL would.
    this.pose.translateY(-1.2);
  }
}
