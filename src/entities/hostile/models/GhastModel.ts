import { Group, type Texture } from 'three';
import { EntityModel, PX } from '../../living/EntityModel';
import { JavaRandom } from '../../../world/generation/random/JavaRandom';

/** Beta `RenderGhast.func_4014_a` rest scale (squish factor at attackCounter 0). */
const GHAST_REST_SCALE = 4.5;
/** Beta `ModelGhast`: nine tentacles. */
const TENTACLE_COUNT = 9;

/**
 * Beta `ModelGhast`: one 16x16x16 body cube plus nine 2-wide tentacles of
 * varying length (deterministic via `new Random(1660L)`), attached to the
 * body's underside and swaying. Body + tentacles share one entity-lit material
 * whose map swaps between the normal and shooting (charge) skins.
 *
 * Model space follows this project's feet-origin convention (16px = 1 block);
 * the body fills the lower hitbox and tentacles dangle below it. The renderer
 * applies the Beta charge "squish" scale on top. UV layout and tentacle
 * orientation are intended to be verified against the supplied texture in a
 * browser (see manual checks) — geometry only cannot confirm skinning.
 */
export class GhastModel extends EntityModel {
  readonly body = new Group();
  private readonly tentacles: Group[] = [];
  private readonly bodyMaterial = this.createMaterial(0xbbbbbb);
  private readonly normalTexture: Texture | undefined;
  private readonly shootingTexture: Texture | undefined;

  public constructor(normal?: Texture, shooting?: Texture) {
    super();
    this.normalTexture = normal;
    this.shootingTexture = shooting;
    if (normal !== undefined) { this.bodyMaterial.map = normal; this.bodyMaterial.color.set(0xffffff); this.bodyMaterial.needsUpdate = true; }

    // Body: 16px cube centred on its group; group at y=8px so the cube spans
    // 0..16px (0..1 block) — scaled by the renderer to fill the hitbox.
    this.body.position.set(0, 8 * PX, 0);
    this.addBox(this.body, { w: 16, h: 16, d: 16 }, this.bodyMaterial, 0, 0, 0, { u: 0, v: 0, textureHeight: 32 });
    this.root.add(this.body);

    // Tentacles: Beta x/z placement formula, lengths 8..14 via Random(1660).
    const rng = new JavaRandom(1660n);
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = (((col - (row % 2) * 0.5 + 0.25) / 2) * 2 - 1) * 5;
      const z = ((row / 2) * 2 - 1) * 5;
      const len = rng.nextInt(7) + 8;
      const tentacle = new Group();
      // Pivot on the body's underside (y=0); box hangs downward from there.
      tentacle.position.set(x * PX, 0, z * PX);
      this.addBox(tentacle, { w: 2, h: len, d: 2 }, this.bodyMaterial, 0, -len / 2, 0, { u: 0, v: 0, textureHeight: 32 });
      this.tentacles.push(tentacle);
      this.root.add(tentacle);
    }
  }

  /** Swaps to the shooting (charge) skin when the ghast is firing. */
  public setShooting(shooting: boolean): void {
    const tex = shooting && this.shootingTexture !== undefined ? this.shootingTexture : this.normalTexture;
    if (this.bodyMaterial.map !== tex) { this.bodyMaterial.map = tex ?? null; this.bodyMaterial.needsUpdate = true; }
  }

  /** Beta `setRotationAngles`: tentacles sway as 0.2*sin(t*0.3+i)+0.4. */
  public updateTentacles(time: number): void {
    for (let i = 0; i < this.tentacles.length; i++) {
      this.tentacles[i]!.rotation.x = 0.2 * Math.sin(time * 0.3 + i) + 0.4;
    }
  }

  /**
   * Beta `RenderGhast.func_4014_a` charge squish, applied to the root. `progress`
   * is the interpolated attack counter / 20 (>=0). The body widens and flattens
   * as it charges toward firing.
   */
  public applyChargeSquish(progress: number): void {
    let p = progress;
    if (p < 0) p = 0;
    const factor = 1 / (p * p * p * p * p * 2 + 1);
    const y = (8 + factor) / 2;
    const xz = (8 + 1 / factor) / 2;
    this.root.scale.set(xz, y, xz);
  }

  /** Rest scale (no charge) so the model fills the 4x4x4 hitbox like Beta. */
  public applyRestScale(): void {
    this.root.scale.set(GHAST_REST_SCALE, GHAST_REST_SCALE, GHAST_REST_SCALE);
  }
}
