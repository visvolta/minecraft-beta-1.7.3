import * as THREE from 'three';
import { PortalAxis } from '../../world/portal/PortalAxis';

/**
 * Beta 1.7.3 portal particles (`BlockPortal.randomDisplayTick` +
 * `EntityPortalFX`).
 *
 * Beta spawns 4 "portal" particles per random display tick per portal block.
 * Position is randomised inside the block, and the component ACROSS the portal
 * plane is pinned to 0.5 +/- 0.25 with an outward velocity, so particles drift
 * out of both faces rather than filling the cube.
 *
 * Implementation notes:
 *  - ONE `THREE.InstancedMesh`-style batch: a single quad geometry with
 *    per-instance attributes. No Object3D per particle.
 *  - The four supplied `generic_*.png` frames are combined into one texture
 *    ATLAS so every frame is actually reachable from a single draw call. A
 *    `THREE.PointsMaterial` can only bind ONE map, so the previous Points
 *    implementation silently rendered `generic_0` for every particle and the
 *    other three assets were never displayed at all.
 *  - Quads are billboarded in the VERTEX SHADER against the camera's right/up
 *    basis, so they always face the viewer. `THREE.Points` gl_PointSize
 *    sprites are screen-aligned squares whose on-screen size does not track
 *    perspective the same way and which cannot be depth-offset off the portal
 *    plane; that caused the z-fighting against the portal surface.
 *  - Sprites are square (the assets are square), so the native aspect ratio is
 *    preserved exactly — no stretching.
 *  - Particles are distance-culled at spawn and expire on their own, so none
 *    survive a portal being broken or its chunk unloading.
 */

/** Supplied Beta particle frames, in portal purple with 1-bit alpha. */
export const PORTAL_PARTICLE_TEXTURES: readonly string[] = [
  '/textures/particle/generic_0.png',
  '/textures/particle/generic_3.png',
  '/textures/particle/generic_4.png',
  '/textures/particle/generic_6.png',
];

/** Beta spawns 4 particles per portal block per random display tick. */
export const PORTAL_PARTICLES_PER_TICK = 4;

/** Beyond this distance portals stop emitting, to bound the particle budget. */
export const PORTAL_PARTICLE_MAX_DISTANCE = 32;

/** Native pixel size of each supplied frame; they are square. */
export const PORTAL_PARTICLE_TEXTURE_SIZE = 8;

/**
 * World-space edge length of a portal particle quad.
 *
 * Square, matching the square source frames, so the sprite is never stretched.
 */
export const PORTAL_PARTICLE_QUAD_SIZE = 0.16;

/**
 * Pushed toward the camera along the view vector so a particle sitting exactly
 * on the portal plane cannot z-fight it. Small enough not to read as an offset.
 */
const DEPTH_BIAS = 0.02;

/** Hard cap on simultaneously live portal particles. */
const MAX_PARTICLES = 2048;

/** Beta portal particles live roughly 1-2 seconds. */
const MIN_LIFETIME_SECONDS = 1;
const MAX_LIFETIME_SECONDS = 2;

export class PortalParticleSystem {
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly atlasTexture: THREE.Texture;

  private readonly offsets = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  /** Per-instance atlas column, so all four supplied frames are used. */
  private readonly frames = new Float32Array(MAX_PARTICLES);
  private readonly alphas = new Float32Array(MAX_PARTICLES);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private active = 0;

  public constructor(scene: THREE.Scene) {
    this.atlasTexture = buildParticleAtlas(PORTAL_PARTICLE_TEXTURES);

    // Unit quad, billboarded in the vertex shader.
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.geometry.setAttribute('uv', quad.getAttribute('uv'));
    quad.dispose();

    this.geometry.setAttribute('instanceOffset', new THREE.InstancedBufferAttribute(this.offsets, 3));
    this.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(this.colors, 3));
    this.geometry.setAttribute('instanceFrame', new THREE.InstancedBufferAttribute(this.frames, 1));
    this.geometry.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(this.alphas, 1));
    this.geometry.instanceCount = 0;

    const frameCount = PORTAL_PARTICLE_TEXTURES.length;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: this.atlasTexture },
        uFrameCount: { value: frameCount },
        uQuadSize: { value: PORTAL_PARTICLE_QUAD_SIZE },
        uDepthBias: { value: DEPTH_BIAS },
      },
      vertexShader: `
        attribute vec3 instanceOffset;
        attribute vec3 instanceColor;
        attribute float instanceFrame;
        attribute float instanceAlpha;
        uniform float uFrameCount;
        uniform float uQuadSize;
        uniform float uDepthBias;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          // Select this instance's column of the horizontal atlas. Each frame
          // is square and occupies exactly 1/uFrameCount of the width, so the
          // sprite keeps its native 1:1 aspect.
          float frame = clamp(floor(instanceFrame + 0.5), 0.0, uFrameCount - 1.0);
          vUv = vec2((uv.x + frame) / uFrameCount, uv.y);
          vColor = instanceColor;
          vAlpha = instanceAlpha;

          // Billboard: build the quad in VIEW space so it always faces the
          // camera regardless of camera roll or particle position.
          vec4 viewCenter = modelViewMatrix * vec4(instanceOffset, 1.0);
          viewCenter.xyz += vec3(position.xy * uQuadSize, uDepthBias);
          gl_Position = projectionMatrix * viewCenter;
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 texel = texture2D(uAtlas, vUv);
          // The supplied frames are 1-bit alpha; discard fully preserves their
          // hard-edged transparency instead of blending a halo.
          if (texel.a < 0.5) discard;
          gl_FragColor = vec4(texel.rgb * vColor, vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 24;
    scene.add(this.mesh);
  }

  /**
   * Emits one tick's worth of particles for a portal block.
   *
   * @param axis Canonical portal axis, so emission matches the visible plane.
   */
  public emit(
    x: number,
    y: number,
    z: number,
    axis: PortalAxis,
    cameraX: number,
    cameraY: number,
    cameraZ: number,
  ): void {
    const dx = x + 0.5 - cameraX;
    const dy = y + 0.5 - cameraY;
    const dz = z + 0.5 - cameraZ;
    if (dx * dx + dy * dy + dz * dz > PORTAL_PARTICLE_MAX_DISTANCE * PORTAL_PARTICLE_MAX_DISTANCE) return;

    for (let i = 0; i < PORTAL_PARTICLES_PER_TICK && this.active < MAX_PARTICLES; i++) {
      const index = this.active;
      const base = index * 3;

      let px = x + Math.random();
      const py = y + Math.random();
      let pz = z + Math.random();
      let vx = (Math.random() - 0.5) * 0.5;
      const vy = (Math.random() - 0.5) * 0.5;
      let vz = (Math.random() - 0.5) * 0.5;

      // Beta pins the across-plane axis to 0.5 +/- 0.25 and gives it an
      // outward velocity, so particles stream from both faces of the plane.
      const side = Math.random() < 0.5 ? -1 : 1;
      if (axis === PortalAxis.X) {
        pz = z + 0.5 + 0.25 * side;
        vz = Math.random() * 2 * side;
      } else {
        px = x + 0.5 + 0.25 * side;
        vx = Math.random() * 2 * side;
      }

      this.offsets[base] = px;
      this.offsets[base + 1] = py;
      this.offsets[base + 2] = pz;
      this.velocities[base] = vx;
      this.velocities[base + 1] = vy;
      this.velocities[base + 2] = vz;

      // Portal purple, matching the supplied assets (166, 18, 222) with a
      // little per-particle variation like Beta's tinting.
      const shade = 0.7 + Math.random() * 0.3;
      this.colors[base] = (166 / 255) * shade;
      this.colors[base + 1] = (18 / 255) * shade;
      this.colors[base + 2] = (222 / 255) * shade;

      // Pick one of the four supplied frames at random, like Beta's particle
      // atlas index. Every frame is reachable because they share one atlas.
      this.frames[index] = Math.floor(Math.random() * PORTAL_PARTICLE_TEXTURES.length);
      this.alphas[index] = 1;

      const lifetime = MIN_LIFETIME_SECONDS + Math.random() * (MAX_LIFETIME_SECONDS - MIN_LIFETIME_SECONDS);
      this.life[index] = lifetime;
      this.maxLife[index] = lifetime;
      this.active += 1;
    }
  }

  public update(deltaSeconds: number): void {
    let i = 0;
    while (i < this.active) {
      const base = i * 3;
      this.life[i] = this.life[i]! - deltaSeconds;

      if (this.life[i]! <= 0) {
        // Swap-remove with the last active particle (no allocation).
        const last = this.active - 1;
        if (i !== last) {
          const lastBase = last * 3;
          for (let c = 0; c < 3; c++) {
            this.offsets[base + c] = this.offsets[lastBase + c]!;
            this.velocities[base + c] = this.velocities[lastBase + c]!;
            this.colors[base + c] = this.colors[lastBase + c]!;
          }
          this.frames[i] = this.frames[last]!;
          this.alphas[i] = this.alphas[last]!;
          this.life[i] = this.life[last]!;
          this.maxLife[i] = this.maxLife[last]!;
        }
        this.active -= 1;
        continue;
      }

      // Beta portal particles drift and slow rather than falling.
      const drag = 1 - 0.9 * deltaSeconds;
      this.velocities[base] = this.velocities[base]! * drag;
      this.velocities[base + 1] = this.velocities[base + 1]! * drag;
      this.velocities[base + 2] = this.velocities[base + 2]! * drag;
      this.offsets[base] = this.offsets[base]! + this.velocities[base]! * deltaSeconds;
      this.offsets[base + 1] = this.offsets[base + 1]! + this.velocities[base + 1]! * deltaSeconds;
      this.offsets[base + 2] = this.offsets[base + 2]! + this.velocities[base + 2]! * deltaSeconds;
      // Fade out over the final third of the lifetime so particles dissolve
      // rather than popping.
      const remaining = this.life[i]! / this.maxLife[i]!;
      this.alphas[i] = remaining > 0.33 ? 1 : Math.max(0, remaining / 0.33);
      i += 1;
    }

    this.geometry.instanceCount = this.active;
    (this.geometry.getAttribute('instanceOffset') as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('instanceFrame') as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('instanceAlpha') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  /** Drops every live particle, e.g. when switching dimension. */
  public clear(): void {
    this.active = 0;
    this.geometry.instanceCount = 0;
  }

  public getActiveCount(): number {
    return this.active;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.atlasTexture.dispose();
    this.mesh.removeFromParent();
  }
}

/**
 * Combines the supplied square frames into one horizontal atlas.
 *
 * A single texture means a single draw call AND — unlike a `PointsMaterial`,
 * which binds exactly one map — it makes every supplied frame reachable. Each
 * frame keeps its own square cell, so sampling `(uv.x + frame) / frameCount`
 * reproduces the original 1:1 pixels with no stretching.
 *
 * Images load asynchronously; each one is blitted into its cell on arrival and
 * the atlas is flagged for re-upload.
 */
function buildParticleAtlas(paths: readonly string[]): THREE.Texture {
  const size = PORTAL_PARTICLE_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size * paths.length;
  canvas.height = size;
  const context = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  // Beta pixel-art filtering; NEVER interpolate these 8x8 frames.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  if (context !== null) {
    context.imageSmoothingEnabled = false;
    paths.forEach((path, index) => {
      const image = new Image();
      image.onload = (): void => {
        // Draw at the frame's native size: no scaling, alpha preserved.
        context.clearRect(index * size, 0, size, size);
        context.drawImage(image, index * size, 0, size, size);
        texture.needsUpdate = true;
      };
      image.src = path;
    });
  }

  return texture;
}
