import { BlockIds } from '../blocks/BlockId';
import type { LightEngine } from '../world/generation/lighting/LightEngine';
import { CHUNK_SIZE_X } from '../world/chunkConstants';
import { CHUNK_LOAD_RADIUS } from '../world/ChunkStreamer';

/**
 * Fog integration.
 *
 * Stage 17B refactor
 * ------------------
 * Overworld fog is now `THREE.FogExp2` (exponential density) instead of
 * `THREE.Fog` (linear near/far). Beta 1.7.3 itself uses GL_EXP, and the
 * exponential curve reaches near-full opacity earlier while never quite
 * touching 1.0 — matching the "gradual blending through the middle
 * distance, strong concealment at the far horizon" the brief requires.
 *
 * Density is derived from the desired far-fog distance (which itself
 * derives from the current LOAD_RADIUS) so any future change to chunk
 * load radius automatically re-tunes the fog:
 *
 *   fogFar        = (LOAD_RADIUS − BUFFER) × CHUNK_SIZE_X   (per axis)
 *   fogDensity    = FOG_DENSITY_FACTOR / fogFar
 *
 * The factor is calibrated so at `fogFar` blocks the fog opacity is
 * about 1 − exp(-(density × dist)²) ≈ 0.86, and at 1.5 × fogFar it's
 * ≈ 0.99 — chunk edges past that point are visually gone.
 *
 * Water and lava fog remain LINEAR (`THREE.Fog`) with their existing
 * short-range near/far, per the Stage 17B brief: those overrides
 * intentionally form a hard, coloured band right at the eye and would
 * behave badly as exponential density.
 *
 * All fog is applied in view space (per-fragment), so it has no
 * dependency on camera rotation.
 */

export type FogMode = 'overworld' | 'water' | 'lava' | 'debug-bypass';

/** Which of the two THREE.Fog variants a state uses. */
export type FogKind = 'exp2' | 'linear' | 'none';

export interface FogState {
  readonly mode: FogMode;
  readonly kind: FogKind;
  readonly enabled: boolean;
  readonly colorHex: number;
  /**
   * Meaningful only when `kind === 'linear'`. Retained on the state so
   * water/lava fog can still drive `THREE.Fog(color, near, far)`.
   */
  readonly near: number;
  readonly far: number;
  /**
   * Meaningful only when `kind === 'exp2'`. Sets THREE.FogExp2 density.
   * Derived from the render distance so it scales automatically.
   */
  readonly density: number;
}

/**
 * Legacy stable colour retained for the initial scene background before
 * SkyColorController has produced its first frame's colour. Once running,
 * the real fog colour comes from Beta's per-frame getFogColor.
 */
export const OVERWORLD_FOG_COLOR = 0x70a0ff;
const WATER_FOG_COLOR = 0x203a80;
const LAVA_FOG_COLOR = 0x9a2f00;

/**
 * Stage 17B: buffer widened to 2.0 chunks. With LOAD_RADIUS = 6:
 *   fogFar = (6 − 2) × 16 = 64 blocks
 * — leaving a 32-block hidden band on axes between fully-fogged
 * distance and the axial chunk boundary at 96 blocks.
 */
export const VISIBLE_DISTANCE_CHUNK_BUFFER = 2.0;

/**
 * Density calibration for FogExp2. THREE.FogExp2 opacity at distance d
 * is `1 - exp(-(density * d)²)`. Setting density = FACTOR / fogFar
 * makes the opacity at d = fogFar equal to `1 - exp(-FACTOR²)`:
 *
 *   FACTOR = 2.0  → opacity(fogFar)      ≈ 0.982
 *                    opacity(fogFar × 0.5) ≈ 0.632
 *
 * That's the "gradual middle, near-total far" profile the brief asks
 * for. Chunks past `fogFar` are almost completely hidden; nearby
 * terrain remains readable.
 */
export const CLEAR_WEATHER_FOG_DISTANCE_SCALE = 1.125;
const FOG_DENSITY_FACTOR = 2.0;

/** Water/lava (linear) fog band retained from Stage 17. Never migrated to exp2. */
const WATER_FOG_NEAR = 0;
const WATER_FOG_FAR = 18;
const LAVA_FOG_NEAR = 0;
const LAVA_FOG_FAR = 4;

/**
 * Compute the overworld fog far distance from the current chunk load
 * radius. Public helper so tests can assert render-distance scaling
 * without duplicating the formula.
 */
export function overworldFogFarDistance(): number {
  const baseDistance = Math.max(CHUNK_SIZE_X, (CHUNK_LOAD_RADIUS - VISIBLE_DISTANCE_CHUNK_BUFFER) * CHUNK_SIZE_X);
  return baseDistance * CLEAR_WEATHER_FOG_DISTANCE_SCALE;
}

/** Compute the exp2 density from the current fog far distance. */
export function overworldFogDensity(): number {
  return FOG_DENSITY_FACTOR / overworldFogFarDistance();
}

export interface FogControllerInputs {
  readonly eyeX: number;
  readonly eyeY: number;
  readonly eyeZ: number;
  readonly rawLightDebugMode: boolean;
  readonly ambientOcclusionDebugMode: boolean;
  /**
   * Overworld fog colour for the current frame, packed 0xRRGGBB.
   *
   * Stage 17: Engine now passes SkyColorState.horizonColorHex — the sky
   * sphere's horizon-band colour, which is Beta getFogColor mixed with
   * the sunrise/sunset tint at ~35% strength when present. This is
   * marginally warmer than raw getFogColor during dawn/dusk and
   * identical the rest of the day, so distant terrain fades into the
   * exact colour of the horizon behind it — no seam between the fog
   * band and the sky.
   */
  readonly overworldColorHex: number;
  /**
   * Stage 18: multiplier applied to the base overworld fog density.
   * Default 1.0 (clear weather). Rain/thunder push this up to ~1.35
   * / ~1.5 so storms tighten the horizon. Default value preserves
   * pre-Stage-18 behaviour when the caller omits the field.
   */
  readonly overworldDensityMultiplier?: number;
}

/**
 * Computes the desired fog state from the current eye position and debug
 * state. It does not touch Three.js directly; Renderer consumes the
 * resulting FogState.
 */
export class FogController {
  private readonly lightEngine: LightEngine;

  public constructor(lightEngine: LightEngine) {
    this.lightEngine = lightEngine;
  }

  public compute(inputs: FogControllerInputs): FogState {
    const eyeBlockX = Math.floor(inputs.eyeX);
    const eyeBlockY = Math.floor(inputs.eyeY);
    const eyeBlockZ = Math.floor(inputs.eyeZ);
    const eyeBlockId = this.lightEngine.getBlock(eyeBlockX, eyeBlockY, eyeBlockZ);

    if (eyeBlockId === BlockIds.LavaFlowing || eyeBlockId === BlockIds.LavaStill) {
      return {
        mode: 'lava',
        kind: 'linear',
        enabled: true,
        colorHex: LAVA_FOG_COLOR,
        near: LAVA_FOG_NEAR,
        far: LAVA_FOG_FAR,
        density: 0,
      };
    }

    if (eyeBlockId === BlockIds.WaterFlowing || eyeBlockId === BlockIds.WaterStill) {
      return {
        mode: 'water',
        kind: 'linear',
        enabled: true,
        colorHex: WATER_FOG_COLOR,
        near: WATER_FOG_NEAR,
        far: WATER_FOG_FAR,
        density: 0,
      };
    }

    if (inputs.rawLightDebugMode || inputs.ambientOcclusionDebugMode) {
      return {
        mode: 'debug-bypass',
        kind: 'none',
        enabled: false,
        colorHex: inputs.overworldColorHex,
        near: 0,
        far: 0,
        density: 0,
      };
    }

    // Overworld = exponential-density fog. Both `far` and `density` are
    // reported so the F3 overlay can print a useful "range" value even
    // though `THREE.FogExp2` itself only reads `density`.
    // Stage 18: weather may scale density via `overworldDensityMultiplier`.
    const far = overworldFogFarDistance();
    const densityMult = inputs.overworldDensityMultiplier ?? 1;
    const density = overworldFogDensity() * densityMult;
    return {
      mode: 'overworld',
      kind: 'exp2',
      enabled: true,
      colorHex: inputs.overworldColorHex,
      near: 0,
      far,
      density,
    };
  }
}
