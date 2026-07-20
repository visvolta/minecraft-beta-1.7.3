import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { attachEntityLighting } from '../../rendering/ChunkRenderer';

/** Model space: 16 pixels per block, y up, origin at the entity's feet. */
const PX = 1 / 16;
const PINK = 0xefa6a0;
const SNOUT_PINK = 0xd98a86;

function deg2rad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Procedural box-built pig model (Beta pig proportions), reusing the same
 * entity-lit material pipeline as the player model — no external artwork and
 * no second rendering architecture. The model faces +Z at yaw 0, matching the
 * living-movement heading convention.
 *
 * Hierarchy: `root` (feet position) → `bodyYawGroup` (body heading) → body
 * mesh, `headGroup` (relative head turn) and four hip-pivoted leg groups for
 * the walk cycle.
 */
export class PigModel {
  public readonly root = new Group();

  private readonly bodyYawGroup = new Group();
  private readonly headGroup = new Group();
  private readonly frontLeftLeg = new Group();
  private readonly frontRightLeg = new Group();
  private readonly backLeftLeg = new Group();
  private readonly backRightLeg = new Group();

  private readonly material: MeshBasicMaterial;
  private readonly snoutMaterial: MeshBasicMaterial;
  private readonly geometries: BoxGeometry[] = [];

  public constructor() {
    this.material = new MeshBasicMaterial({ color: PINK });
    attachEntityLighting(this.material);
    this.snoutMaterial = new MeshBasicMaterial({ color: SNOUT_PINK });
    attachEntityLighting(this.snoutMaterial);

    // Body: chunky torso above the legs.
    const bodyMesh = this.box(8, 8, 14, this.material);
    bodyMesh.position.set(0, 9 * PX, 0);
    this.bodyYawGroup.add(bodyMesh);

    // Head (front, +Z) with a snout.
    const headMesh = this.box(8, 8, 8, this.material);
    this.headGroup.add(headMesh);
    const snoutMesh = this.box(4, 3, 2, this.snoutMaterial);
    snoutMesh.position.set(0, -1 * PX, 5 * PX);
    this.headGroup.add(snoutMesh);
    this.headGroup.position.set(0, 12 * PX, 10 * PX);
    this.bodyYawGroup.add(this.headGroup);

    // Four legs, pivoted at the hip (top), front legs toward +Z.
    this.buildLeg(this.frontLeftLeg, -3, 5);
    this.buildLeg(this.frontRightLeg, 3, 5);
    this.buildLeg(this.backLeftLeg, -3, -5);
    this.buildLeg(this.backRightLeg, 3, -5);
    this.bodyYawGroup.add(this.frontLeftLeg, this.frontRightLeg, this.backLeftLeg, this.backRightLeg);

    this.root.add(this.bodyYawGroup);
  }

  private box(w: number, h: number, d: number, material: MeshBasicMaterial): Mesh {
    const geometry = new BoxGeometry(w * PX, h * PX, d * PX);
    this.geometries.push(geometry);
    return new Mesh(geometry, material);
  }

  private buildLeg(group: Group, xPixels: number, zPixels: number): void {
    const legMesh = this.box(3, 6, 3, this.material);
    legMesh.position.set(0, -3 * PX, 0); // hang below the hip pivot
    group.add(legMesh);
    group.position.set(xPixels * PX, 6 * PX, zPixels * PX);
  }

  /**
   * Applies the animated pose. `legYaw`/`legSwing` drive the walk cycle;
   * `bodyYawDeg` is the body heading and `headRelYawDeg` the head turn
   * relative to the body (both in degrees).
   */
  public updatePose(legYaw: number, legSwing: number, bodyYawDeg: number, headRelYawDeg: number): void {
    this.bodyYawGroup.rotation.y = -deg2rad(bodyYawDeg);
    this.headGroup.rotation.y = -deg2rad(headRelYawDeg);

    const swing = Math.cos(legYaw) * legSwing * 1.2;
    this.frontLeftLeg.rotation.x = swing;
    this.backRightLeg.rotation.x = swing;
    this.frontRightLeg.rotation.x = -swing;
    this.backLeftLeg.rotation.x = -swing;
  }

  public dispose(): void {
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    this.geometries.length = 0;
    this.material.dispose();
    this.snoutMaterial.dispose();
  }
}
