import * as THREE from 'three';

/**
 * A lightweight, render-agnostic description of where particles should spawn.
 * `LivingEntity` builds one of these from itself, so the sink stays decoupled
 * from the entity class and from rendering internals.
 */
export interface ParticleOrigin {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Decoupled hook for hurt/death particle effects (Beta `worldObj.spawnParticle`
 * calls). `LivingEntity` fires these once at the correct moment; it has no
 * knowledge of how (or whether) particles are rendered.
 *
 * Kept deliberately tiny — this is not a particle framework. Implementations:
 * {@link NullParticleSink} (default/headless), {@link CountingParticleSink}
 * (validation), and {@link SimpleEntityParticleSink} (optional minimal visuals).
 */
export interface EntityParticleSink {
  hurt(origin: ParticleOrigin): void;
  death(origin: ParticleOrigin): void;
  /** Optional per-frame advance; only visual sinks need it. */
  update?(deltaSeconds: number): void;
  /** Optional teardown. */
  dispose?(): void;
}

/** No-op sink; safe default for headless contexts. */
export class NullParticleSink implements EntityParticleSink {
  public hurt(_origin: ParticleOrigin): void {
    // nothing
  }
  public death(_origin: ParticleOrigin): void {
    // nothing
  }
}

/**
 * Headless sink that counts firings — used by validators to assert particles
 * fire exactly once at the right moment without any rendering.
 */
export class CountingParticleSink implements EntityParticleSink {
  public hurtCount = 0;
  public deathCount = 0;
  public hurt(_origin: ParticleOrigin): void {
    this.hurtCount += 1;
  }
  public death(_origin: ParticleOrigin): void {
    this.deathCount += 1;
  }
  public reset(): void {
    this.hurtCount = 0;
    this.deathCount = 0;
  }
}

const MAX_PARTICLES = 128;
const GRAVITY = 6.0; // blocks/s² (visual only)

/**
 * Minimal Minecraft-appropriate particle visuals: a single fixed-pool
 * `THREE.Points` (no per-frame allocation, no material churn). Hurt = a few red
 * specks; death = a small white "poof". Self-contained and small by design.
 */
export class SimpleEntityParticleSink implements EntityParticleSink {
  private readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private active = 0;

  public constructor(scene: THREE.Scene) {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  public hurt(origin: ParticleOrigin): void {
    this.burst(origin, 6, 0.9, 0.15, 0.15);
  }

  public death(origin: ParticleOrigin): void {
    this.burst(origin, 14, 0.85, 0.85, 0.85);
  }

  private burst(origin: ParticleOrigin, count: number, r: number, g: number, b: number): void {
    const cx = origin.x;
    const cy = origin.y + origin.height * 0.5;
    const cz = origin.z;
    for (let i = 0; i < count && this.active < MAX_PARTICLES; i++) {
      const idx = this.active;
      this.positions[idx * 3 + 0] = cx + (Math.random() - 0.5) * origin.width;
      this.positions[idx * 3 + 1] = cy + (Math.random() - 0.5) * origin.height;
      this.positions[idx * 3 + 2] = cz + (Math.random() - 0.5) * origin.width;
      this.velocities[idx * 3 + 0] = (Math.random() - 0.5) * 1.5;
      this.velocities[idx * 3 + 1] = Math.random() * 2.0;
      this.velocities[idx * 3 + 2] = (Math.random() - 0.5) * 1.5;
      this.colors[idx * 3 + 0] = r;
      this.colors[idx * 3 + 1] = g;
      this.colors[idx * 3 + 2] = b;
      this.life[idx] = 0.4 + Math.random() * 0.3;
      this.active += 1;
    }
  }

  public update(deltaSeconds: number): void {
    let i = 0;
    while (i < this.active) {
      const base = i * 3;
      this.life[i] = this.life[i]! - deltaSeconds;
      if (this.life[i]! <= 0) {
        // Swap-remove with the last active particle.
        const last = this.active - 1;
        if (i !== last) {
          const lastBase = last * 3;
          for (let c = 0; c < 3; c++) {
            this.positions[base + c] = this.positions[lastBase + c]!;
            this.colors[base + c] = this.colors[lastBase + c]!;
            this.velocities[base + c] = this.velocities[lastBase + c]!;
          }
          this.life[i] = this.life[last]!;
        }
        this.active -= 1;
        continue;
      }
      this.velocities[base + 1] = this.velocities[base + 1]! - GRAVITY * deltaSeconds;
      this.positions[base + 0] = this.positions[base + 0]! + this.velocities[base + 0]! * deltaSeconds;
      this.positions[base + 1] = this.positions[base + 1]! + this.velocities[base + 1]! * deltaSeconds;
      this.positions[base + 2] = this.positions[base + 2]! + this.velocities[base + 2]! * deltaSeconds;
      i += 1;
    }
    this.geometry.setDrawRange(0, this.active);
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
