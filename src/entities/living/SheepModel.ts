import { Group, Mesh, MeshBasicMaterial } from 'three';
import { QuadrupedModel, type QuadrupedConfig } from './QuadrupedModel';

const SHEEP_SKIN = 0xe0d0c0;

/** Beta fleece colour table (16 wool colours) as hex approximations. */
export const FLEECE_COLORS: readonly number[] = [
  0xffffff, 0xf2b233, 0xe580d9, 0x99b3f2, 0xe5e533, 0x80cc1a, 0xf2b3cc, 0x4d4d4d,
  0x999999, 0x4d99b3, 0xb366e5, 0x3366cc, 0x80664d, 0x668033, 0xcc4d4d, 0x1a1a1a,
];

/**
 * Beta sheep base body (ModelSheep2 extends ModelQuadruped(12, 0)), in the
 * shared world-16th convention. Body is the rendered-equivalent of Beta's
 * 8×16×6 box rotated 90° about X (effective 8 wide × 6 tall × 16 long).
 */
const SHEEP_BASE_CONFIG: QuadrupedConfig = {
  body: { w: 8, h: 6, d: 16, y: 15 },
  head: { w: 6, h: 6, d: 8, pivotY: 18, pivotZ: 8 },
  headOffset: { x: 0, y: 1, z: 2 },
  leg: { w: 4, h: 12, d: 4 },
  legPivotY: 12,
  legs: [
    { x: -3, z: 5 },
    { x: 3, z: 5 },
    { x: -3, z: -7 },
    { x: 3, z: -7 },
  ],
  bodyColor: SHEEP_SKIN,
};

/**
 * Sheep model: base body (ModelSheep2) plus a separate inflated wool layer
 * (ModelSheep1 geometry with Beta inflation: head +0.6, body +1.75, legs +0.5).
 * The wool layer toggles with the sheared flag, so future shearing needs no
 * renderer rewrite — only a visibility flip. Wool legs are parented to the leg
 * groups so they animate with the legs.
 */
export class SheepModel extends QuadrupedModel {
  private readonly woolGroup = new Group();
  private readonly woolMaterial: MeshBasicMaterial;
  private readonly woolLegMeshes: Mesh[] = [];
  private woolHeadMesh: Mesh | null = null;

  public constructor() {
    super(SHEEP_BASE_CONFIG);

    this.woolMaterial = this.createMaterial(FLEECE_COLORS[0]!);

    // Wool body (inflated 8×16×6 + 1.75 → effective 11.5 × 9.5 × 19.5).
    this.addBox(this.woolGroup, { w: 11.5, h: 9.5, d: 19.5 }, this.woolMaterial, 0, 15, 0);
    this.bodyYawGroup.add(this.woolGroup);

    // Wool head (inflated 6×6×6 + 0.6 → 7.2³), parented to the head group so
    // it turns with the head; positioned at the head offset.
    this.woolHeadMesh = this.addBox(this.headGroup, { w: 7.2, h: 7.2, d: 7.2 }, this.woolMaterial, 0, 1, 1);

    // Wool legs (inflated 4×6×4 + 0.5 → 5×7×5) parented to each leg group so
    // they swing with the legs; they cover the upper part of the base legs.
    for (const legGroup of this.legGroups) {
      const woolLeg = this.addBox(legGroup, { w: 5, h: 7, d: 5 }, this.woolMaterial, 0, -3.5, 0);
      this.woolLegMeshes.push(woolLeg);
    }
  }

  /** Toggles the wool layer (hidden when sheared). */
  public setSheared(sheared: boolean): void {
    this.woolGroup.visible = !sheared;
    if (this.woolHeadMesh) this.woolHeadMesh.visible = !sheared;
    for (const mesh of this.woolLegMeshes) {
      mesh.visible = !sheared;
    }
  }

  /** Colours the wool from the fleece colour index (0–15). */
  public setFleeceColor(color: number): void {
    const hex = FLEECE_COLORS[color & 15] ?? FLEECE_COLORS[0]!;
    this.recolorMaterial(this.woolMaterial, hex);
  }
}
