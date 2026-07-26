import * as THREE from 'three';
import type { EntityManager } from '../entities/core/EntityManager';
import { BoatEntity } from '../entities/BoatEntity';
import { applyLegacyBoxUv } from '../entities/living/LegacyModelUv';
import { attachEntityLighting } from './ChunkRenderer';

/**
 * Beta 1.7.3 `ModelBoat` renderer.
 *
 * Beta builds the boat from five flat panels (floor plus four sides) plus two
 * oars, laid out on a 64x32 legacy texture. The panels are reproduced here at
 * the same proportions so the supplied `boat.png` maps correctly.
 *
 * Damage rocking follows Beta's `RenderBoat`: the hull rolls by an angle
 * proportional to remaining damage, alternating with `rockDirection`.
 */

interface BoatSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yawDegrees: number;
  readonly damage: number;
  readonly timeSinceHit: number;
  readonly rockDirection: number;
}

function lerpAngleDegrees(a: number, b: number, alpha: number): number {
  let delta = b - a;
  while (delta < -180) delta += 360;
  while (delta >= 180) delta -= 360;
  return a + delta * alpha;
}

function snapshotBoat(entity: BoatEntity, alpha: number): BoatSnapshot {
  return {
    x: entity.previousPosition.x + (entity.position.x - entity.previousPosition.x) * alpha,
    y: entity.previousPosition.y + (entity.position.y - entity.previousPosition.y) * alpha,
    z: entity.previousPosition.z + (entity.position.z - entity.previousPosition.z) * alpha,
    yawDegrees: lerpAngleDegrees(entity.previousYaw, entity.yaw, alpha),
    damage: Math.max(0, entity.damage - alpha),
    timeSinceHit: Math.max(0, entity.timeSinceHit - alpha),
    rockDirection: entity.rockDirection,
  };
}

export class BoatRenderer {
  public readonly root = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly material: THREE.MeshBasicMaterial;
  private readonly pool: THREE.Group[] = [];

  public constructor(scene: THREE.Scene, texture: THREE.Texture) {
    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
    });
    // Boats must darken at night and in caves like every other entity.
    attachEntityLighting(this.material);
    scene.add(this.root);
  }

  /**
   * Beta `ModelBoat`, part for part.
   *
   * Five ModelRenderer boxes on a 64x32 sheet, in Beta's own texel units
   * (1 texel = 1/16 block):
   *   [0] floor  24 x 16 x 4 at uv(0,8), rotated flat
   *   [1..4] walls 20 x 6 x 2 at uv(0,0), one per side
   *
   * Beta's model has no oars and its `setRotationAngles` is empty, so there
   * is deliberately nothing animated here.
   */
  private buildHull(): THREE.Group {
    const group = new THREE.Group();
    const T = 1 / 16;

    // Beta boatSides[0]: addBox(-12, -8, -3, 24, 16, 4), rotateAngleX = PI/2.
    const floor = this.panel(
      [24 * T, 16 * T, 4 * T],
      [0, 4 * T, 0],
      [Math.PI / 2, 0, 0],
      { u: 0, v: 8, w: 24, h: 16, d: 4 },
    );
    group.add(floor);

    // Beta boatSides[1..4]: addBox(-10, -7, -1, 20, 6, 2) with per-side
    // rotation points and yaw.
    const wall = (
      rotationPoint: [number, number, number],
      yaw: number,
    ): THREE.Mesh => {
      const mesh = this.panel(
        [20 * T, 6 * T, 2 * T],
        [0, 0, 0],
        [0, yaw, 0],
        { u: 0, v: 0, w: 20, h: 6, d: 2 },
      );
      // The box sits above its rotation point (y from -7 to -1 in Beta's
      // downward-positive space), so it is lifted into place here.
      const holder = new THREE.Group();
      holder.position.set(rotationPoint[0], rotationPoint[1], rotationPoint[2]);
      holder.rotation.y = yaw;
      mesh.rotation.set(0, 0, 0);
      mesh.position.set(0, 4 * T, 0);
      holder.add(mesh);
      group.add(holder);
      return mesh;
    };

    wall([-11 * T, 4 * T, 0], -Math.PI / 2);
    wall([11 * T, 4 * T, 0], Math.PI / 2);
    wall([0, 4 * T, -9 * T], Math.PI);
    wall([0, 4 * T, 9 * T], 0);

    return group;
  }

  private panel(
    size: [number, number, number],
    position: [number, number, number],
    rotation: [number, number, number],
    uv: { u: number; v: number; w: number; h: number; d: number },
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    applyLegacyBoxUv(geometry, { u: uv.u, v: uv.v, w: uv.w, h: uv.h, d: uv.d, textureWidth: 64, textureHeight: 32 });
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    return mesh;
  }

  /** Rebuilds the visible boat set from the live entities. */
  public update(entities: EntityManager, alpha: number): void {
    const boats: BoatEntity[] = [];
    entities.forEachActive((entity) => {
      if (entity instanceof BoatEntity && !entity.removed) boats.push(entity);
    });

    while (this.pool.length < boats.length) {
      const hull = this.buildHull();
      this.pool.push(hull);
      this.root.add(hull);
    }
    for (let i = boats.length; i < this.pool.length; i++) {
      this.pool[i]!.visible = false;
    }

    for (let i = 0; i < boats.length; i++) {
      const group = this.pool[i]!;
      const snapshot = snapshotBoat(boats[i]!, alpha);
      group.visible = true;
      group.position.set(snapshot.x, snapshot.y, snapshot.z);
      // Beta's model faces -Z; its yaw is measured from +X.
      group.rotation.y = -(snapshot.yawDegrees * Math.PI / 180) + Math.PI / 2;
      // Beta RenderBoat rolls the hull while damaged.
      const rock = snapshot.timeSinceHit > 0
        ? Math.sin(snapshot.timeSinceHit) * snapshot.timeSinceHit * snapshot.damage / 10 * snapshot.rockDirection
        : 0;
      group.rotation.z = rock * Math.PI / 180;
    }
  }

  public dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
    this.material.dispose();
    this.root.removeFromParent();
  }
}
