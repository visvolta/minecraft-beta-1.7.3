import * as THREE from 'three';
import { applyEntityRenderOrder } from './RenderOrder';
import type { EntityLightingUpdater } from './EntityLightingUpdater';
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
    this.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.1 });
    attachEntityLighting(this.material);
    this.buildFivePanelModel();
  }

  private buildFivePanelModel(): void {
    // Direct transcription of Beta ModelMinecart's six ModelRenderer boxes:
    // bottom (20x16x2), four walls (16x8x2), and the inset floor panel
    // (18x14x1). Rotations match ModelMinecart lines 29-33.
    const bottom = this.boxPanel(
      [1.25, 1.0, 0.125],
      [0, 0.25, 0],
      [-Math.PI / 2, 0, 0],
      { u: 0, v: 10, w: 20, h: 16, d: 2 },
    );
    const innerFloor = this.boxPanel(
      [1.125, 0.875, 0.0625],
      [0, 0.275, 0],
      [Math.PI / 2, 0, 0],
      { u: 44, v: 10, w: 18, h: 14, d: 1 },
    );
    const left = this.boxPanel(
      [1.0, 0.5, 0.125],
      [-0.5825, 0.3125, 0],
      [0, Math.PI * 1.5, 0],
      { u: 0, v: 0, w: 16, h: 8, d: 2, swapInnerOuter: true },
    );
    const right = this.boxPanel(
      [1.0, 0.5, 0.125],
      [0.5825, 0.3125, 0],
      [0, Math.PI / 2, 0],
      { u: 0, v: 0, w: 16, h: 8, d: 2, swapInnerOuter: true },
    );
    const front = this.boxPanel(
      [1.0, 0.5, 0.125],
      [0, 0.3125, -0.4575],
      [0, Math.PI, 0],
      { u: 0, v: 0, w: 16, h: 8, d: 2, swapInnerOuter: true },
    );
    const back = this.boxPanel(
      [1.0, 0.5, 0.125],
      [0, 0.3125, 0.4575],
      [0, 0, 0],
      { u: 0, v: 0, w: 16, h: 8, d: 2, swapInnerOuter: true },
    );
    this.root.add(bottom, innerFloor, left, right, front, back);
  }

  private boxPanel(
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    rotation: readonly [number, number, number],
    uv: { readonly u: number; readonly v: number; readonly w: number; readonly h: number; readonly d: number; readonly sourceW?: number; readonly swapInnerOuter?: boolean },
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
    if (uv.swapInnerOuter === true) this.swapDepthFaceUvs(geometry);
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    return mesh;
  }


  private swapDepthFaceUvs(geometry: THREE.BoxGeometry): void {
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < 4; i++) {
      const a = 4 * 4 + i;
      const b = 5 * 4 + i;
      const u = uv.getX(a), v = uv.getY(a);
      uv.setXY(a, uv.getX(b), uv.getY(b));
      uv.setXY(b, u, v);
    }
    uv.needsUpdate = true;
  }

  public update(snapshot: MinecartRenderSnapshot): void {
    this.root.position.set(snapshot.x, snapshot.y, snapshot.z);
    this.root.rotation.set(
      snapshot.hurtTime > 0 ? Math.sin(snapshot.hurtTime) * snapshot.hurtTime * snapshot.damage / 10 * snapshot.hurtDir * Math.PI / 180 : 0,
      (180 - snapshot.yawDegrees) * Math.PI / 180,
      -snapshot.pitchDegrees * Math.PI / 180,
    );
  }

  public updateLighting(lighting: EntityLightingUpdater, position: { readonly x: number; readonly y: number; readonly z: number }): void {
    lighting.update({ renderObject: this.root, position });
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

  public update(alpha: number, lighting?: EntityLightingUpdater): void {
    const seen = new Set<string>();
    this.entityManager.forEachActive((entity) => {
      if (!(entity instanceof MinecartEntity) || entity.removed) return;
      seen.add(entity.uuid);
      let renderer = this.renderers.get(entity.uuid);
      if (renderer === undefined) {
        renderer = new MinecartRenderer(this.textures.get('minecart'));
        this.renderers.set(entity.uuid, renderer);
        this.scene.add(renderer.root);
        // Entity layer: keeps carts visible through water.
        applyEntityRenderOrder(renderer.root);
      }
      renderer.update(snapshotMinecart(entity, alpha));
      if (lighting !== undefined) renderer.updateLighting(lighting, entity.position);
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
