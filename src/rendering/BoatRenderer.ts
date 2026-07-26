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

/** Beta ModelBoat panel thickness in blocks (2 texels). */
const PANEL_THICKNESS = 0.125;

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
   * Beta ModelBoat: a 20x6x28-texel hull. The floor lies flat and the four
   * walls stand around it, each a thin panel.
   */
  private buildHull(): THREE.Group {
    const group = new THREE.Group();

    // Floor.
    group.add(this.panel(
      [1.5, 1.75, PANEL_THICKNESS],
      [0, PANEL_THICKNESS, 0],
      [-Math.PI / 2, 0, 0],
      { u: 0, v: 8, w: 24, h: 28, d: 2 },
    ));
    // Bow and stern.
    group.add(this.panel(
      [1.5, 0.375, PANEL_THICKNESS],
      [0, 0.3125, -0.875],
      [0, 0, 0],
      { u: 0, v: 0, w: 24, h: 6, d: 2 },
    ));
    group.add(this.panel(
      [1.5, 0.375, PANEL_THICKNESS],
      [0, 0.3125, 0.875],
      [0, Math.PI, 0],
      { u: 0, v: 0, w: 24, h: 6, d: 2 },
    ));
    // Port and starboard.
    group.add(this.panel(
      [1.75, 0.375, PANEL_THICKNESS],
      [-0.75, 0.3125, 0],
      [0, Math.PI / 2, 0],
      { u: 0, v: 0, w: 28, h: 6, d: 2 },
    ));
    group.add(this.panel(
      [1.75, 0.375, PANEL_THICKNESS],
      [0.75, 0.3125, 0],
      [0, -Math.PI / 2, 0],
      { u: 0, v: 0, w: 28, h: 6, d: 2 },
    ));

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
