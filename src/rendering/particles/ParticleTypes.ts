/**
 * Particle type registry for the shared particle system (Wave 4).
 *
 * The supplied particle atlas (`public/textures/particles/particles_atlas.png`)
 * is a custom 128×128 packed sheet whose sprites are NOT on a uniform grid.
 * Each particle type therefore carries an explicit UV rectangle (in atlas
 * pixel space) plus per-type behaviour. All UVs are normalised in the
 * renderer by dividing by the atlas dimensions.
 *
 * NOTE: The sprite→type mapping below is a best-effort interpretation of the
 * packed sheet derived from the sprite bounding boxes present in the image.
 * It is data-driven so it can be corrected in one place once the sheet is
 * confirmed visually. The roster itself is the classic Beta 1.7.3 particle set
 * plus the project's gameplay extensions.
 */

export type ParticleBlend = 'alpha' | 'additive';

export interface ParticleTypeDef {
  readonly id: string;
  /** Which render batch this particle belongs to (alpha or additive). */
  readonly blend: ParticleBlend;
  /** UV rectangle in atlas pixel coordinates: [u0, v0, u1, v1]. */
  readonly uv: readonly [number, number, number, number];
  /** Optional animation frames (each an atlas-pixel UV rect). */
  readonly frames?: readonly (readonly [number, number, number, number])[];
  /** Gravity (blocks/s²), applied while `gravity` is enabled. */
  readonly gravity: number;
  /** Exponential drag per second (1 = no drag). */
  readonly drag: number;
  /** Whether the particle should be affected by world light. */
  readonly lit: boolean;
  /** Base quad size in world units. */
  readonly size: number;
  /** Initial random velocity spread. */
  readonly spread: number;
}

/** Atlas pixel dimensions. */
export const PARTICLE_ATLAS_SIZE = 128;

/**
 * Best-effort UV cells derived from the sprite bounding boxes in the packed
 * sheet. Pixel coords → [u0, v0, u1, v1].
 */
const UV = {
  bubble: [49, 0, 63, 7] as const,
  smoke: [8, 32, 14, 38] as const,
  largeSmoke: [16, 32, 22, 38] as const,
  splash: [24, 32, 30, 38] as const,
  explosion: [32, 14, 63, 47] as const,
  flame: [33, 73, 63, 87] as const,
  flame2: [33, 81, 63, 87] as const,
  portal: [33, 73, 39, 79] as const,
  note: [41, 73, 47, 79] as const,
  heart: [18, 74, 26, 78] as const,
  reddust: [26, 74, 30, 78] as const,
  snow: [18, 82, 26, 86] as const,
  slime: [26, 82, 30, 86] as const,
  rain: [26, 90, 30, 94] as const,
  crit: [34, 90, 38, 94] as const,
  lava: [24, 64, 29, 70] as const,
  suspended: [11, 91, 13, 93] as const,
  pickup: [8, 122, 12, 126] as const,
} as const;

function def(def: Omit<ParticleTypeDef, 'gravity' | 'drag' | 'lit' | 'size' | 'spread'> & Partial<Pick<ParticleTypeDef, 'gravity' | 'drag' | 'lit' | 'size' | 'spread'>>): ParticleTypeDef {
  return {
    gravity: 0,
    drag: 1,
    lit: true,
    size: 0.5,
    spread: 0,
    ...def,
  } as ParticleTypeDef;
}

/**
 * The registered particle types. `ParticleManager` reads this registry; new
 * types are added here rather than scattered across emitters.
 */
export const PARTICLE_TYPES: Readonly<Record<string, ParticleTypeDef>> = {
  smoke: def({ id: 'smoke', blend: 'alpha', uv: UV.smoke, gravity: -0.4, drag: 0.85, size: 0.5 }),
  large_smoke: def({ id: 'large_smoke', blend: 'alpha', uv: UV.largeSmoke, gravity: 0, drag: 0.9, size: 0.6 }),
  explode: def({ id: 'explode', blend: 'additive', uv: UV.explosion, gravity: 0, drag: 0.8, size: 0.9 }),
  bubble: def({ id: 'bubble', blend: 'alpha', uv: UV.bubble, gravity: 0, drag: 1, size: 0.35 }),
  splash: def({ id: 'splash', blend: 'alpha', uv: UV.splash, gravity: -0.8, drag: 0.9, size: 0.4 }),
  suspended: def({ id: 'suspended', blend: 'alpha', uv: UV.suspended, gravity: 0, drag: 1, lit: false, size: 0.3 }),
  portal: def({ id: 'portal', blend: 'additive', uv: UV.portal, gravity: 0, drag: 1, size: 0.4, spread: 0.2 }),
  flame: def({ id: 'flame', blend: 'alpha', uv: UV.flame, gravity: -0.5, drag: 0.9, size: 0.45 }),
  lava: def({ id: 'lava', blend: 'alpha', uv: UV.lava, gravity: 0, drag: 1, size: 0.4 }),
  reddust: def({ id: 'reddust', blend: 'additive', uv: UV.reddust, gravity: -0.6, drag: 0.8, lit: false, size: 0.4 }),
  note: def({ id: 'note', blend: 'additive', uv: UV.note, gravity: -0.2, drag: 1, lit: false, size: 0.5 }),
  heart: def({ id: 'heart', blend: 'alpha', uv: UV.heart, gravity: -0.1, drag: 1, lit: false, size: 0.5 }),
  snow: def({ id: 'snow', blend: 'alpha', uv: UV.snow, gravity: -0.4, drag: 0.9, size: 0.4 }),
  slime: def({ id: 'slime', blend: 'alpha', uv: UV.slime, gravity: -0.5, drag: 1, size: 0.4 }),
  rain: def({ id: 'rain', blend: 'alpha', uv: UV.rain, gravity: -1.5, drag: 0.9, size: 0.25 }),
  crit: def({ id: 'crit', blend: 'additive', uv: UV.crit, gravity: -0.6, drag: 1, lit: false, size: 0.4 }),
  pickup: def({ id: 'pickup', blend: 'alpha', uv: UV.pickup, gravity: -0.8, drag: 1, size: 0.5 }),
};

export type ParticleTypeId = keyof typeof PARTICLE_TYPES;
