import * as THREE from 'three';
import type { EntityManager } from '../entities/core/EntityManager';
import { MinecartEntity } from '../entities/MinecartEntity';
import type { EntityTextureAssets } from '../assets/EntityTextureAssets';
import { applyLegacyBoxUv } from '../entities/living/LegacyModelUv';
import { attachEntityLighting } from './ChunkRenderer';

export interface MinecartRenderSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly hurtTime: number;
  readonly damage: number;
  readonly hurtDir: number;
}

function lerpAngleDegrees(a: number, b: number, alpha: number): number {
  let delta = b - a;
  while (delta < -180) delta += 360;
  while (delta >= 180) delta -= 360;
  return a + delta * alpha;
}

function snapshotMinecart(entity: MinecartEntity, alpha: number): MinecartRenderSnapshot {
  return {
    x: entity.previousPosition.x + (entity.position.x - entity.previousPosition.x) * alpha,
    y: entity.previousPosition.y + (entity.position.y - entity.previousPosition.y) * alpha,
    z: entity.previousPosition.z + (entity.position.z - entity.previousPosition.z) * alpha,
    yawDegrees: lerpAngleDegrees(entity.previousYaw, entity.yaw, alpha),
    pitchDegrees: entity.previousPitch + (entity.pitch - entity.previousPitch) * alpha,
    hurtTime: Math.max(0, entity.hurtTime - alpha),
    damage: Math.max(0, entity.damage - alpha),
    hurtDir: entity.hurtDir,
  };
}

export class MinecartRenderer {
  public readonly root = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly material: THREE.MeshBasicMaterial;

  public constructor(texture: THREE.Texture) {
    this.material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, alphaTest: 0.1 });
    attachEntityLighting(this.material);
    this.buildFivePanelModel();
  }

  private buildFivePanelModel(): void {
    // Beta ModelMinecart uses /item/cart.png as a 64×32 legacy ModelRenderer
    // texture. The browser asset is the same-layout /textures/entity/minecart.png.
    const floor = this.boxPanel(
      [1.25, 1.0, 0.125],
      [0, 0.125, 0],
      [-Math.PI / 2, 0, 0],
      { u: 0, v: 10, w: 20, h: 16, d: 2 },
    );
    const left = this.boxPanel(
      [1.0, 0.5, 0.125],
      [-0.625, 0.375, 0],
      [0, Math.PI / 2, 0],
      { u: 0, v: 0, w: 16, h: 8, d: 2 },
    );
    const right = this.boxPanel(
      [1.0, 0.5, 0.125],
      [0.625, 0.375, 0],
      [0, -Math.PI / 2, 0],
      { u: 0, v: 0, w: 16, h: 8, d: 2 },
    );
    const front = this.boxPanel(
      [1.25, 0.5, 0.125],
      [0, 0.375, -0.5],
      [0, 0, 0],
      { u: 0, v: 0, w: 16, h: 8, d: 2, sourceW: 20 },
    );
    const back = this.boxPanel(
      [1.25, 0.5, 0.125],
      [0, 0.375, 0.5],
      [0, Math.PI, 0],
      { u: 0, v: 0, w: 16, h: 8, d: 2, sourceW: 20 },
    );
    this.root.add(floor, left, right, front, back);
  }

  private boxPanel(
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    rotation: readonly [number, number, number],
    uv: { readonly u: number; readonly v: number; readonly w: number; readonly h: number; readonly d: number; readonly sourceW?: number },
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    applyLegacyBoxUv(geometry, {
      u: uv.u,
      v: uv.v,
      w: uv.w,
      h: uv.h,
      d: uv.d,
      ...(uv.sourceW === undefined ? {} : { sourceW: uv.sourceW }),
      textureWidth: 64,
      textureHeight: 32,
    });
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    return mesh;
  }

  public update(snapshot: MinecartRenderSnapshot): void {
    this.root.position.set(snapshot.x, snapshot.y, snapshot.z);
    this.root.rotation.set(
      snapshot.hurtTime > 0 ? Math.sin(snapshot.hurtTime) * snapshot.hurtTime * snapshot.damage / 10 * snapshot.hurtDir * Math.PI / 180 : 0,
      (180 - snapshot.yawDegrees) * Math.PI / 180,
      -snapshot.pitchDegrees * Math.PI / 180,
    );
  }

  public dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
    this.material.dispose();
    this.root.removeFromParent();
  }
}

export class MinecartRenderSystem {
  private readonly renderers = new Map<string, MinecartRenderer>();

  public constructor(
    private readonly entityManager: EntityManager,
    private readonly scene: THREE.Scene,
    private readonly textures: EntityTextureAssets,
  ) {}

  public update(alpha: number): void {
    const seen = new Set<string>();
    this.entityManager.forEachActive((entity) => {
      if (!(entity instanceof MinecartEntity) || entity.removed) return;
      seen.add(entity.uuid);
      let renderer = this.renderers.get(entity.uuid);
      if (renderer === undefined) {
        renderer = new MinecartRenderer(this.textures.get('minecart'));
        this.renderers.set(entity.uuid, renderer);
        this.scene.add(renderer.root);
      }
      renderer.update(snapshotMinecart(entity, alpha));
    });
    for (const [uuid, renderer] of this.renderers) {
      if (!seen.has(uuid)) {
        renderer.dispose();
        this.renderers.delete(uuid);
      }
    }
  }

  public dispose(): void {
    for (const renderer of this.renderers.values()) renderer.dispose();
    this.renderers.clear();
  }
}
