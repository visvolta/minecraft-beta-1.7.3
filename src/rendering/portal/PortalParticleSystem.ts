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
 *  - One pooled `THREE.Points` object for every particle, matching the
 *    existing entity particle sink. No Object3D per particle.
 *  - The supplied 8x8 `generic_*.png` frames are used directly, picked at
 *    random per particle like Beta's particle atlas indices.
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
const PORTAL_PARTICLE_MAX_DISTANCE = 32;

/** Hard cap on simultaneously live portal particles. */
const MAX_PARTICLES = 2048;

/** Beta portal particles live roughly 1-2 seconds. */
const MIN_LIFETIME_SECONDS = 1;
const MAX_LIFETIME_SECONDS = 2;

export class PortalParticleSystem {
  private readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly textures: THREE.Texture[] = [];

  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private active = 0;

  public constructor(scene: THREE.Scene) {
    const loader = new THREE.TextureLoader();
    for (const path of PORTAL_PARTICLE_TEXTURES) {
      const texture = loader.load(path, (loaded) => this.configure(loaded));
      this.configure(texture);
      this.textures.push(texture);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);

    // A single shared material keeps this to one draw call. The supplied PNGs
    // are 1-bit alpha, so alphaTest preserves their hard-edged transparency.
    this.material = new THREE.PointsMaterial({
      size: 0.16,
      map: this.textures[0] ?? null,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.5,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 24;
    scene.add(this.points);
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

      this.positions[base] = px;
      this.positions[base + 1] = py;
      this.positions[base + 2] = pz;
      this.velocities[base] = vx;
      this.velocities[base + 1] = vy;
      this.velocities[base + 2] = vz;

      // Portal purple, matching the supplied assets (166, 18, 222) with a
      // little per-particle variation like Beta's tinting.
      const shade = 0.7 + Math.random() * 0.3;
      this.colors[base] = (166 / 255) * shade;
      this.colors[base + 1] = (18 / 255) * shade;
      this.colors[base + 2] = (222 / 255) * shade;

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
            this.positions[base + c] = this.positions[lastBase + c]!;
            this.velocities[base + c] = this.velocities[lastBase + c]!;
            this.colors[base + c] = this.colors[lastBase + c]!;
          }
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
      this.positions[base] = this.positions[base]! + this.velocities[base]! * deltaSeconds;
      this.positions[base + 1] = this.positions[base + 1]! + this.velocities[base + 1]! * deltaSeconds;
      this.positions[base + 2] = this.positions[base + 2]! + this.velocities[base + 2]! * deltaSeconds;
      i += 1;
    }

    this.geometry.setDrawRange(0, this.active);
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Drops every live particle, e.g. when switching dimension. */
  public clear(): void {
    this.active = 0;
    this.geometry.setDrawRange(0, 0);
  }

  public getActiveCount(): number {
    return this.active;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.points.removeFromParent();
  }

  private configure(texture: THREE.Texture): void {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }
}
