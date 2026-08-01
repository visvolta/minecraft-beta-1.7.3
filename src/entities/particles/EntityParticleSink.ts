import type { ParticleManager } from '../../rendering/particles/ParticleManager';

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
 * Decoupled hook for terminal death particle effects (Beta `worldObj.spawnParticle`
 * calls). `LivingEntity` fires these once at the correct moment; it has no
 * knowledge of how (or whether) particles are rendered.
 *
 * Kept deliberately tiny — this is not a particle framework. Implementations:
 * {@link NullParticleSink} (default/headless), {@link CountingParticleSink}
 * (validation), and {@link SimpleEntityParticleSink} (optional minimal visuals).
 */
export interface EntityParticleSink {
  death(origin: ParticleOrigin): void;
  /** Optional sustained smoke trail (Beta `spawnParticle("smoke")`). */
  smoke?(origin: ParticleOrigin): void;
  /** Optional explosion burst (Beta `hugeexplosion`). */
  explosion?(origin: ParticleOrigin): void;
  /** Optional per-frame advance; only visual sinks need it. */
  update?(deltaSeconds: number): void;
  /** Optional teardown. */
  dispose?(): void;
}

/** No-op sink; safe default for headless contexts. */
export class NullParticleSink implements EntityParticleSink {
  public death(_origin: ParticleOrigin): void {
    // nothing
  }
}

/**
 * Headless sink that counts firings — used by validators to assert particles
 * fire exactly once at the right moment without any rendering.
 */
export class CountingParticleSink implements EntityParticleSink {
  public deathCount = 0;
  public death(_origin: ParticleOrigin): void {
    this.deathCount += 1;
  }
  public reset(): void {
    this.deathCount = 0;
  }
}

/**
 * Visual particle sink backed by the shared {@link ParticleManager} (Wave 4).
 *
 * Death = a small grey smoke puff, fireball trails = dark smoke, explosions =
 * an additive burst plus rising smoke. All rendering is delegated to the
 * manager's two batched draw calls (alpha + additive); this class only maps
 * the render-agnostic `EntityParticleSink` callbacks onto spawn data.
 */
export class SimpleEntityParticleSink implements EntityParticleSink {
  private readonly manager: ParticleManager;

  public constructor(_scene: unknown, manager: ParticleManager) {
    this.manager = manager;
  }

  public death(origin: ParticleOrigin): void {
    this.burstSmoke(origin, 20, 0.85, 0.85, 0.85);
  }

  /** Dark smoke puff for a fireball trail (a few pooled particles). */
  public smoke(origin: ParticleOrigin): void {
    this.burstSmoke(origin, 2, 0.2, 0.2, 0.2);
  }

  /** Orange/white explosion burst through the shared batched manager. */
  public explosion(origin: ParticleOrigin): void {
    const cx = origin.x;
    const cy = origin.y + origin.height * 0.5;
    const cz = origin.z;
    for (let i = 0; i < 24; i++) {
      this.manager.spawn('explode', {
        x: cx, y: cy, z: cz,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 2,
        vz: (Math.random() - 0.5) * 3,
        red: 1, green: 0.75, blue: 0.35,
        lifetime: 0.5 + Math.random() * 0.5,
        size: 0.7 + Math.random() * 0.6,
      });
    }
    this.burstSmoke(origin, 10, 0.35, 0.3, 0.28);
  }

  private burstSmoke(origin: ParticleOrigin, count: number, r: number, g: number, b: number): void {
    const cx = origin.x;
    const cy = origin.y + origin.height * 0.5;
    const cz = origin.z;
    for (let i = 0; i < count; i++) {
      this.manager.spawn('smoke', {
        x: cx + (Math.random() - 0.5) * origin.width,
        y: cy + (Math.random() - 0.5) * origin.height,
        z: cz + (Math.random() - 0.5) * origin.width,
        vx: (Math.random() - 0.5) * 1.5,
        vy: Math.random() * 2.0,
        vz: (Math.random() - 0.5) * 1.5,
        red: r, green: g, blue: b,
        lifetime: 0.4 + Math.random() * 0.3,
      });
    }
  }

  public update(deltaSeconds: number): void {
    // The engine also calls particleManager.update(); this is a no-op here so
    // the shared manager is advanced exactly once per frame.
    void deltaSeconds;
  }

  public dispose(): void {
    // The ParticleManager owns the batches and is disposed by the engine.
  }
}
