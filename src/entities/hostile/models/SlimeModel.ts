import { Group, type Texture } from 'three';
import { EntityModel, PX } from '../../living/EntityModel';

/**
 * Beta `ModelSlime` (verbatim transcription):
 *   - Size 1: single 8×8×8 outer cube from UV (0,16).
 *   - Size >1: outer 8×8×8 (translucent, blending) at UV (0,0), plus inner
 *     6×6×6 solid at UV (0,0)? No — careful reading of ModelSlime(int):
 *       constructor(int var1):
 *         slimeBodies = new ModelRenderer(0, var1); slimeBodies.addBox(-4,16,-4,8,8,8);
 *         if (var1 > 0):   // outer cube layer
 *           slimeBodies = new ModelRenderer(0, var1); slimeBodies.addBox(-3,17,-3,6,6,6);  // inner cube
 *           rightEye/leftEye/mouth added.
 *     When RenderSlime is constructed, the main model = new ModelSlime(16)
 *     (outer layer) and the scaleAmount (pass model) = new ModelSlime(0) (inner).
 *
 * In our renderer we draw both layers here in a single model, switching inner
 * visibility based on slime size. The outer uses the alpha-test material (no
 * blending) and the inner is rendered with blending enabled to match Beta's
 * translucent outer shell.
 *
 * Beta uses a Y-down coordinate space with feet at 24; we project to Y-up with
 * feet at 0 using:
 *   project = (betaX, 24 - betaY, -betaZ)
 * addBox centres its mesh on the given pixel offset from the parent group.
 */
export class SlimeModel extends EntityModel {
  readonly bodyGroup = new Group();
  private readonly innerGroup: Group;
  private readonly rightEye: Group;
  private readonly leftEye: Group;
  private readonly mouth: Group;

  public constructor(texture?: Texture) {
    super();

    // Outer cube: addBox(-4, 16, -4, 8, 8, 8) — sits at feet level.
    // Beta centre (-4+4, 16+4, -4+4) = (0, 20, -4) → project (0, 4, 4)? Let me re-derive.
    // The model uses addBox directly on the ModelRenderer which has no explicit
    // rotationPoint set (defaults 0,0,0); with setRotationAngles a no-op the
    // cube spans betaX [-4,4], betaY [16,24], betaZ [-4,4]. In our coords that
    // is X [-4,4], Y [0,8], Z [-4,4] — i.e. an 8×8×8 cube on the ground
    // centred on origin. Mesh-centre = (0, 4PX, 0).
    const outerMaterial = this.createMaterial(texture ? 0xffffff : 0x5fa84e, texture);
    const outer = new Group();
    this.addBox(outer, { w: 8, h: 8, d: 8 }, outerMaterial, 0, 4, 0, { u: 0, v: 16, textureHeight: 32 });
    this.bodyGroup.add(outer);

    // Inner cube (only visible size>1): addBox(-3,17,-3,6,6,6)
    // Beta spans X [-3,3], Y [17,23], Z [-3,3] → project X [-3,3], Y [1,7], Z [-3,3].
    // Mesh-centre = (0, 4, 0) (symmetric).
    // Beta renders this with blending enabled (transparent outer layer); our
    // outer material is opaque, so the inner needs its own blended material to
    // show through.
    const innerMaterial = this.createMaterial(texture ? 0xffffff : 0x7ec869, texture, true);
    this.innerGroup = new Group();
    this.addBox(this.innerGroup, { w: 6, h: 6, d: 6 }, innerMaterial, 0, 4, 0, { u: 0, v: 0, textureHeight: 32 });
    this.bodyGroup.add(this.innerGroup);

    // Right eye: addBox(-3.25, 18, -3.5, 2, 2, 2).
    // Beta X ∈ [-3.25,-1.25], Y ∈ [18,20], Z ∈ [-3.5,-1.5]
    // project X ∈ [-3.25,-1.25] (centre -2.25), Y ∈ [4,6] (centre 5), Z ∈ [1.5,3.5] (centre 2.5)
    const eyeMaterial = this.createMaterial(0x000000, texture);
    this.rightEye = new Group();
    this.addBox(this.rightEye, { w: 2, h: 2, d: 2 }, eyeMaterial, -2.25, 5, 2.5, { u: 32, v: 0, textureHeight: 32 });
    this.bodyGroup.add(this.rightEye);

    // Left eye: addBox(1.25, 18, -3.5, 2, 2, 2) → centre (2.25, 5, 2.5)
    this.leftEye = new Group();
    this.addBox(this.leftEye, { w: 2, h: 2, d: 2 }, eyeMaterial, 2.25, 5, 2.5, { u: 32, v: 4, textureHeight: 32 });
    this.bodyGroup.add(this.leftEye);

    // Mouth: addBox(0, 21, -3.5, 1, 1, 1) → centre (0.5, 2.5, 3.0)
    this.mouth = new Group();
    this.addBox(this.mouth, { w: 1, h: 1, d: 1 }, eyeMaterial, 0.5, 2.5, 3.0, { u: 32, v: 8, textureHeight: 32 });
    this.bodyGroup.add(this.mouth);

    this.root.add(this.bodyGroup);
    this.setInnerVisible(false);
    void PX;
  }

  private setInnerVisible(visible: boolean): void {
    this.innerGroup.visible = visible;
    this.rightEye.visible = visible;
    this.leftEye.visible = visible;
    this.mouth.visible = visible;
  }

  /**
   * Beta `RenderSlime.scaleSlime` (verbatim):
   *   f = squish / (size*0.5 + 1);  inv = 1/(f+1);
   *   glScalef(inv*size, 1/inv*size, inv*size);
   */
  public updateSquish(squishInterpolated: number, slimeSize: number): void {
    this.setInnerVisible(slimeSize > 1);
    const f = squishInterpolated / (slimeSize * 0.5 + 1);
    const inv = 1 / (f + 1);
    const s = slimeSize;
    this.bodyGroup.scale.set(inv * s, (1 / inv) * s, inv * s);
  }
}
