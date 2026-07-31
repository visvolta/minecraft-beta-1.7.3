import * as THREE from 'three';
import type { Entity } from '../entities/core/Entity';
import type { FireAnimationSystem } from './fire/FireAnimationSystem';

/**
 * Renders the on-fire overlay around a burning entity, matching Beta
 * `Render.renderEntityOnFire` (b1.7.3).
 *
 * Beta draws the fire tile from `terrain.png` as a series of stacked
 * camera-facing crossed quads that scale with the entity's width, repeat
 * upwards as needed to cover the entity height, alternate UV flips, and
 * pull slightly forward in Z per layer. We replicate that behaviour against
 * the same `fire_layer_0.png` sprite sheet already used for block fire.
 *
 * One shared material + one dynamic `BufferGeometry`. No per-entity material,
 * no per-frame allocation at steady state. The per-frame emit() path reuses
 * the same typed arrays and only updates draw range.
 */

const TILE_PX = 16;                    // fire tile is 16x16 in the 256-wide atlas
const ATLAS_WIDTH = 256;               // terrain.png width (texels)
const TILE_U = TILE_PX / ATLAS_WIDTH;  // width of one tile in UV space

const MAX_QUADS = 192;
const MAX_VERTS = MAX_QUADS * 4;
const MAX_INDICES = MAX_QUADS * 6;

export class EntityFireOverlayRenderer {
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly uvs: Float32Array;
  private readonly indices: Uint16Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly uvAttr: THREE.BufferAttribute;

  private quadCount = 0;

  public constructor(fireAnimationSystem: FireAnimationSystem) {
    this.positions = new Float32Array(MAX_VERTS * 3);
    this.uvs = new Float32Array(MAX_VERTS * 2);
    this.indices = new Uint16Array(MAX_INDICES);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uMap: { value: fireAnimationSystem.fireTexture },
        uFrame: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aUv;
        varying vec2 vUv;
        void main() {
          vUv = aUv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform sampler2D uMap;
        uniform float uFrame;
        varying vec2 vUv;
        void main() {
          // fire_layer_0.png is a vertical strip of 32 16x16 frames. Each frame
          // occupies TILE_U horizontally (16/256) and (1/32) vertically. Offset V
          // by the current frame so the UV window moves down the strip.
          float frameH = 1.0 / 32.0;
          float v = fract(vUv.y) * frameH + uFrame * frameH;
          vec4 c = texture2D(uMap, vec2(vUv.x, v));
          if (c.a < 0.1) discard;
          gl_FragColor = vec4(c.rgb, c.a);
        }
      `,
    });

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.uvAttr = new THREE.BufferAttribute(this.uvs, 2);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('aUv', this.uvAttr);
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    // Draw after entity opaques but before translucent water/weather.
    this.mesh.renderOrder = 15;
  }

  public get object3D(): THREE.Object3D {
    return this.mesh;
  }

  /** Begin a new frame; clears all previously emitted quads. */
  public beginFrame(): void {
    this.quadCount = 0;
  }

  /** Set the current fire animation frame for this frame. */
  public setFrame(frame: number): void {
    (this.material.uniforms as { uFrame: { value: number } }).uFrame.value = frame;
  }

  /** Emit fire quads around one burning entity. Call per burning entity. */
  public emit(entity: Entity, camera: THREE.Camera): void {
    if (!entity.isBurning()) return;
    if (entity.removed) return;

    const w = entity.width * 1.4;
    const half = w * 0.5;
    const height = Math.max(entity.height + 0.4, 0.6);
    // How many 1.4-unit-tall fire tiles do we need? Beta uses a loop that counts
    // down `height / 1.4` tiles, so match that step.
    const tileStep = 1.4;
    const tiles = Math.ceil(height / tileStep) + 1;

    // Camera yaw in XZ for billboard. We render two quads per layer, rotated 90
    // degrees to form an X-cross.
    const dx = camera.position.x - entity.position.x;
    const dz = camera.position.z - entity.position.z;
    const yaw = Math.atan2(dx, dz);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    let y = 0;
    let zOffset = -0.3;
    for (let layer = 0; layer < tiles; layer++) {
      const quadH = tileStep;
      const flipU = (layer % 2) === 1;
      const u0 = flipU ? TILE_U : 0;
      const u1 = flipU ? 0 : TILE_U;
      // Two crossed quads per layer.
      this.addQuad(entity.position.x, entity.position.y + y, entity.position.z, half, quadH, zOffset, u0, u1, 0, 1, cosY, sinY, 0);
      this.addQuad(entity.position.x, entity.position.y + y, entity.position.z, half, quadH, zOffset, u0, u1, 0, 1, cosY, sinY, Math.PI / 2);
      y += tileStep * 0.45; // Beta steps down y by ~0.45 each layer.
      zOffset += 0.02;
    }
  }

  private addQuad(
    cx: number, cy: number, cz: number,
    half: number, h: number, zOff: number,
    u0: number, u1: number, v0: number, v1: number,
    cosY: number, sinY: number,
    yRotAdd: number,
  ): void {
    if (this.quadCount >= MAX_QUADS) return;
    const c = Math.cos(yRotAdd);
    const s = Math.sin(yRotAdd);
    // Local corners: a -Z-facing quad centred in X and with its base at y=0.
    const local: Array<[number, number, number]> = [
      [-half, 0, -half + zOff],
      [ half, 0, -half + zOff],
      [ half, h, -half + zOff],
      [-half, h, -half + zOff],
    ];
    const w: Array<[number, number, number]> = [];
    for (const [lx, ly, lz] of local) {
      const rx = lx * c - lz * s;
      const rz = lx * s + lz * c;
      const wx = rx * sinY + rz * cosY + cx;
      const wy = ly + cy;
      const wz = -rx * cosY + rz * sinY + cz;
      w.push([wx, wy, wz]);
    }
    const w0 = w[0]!;
    const w1 = w[1]!;
    const w2 = w[2]!;
    const w3 = w[3]!;
    const vi = this.quadCount * 4;
    const ii = this.quadCount * 6;
    this.putVert(vi + 0, w0, u0, v1);
    this.putVert(vi + 1, w1, u1, v1);
    this.putVert(vi + 2, w2, u1, v0);
    this.putVert(vi + 3, w3, u0, v0);
    this.indices[ii + 0] = vi + 0;
    this.indices[ii + 1] = vi + 1;
    this.indices[ii + 2] = vi + 2;
    this.indices[ii + 3] = vi + 0;
    this.indices[ii + 4] = vi + 2;
    this.indices[ii + 5] = vi + 3;
    this.quadCount += 1;
  }

  private putVert(i: number, p: [number, number, number], u: number, v: number): void {
    this.positions[i * 3 + 0] = p[0];
    this.positions[i * 3 + 1] = p[1];
    this.positions[i * 3 + 2] = p[2];
    this.uvs[i * 2 + 0] = u;
    this.uvs[i * 2 + 1] = v;
  }

  /** Flush the built geometry to the GPU for this frame. */
  public endFrame(): void {
    this.posAttr.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
    const idx = this.geometry.getIndex() as THREE.BufferAttribute;
    idx.needsUpdate = true;
    this.geometry.setDrawRange(0, this.quadCount * 6);
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
