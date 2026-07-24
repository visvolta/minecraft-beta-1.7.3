import * as THREE from 'three';
import { JavaRandom } from '../../world/generation/random/JavaRandom';
import type { LightningState } from '../../world/weather/LightningState';

export const MAX_ACTIVE_BOLTS = 8;
export const BOLT_WIDTH = 1.0;

/**
 * Renders Beta-style lightning from LightningState. This class has no
 * strike scheduling or gameplay logic; it only ports RenderLightningBolt's
 * seeded multi-pass additive geometry into BufferGeometry.
 */
export class LightningRenderer {
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private lastFlashStrength = 0;
  private lastActiveCount = 0;

  public constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'lightningBolts';
    this.mesh.renderOrder = 30;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  public update(state: LightningState): void {
    const bolts = state.getBolts();
    if (bolts.length === 0) {
      this.mesh.visible = false;
      this.lastFlashStrength = state.getFlashStrength();
      this.lastActiveCount = 0;
      return;
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (const bolt of bolts) {
      this.emitBolt(bolt.x, bolt.y, bolt.z, bolt.seed, positions, colors, indices);
    }

    const geometry = this.mesh.geometry;
    geometry.dispose();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh.visible = positions.length > 0;

    this.lastFlashStrength = state.getFlashStrength();
    this.lastActiveCount = state.getActiveBoltCount();
  }

  public getFlashStrength(): number {
    return this.lastFlashStrength;
  }

  public getActiveBoltCount(): number {
    return this.lastActiveCount;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }

  private emitBolt(
    x: number,
    y: number,
    z: number,
    seed: bigint,
    positions: number[],
    colors: number[],
    indices: number[],
  ): void {
    const offsetsX = new Array<number>(8);
    const offsetsZ = new Array<number>(8);
    let driftX = 0;
    let driftZ = 0;
    const random = new JavaRandom(seed);

    for (let j = 7; j >= 0; j--) {
      offsetsX[j] = driftX;
      offsetsZ[j] = driftZ;
      driftX += random.nextInt(11) - 5;
      driftZ += random.nextInt(11) - 5;
    }

    for (let pass = 0; pass < 4; pass++) {
      const branchRandom = new JavaRandom(seed);
      for (let branch = 0; branch < 3; branch++) {
        let topIndex = 7;
        let bottomIndex = 0;
        if (branch > 0) {
          topIndex = 7 - branch;
          bottomIndex = topIndex - 2;
        }

        let currentX = offsetsX[topIndex]! - driftX;
        let currentZ = offsetsZ[topIndex]! - driftZ;

        for (let segment = topIndex; segment >= bottomIndex; segment--) {
          const previousX = currentX;
          const previousZ = currentZ;

          if (branch === 0) {
            currentX += branchRandom.nextInt(11) - 5;
            currentZ += branchRandom.nextInt(11) - 5;
          } else {
            currentX += branchRandom.nextInt(31) - 15;
            currentZ += branchRandom.nextInt(31) - 15;
          }

          let topRadius = 0.1 + pass * 0.2;
          if (branch === 0) {
            topRadius *= segment * 0.1 + 1;
          }
          let bottomRadius = 0.1 + pass * 0.2;
          if (branch === 0) {
            bottomRadius *= (segment - 1) * 0.1 + 1;
          }

          this.emitLightningSegment(
            x,
            y,
            z,
            previousX,
            previousZ,
            currentX,
            currentZ,
            segment,
            topRadius,
            bottomRadius,
            positions,
            colors,
            indices,
          );
        }
      }
    }
  }

  private emitLightningSegment(
    x: number,
    y: number,
    z: number,
    previousX: number,
    previousZ: number,
    currentX: number,
    currentZ: number,
    segment: number,
    topRadius: number,
    bottomRadius: number,
    positions: number[],
    colors: number[],
    indices: number[],
  ): void {
    const topY = y + (segment + 1) * 16;
    const bottomY = y + segment * 16;
    const topCorners = this.squareCorners(x + 0.5 + previousX, topY, z + 0.5 + previousZ, topRadius);
    const bottomCorners = this.squareCorners(x + 0.5 + currentX, bottomY, z + 0.5 + currentZ, bottomRadius);

    for (let i = 0; i < 4; i++) {
      const a = bottomCorners[i]!;
      const b = bottomCorners[(i + 1) % 4]!;
      const c = topCorners[(i + 1) % 4]!;
      const d = topCorners[i]!;
      const base = positions.length / 3;
      positions.push(...a, ...b, ...c, ...d);
      for (let v = 0; v < 4; v++) {
        colors.push(0.45, 0.45, 0.5, 0.3);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  private squareCorners(cx: number, cy: number, cz: number, radius: number): Array<[number, number, number]> {
    return [
      [cx - radius, cy, cz - radius],
      [cx + radius, cy, cz - radius],
      [cx + radius, cy, cz + radius],
      [cx - radius, cy, cz + radius],
    ];
  }
}
