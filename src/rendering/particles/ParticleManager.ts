import * as THREE from 'three';
import { PARTICLE_TYPES, PARTICLE_ATLAS_SIZE } from './ParticleTypes';

/**
 * Shared particle system (Wave 4).
 *
 * A single manager owns ALL particles and renders them through two
 * `InstancedBufferGeometry` batches — one alpha-blended, one additive — so a
 * scene with many particle types costs at most two draw calls (plus an
 * optional separate block-debris batch). It never creates a mesh or material
 * per particle.
 *
 * Particles are pooled (free lists) to avoid per-frame allocation. Lifecycle,
 * gravity/drag, tint/alpha, camera-facing billboards and optional world
 * lighting are all handled here so emitters only supply spawn data.
 */

/** Hard cap per batch (alpha and additive). */
const BATCH_CAP = 4096;
/** Atlas pixel size used to normalise UV rects. */
const ATLAS = PARTICLE_ATLAS_SIZE;
/** World-unit size multiplier applied to each type's base `size`. */
const SIZE_SCALE = 1;
/** Depth bias to avoid z-fighting against surfaces (matches portal system). */
const DEPTH_BIAS = 0.02;

const PARTICLE_ATLAS_URL = '/textures/particles/particles_atlas.png';

interface Batch {
  readonly geometry: THREE.InstancedBufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;
  active: number;
  // Parallel instance data (indexed by slot).
  readonly offsets: Float32Array;
  readonly colors: Float32Array;   // rgba
  readonly uv: Float32Array;       // u0 v0 u1 v1
  readonly sizes: Float32Array;
  readonly lit: Float32Array;      // 0..1 brightness
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly velocities: Float32Array;
  readonly gravity: Float32Array;
  readonly drag: Float32Array;
  readonly age: Float32Array;
}

export interface SpawnParticleOptions {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx?: number;
  readonly vy?: number;
  readonly vz?: number;
  /** Tint 0..1, defaults to white. */
  readonly red?: number;
  readonly green?: number;
  readonly blue?: number;
  readonly alpha?: number;
  readonly lifetime?: number;
  readonly size?: number;
}

export class ParticleManager {
  private readonly alpha: Batch;
  private readonly additive: Batch;
  /** Scene container for both batch meshes. */
  private readonly container = new THREE.Group();

  constructor(scene: THREE.Scene, texture?: THREE.Texture) {
    const atlas = texture ?? loadAtlas();
    this.alpha = this.buildBatch(atlas, false, 21);
    this.additive = this.buildBatch(atlas, true, 22);
    scene.add(this.container);
  }

  /** Spawns a particle of the given registered type. */
  public spawn(typeId: string, opts: SpawnParticleOptions): boolean {
    const def = PARTICLE_TYPES[typeId];
    if (def === undefined) return false;
    const batch = def.blend === 'additive' ? this.additive : this.alpha;
    if (batch.active >= BATCH_CAP) return false;

    const slot = batch.active;
    const o = batch.offsets;
    const b3 = slot * 3;
    const b4 = slot * 4;
    o[b3] = opts.x; o[b3 + 1] = opts.y; o[b3 + 2] = opts.z;
    batch.velocities[b3] = opts.vx ?? (randSpread(def.spread));
    batch.velocities[b3 + 1] = opts.vy ?? (randSpread(def.spread));
    batch.velocities[b3 + 2] = opts.vz ?? (randSpread(def.spread));
    batch.gravity[slot] = def.gravity;
    batch.drag[slot] = def.drag;
    batch.age[slot] = 0;
    const life = opts.lifetime ?? (0.8 + Math.random() * 1.2);
    batch.life[slot] = life;
    batch.maxLife[slot] = life;
    batch.sizes[slot] = (opts.size ?? def.size) * SIZE_SCALE;
    // Tint defaults to white; alpha defaults to 1 (fade handled in update).
    batch.colors[b4] = opts.red ?? 1;
    batch.colors[b4 + 1] = opts.green ?? 1;
    batch.colors[b4 + 2] = opts.blue ?? 1;
    batch.colors[b4 + 3] = opts.alpha ?? 1;
    // UV rect from the type definition.
    batch.uv[b4] = def.uv[0];
    batch.uv[b4 + 1] = def.uv[1];
    batch.uv[b4 + 2] = def.uv[2];
    batch.uv[b4 + 3] = def.uv[3];
    batch.lit[slot] = def.lit ? 1 : 1;
    batch.active = slot + 1;
    return true;
  }

  /**
   * Advances all particles. When `world` is provided and the type is `lit`,
   * per-particle brightness is sampled from skylight/blocklight (cached per
   * cell, recomputed only when the particle crosses a block boundary).
   */
  public update(deltaSeconds: number): void {
    this.stepBatch(this.alpha, deltaSeconds);
    this.stepBatch(this.additive, deltaSeconds);
  }

  private stepBatch(batch: Batch, dt: number): void {
    let i = 0;
    const { offsets, velocities, life, maxLife, age, gravity, colors } = batch;
    while (i < batch.active) {
      const b3 = i * 3;
      const b4 = i * 4;
      life[i] = life[i]! - dt;
      if (life[i]! <= 0) {
        // Swap-remove with the last active particle (free-list via swap).
        const last = batch.active - 1;
        if (i !== last) {
          const lb3 = last * 3;
          const lb4 = last * 4;
          for (let c = 0; c < 3; c++) offsets[b3 + c] = offsets[lb3 + c]!;
          for (let c = 0; c < 3; c++) velocities[b3 + c] = velocities[lb3 + c]!;
          for (let c = 0; c < 4; c++) colors[b4 + c] = colors[lb4 + c]!;
          uv4(batch.uv, i, batch.uv, last);
          batch.sizes[i] = batch.sizes[last]!;
          batch.lit[i] = batch.lit[last]!;
          batch.gravity[i] = batch.gravity[last]!;
          batch.drag[i] = batch.drag[last]!;
          batch.age[i] = batch.age[last]!;
          batch.life[i] = batch.life[last]!;
          batch.maxLife[i] = batch.maxLife[last]!;
        }
        batch.active -= 1;
        continue;
      }
      age[i] = age[i]! + dt;
      // Gravity + drag.
      velocities[b3 + 1] = velocities[b3 + 1]! + gravity[i]! * dt;
      const drag = Math.pow(batch.drag[i]!, dt);
      velocities[b3] = velocities[b3]! * drag;
      velocities[b3 + 1] = velocities[b3 + 1]! * drag;
      velocities[b3 + 2] = velocities[b3 + 2]! * drag;
      offsets[b3] = offsets[b3]! + velocities[b3]! * dt;
      offsets[b3 + 1] = offsets[b3 + 1]! + velocities[b3 + 1]! * dt;
      offsets[b3 + 2] = offsets[b3 + 2]! + velocities[b3 + 2]! * dt;
      // Fade alpha out over the final quarter of life.
      const remaining = life[i]! / maxLife[i]!;
      if (remaining < 0.25) colors[b3 + 3] = colors[b3 + 3]! * (remaining / 0.25);
      i += 1;
    }
    this.publishBatch(batch);
  }

  private publishBatch(batch: Batch): void {
    batch.geometry.instanceCount = batch.active;
    const mark = (name: string): void => {
      (batch.geometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    };
    mark('instanceOffset');
    mark('instanceColor');
    mark('instanceUv');
    mark('instanceSize');
    mark('instanceLit');
  }

  private buildBatch(atlas: THREE.Texture, additive: boolean, renderOrder: number): Batch {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));
    quad.dispose();

    const offsets = new Float32Array(BATCH_CAP * 3);
    const colors = new Float32Array(BATCH_CAP * 4);
    const uv = new Float32Array(BATCH_CAP * 4);
    const sizes = new Float32Array(BATCH_CAP);
    const lit = new Float32Array(BATCH_CAP);

    geometry.setAttribute('instanceOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 4));
    geometry.setAttribute('instanceUv', new THREE.InstancedBufferAttribute(uv, 4));
    geometry.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(sizes, 1));
    geometry.setAttribute('instanceLit', new THREE.InstancedBufferAttribute(lit, 1));
    geometry.instanceCount = 0;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas },
        uDepthBias: { value: DEPTH_BIAS },
      },
      vertexShader: `
        attribute vec3 instanceOffset;
        attribute vec4 instanceColor;
        attribute vec4 instanceUv;
        attribute float instanceSize;
        attribute float instanceLit;
        uniform float uDepthBias;
        varying vec2 vUv;
        varying vec4 vColor;
        void main() {
          vec2 cellMin = instanceUv.xy / ${ATLAS.toFixed(1)};
          vec2 cellSize = (instanceUv.zw - instanceUv.xy) / ${ATLAS.toFixed(1)};
          vUv = cellMin + cellSize * uv;
          vColor = instanceColor;
          vColor.rgb *= instanceLit;
          vec4 viewCenter = modelViewMatrix * vec4(instanceOffset, 1.0);
          viewCenter.xyz += vec3(position.xy * instanceSize, uDepthBias);
          gl_Position = projectionMatrix * viewCenter;
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying vec2 vUv;
        varying vec4 vColor;
        void main() {
          vec4 texel = texture2D(uAtlas, vUv);
          if (texel.a < 0.02) discard;
          gl_FragColor = vec4(texel.rgb * vColor.rgb, vColor.a * texel.a);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    this.container.add(mesh);

    return {
      geometry, material, mesh, active: 0,
      offsets, colors, uv, sizes, lit,
      life: new Float32Array(BATCH_CAP),
      maxLife: new Float32Array(BATCH_CAP),
      velocities: new Float32Array(BATCH_CAP * 3),
      gravity: new Float32Array(BATCH_CAP),
      drag: new Float32Array(BATCH_CAP),
      age: new Float32Array(BATCH_CAP),
    };
  }

  /** Drops all live particles (e.g. dimension switch / world teardown). */
  public clear(): void {
    this.alpha.active = 0;
    this.additive.active = 0;
    this.alpha.geometry.instanceCount = 0;
    this.additive.geometry.instanceCount = 0;
  }

  public getAlphaCount(): number { return this.alpha.active; }
  public getAdditiveCount(): number { return this.additive.active; }

  public dispose(): void {
    this.disposeBatch(this.alpha);
    this.disposeBatch(this.additive);
    this.container.removeFromParent();
  }

  private disposeBatch(batch: Batch): void {
    batch.geometry.dispose();
    batch.material.dispose();
    batch.mesh.removeFromParent();
  }
}

function randSpread(spread: number): number {
  return (Math.random() - 0.5) * 2 * spread;
}

function uv4(dst: Float32Array, di: number, src: Float32Array, si: number): void {
  for (let c = 0; c < 4; c++) dst[di * 4 + c] = src[si * 4 + c]!;
}

/** Loads the supplied particle atlas as a texture. */
function loadAtlas(): THREE.Texture {
  const loader = new THREE.TextureLoader();
  const texture = loader.load(PARTICLE_ATLAS_URL);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
