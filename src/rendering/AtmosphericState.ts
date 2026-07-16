/**
 * Shared atmospheric state consumed by every visual subsystem that
 * needs to react to weather (sky, horizon, fog, clouds, celestials,
 * precipitation).
 *
 * ONE central computation runs per frame in Engine.tick(): the sky
 * controller produces a base SkyColorState (already Beta-accurate for
 * time-of-day + biome sky/fog/horizon), the WeatherState provides
 * current rain/thunder strengths, and this module blends them into a
 * single immutable snapshot renderers all read from. No renderer
 * recomputes weather blending on its own.
 *
 * Weather blending curves (Beta-authentic, from mc-dev
 * `World.func_4079_a` / `func_628_d`):
 *
 *   rainStrength > 0:
 *     grey = luminance(r,g,b) * 0.6
 *     mix  = 1 - rainStrength * 0.75              (sky:  0.75)
 *          = 1 - rainStrength * 0.95              (cloud: 0.95)
 *     r,g,b = r*mix + grey*(1-mix)
 *
 *   thunderStrength > 0:  (further desaturation, harsher)
 *     grey = luminance * 0.2
 *     mix  = 1 - thunderStrength * 0.75           (sky:  0.75)
 *          = 1 - thunderStrength * 0.95           (cloud: 0.95)
 *
 * Beta uses 0.75 for sky/fog and 0.95 for clouds — clouds desaturate
 * more aggressively so a stormy sky reads correctly. Ported here.
 *
 * Multipliers exposed for consumers that don't need per-channel colour
 * (celestial fade, cloud fog strength):
 *
 *   fogMultiplier   : how much stronger fog gets in-storm (1.0 clear → ~1.4 thunder)
 *   cloudMultiplier : cloud color scale relative to clear-weather value
 *   celestialFade   : opacity multiplier for stars, sun, moon (1.0 clear → ~0.2 thunder)
 */

import type { SkyColorState } from './sky/SkyColorController';
import type { WeatherState } from '../world/weather/WeatherState';

/**
 * Beta desaturation intensities. Stage 18B bumps the sky/horizon/fog
 * strengths from Beta's 0.75 up to 0.95 (same as clouds) so a Rain sky
 * reads as a medium slate-gray-blue instead of "the same blue only a
 * bit less saturated" — Beta's own numbers are visibly too weak on the
 * clear Stage-16 sky palette we use.
 */
const SKY_RAIN_MIX = 0.95;
const SKY_THUNDER_MIX = 0.95;
const CLOUD_RAIN_MIX = 0.95;
const CLOUD_THUNDER_MIX = 0.95;

/** Grey-target luminance scales. */
const GREY_LUM_RAIN = 0.6;
const GREY_LUM_THUNDER = 0.2;

/**
 * Storm fog density multipliers (Stage 18B q5 "aggressive").
 * Named per brief: `RAIN_FOG_DENSITY_MULTIPLIER` /
 * `THUNDER_FOG_DENSITY_MULTIPLIER`. Storm density = base_density ×
 * lerp(1.0, RAIN_MULT, rainStrength) then lerp toward THUNDER_MULT by
 * thunderStrength — thunder fully overrides rain at strength 1.
 *
 *   Full rain    → 2× base density → visibility ~1/√2 of clear
 *   Full thunder → 3× base density → visibility ~1/√3 of clear
 *
 * FogExp2 opacity at distance d is `1 - exp(-(ρ·d)²)`, so doubling ρ
 * doesn't halve the visible distance — it makes the same distance
 * ~86% opaque instead of ~63% (rain) or ~99% instead of ~86% (thunder).
 * Concretely with our default fog-far ≈ 64 blocks:
 *
 *   clear   ρ = 0.03125, opacity(64) ≈ 0.86
 *   rain    ρ = 0.0625,  opacity(64) ≈ 0.98
 *   thunder ρ = 0.0938,  opacity(64) ≈ 0.9998
 */
const FOG_MULT_CLEAR = 1.0;
export const RAIN_FOG_DENSITY_MULTIPLIER = 2.0;
export const THUNDER_FOG_DENSITY_MULTIPLIER = 3.0;

/** Cloud fog shader-strength presets (Stage 18 q4). */
export const CLOUD_FOG_CLEAR = 0.35;
export const CLOUD_FOG_RAIN = 0.45;
export const CLOUD_FOG_THUNDER = 0.6;

/**
 * Celestial fade during weather (Stage 18B q9). Brief targets:
 *   Full rain     → Sun/Moon opacity ~ 0.10 (visible but heavily muted)
 *   Full thunder  → Sun/Moon opacity ~ 0.00
 *   Full rain OR thunder → Stars opacity 0
 *
 * Fade formula: `1 - rain*RAIN - thunder*THUNDER`, clamped.
 * At rain=1 thunder=0: fade = 1 − 0.9 = 0.10 ✓
 * At rain=0 thunder=1: fade = 1 − 1.0 = 0.00 ✓
 */
const CELESTIAL_FADE_RAIN = 0.9;
const CELESTIAL_FADE_THUNDER = 1.0;
/** Sunrise disc fades faster than sun/moon so it never lingers in a storm. */
const SUNRISE_FADE_RAIN = 0.9;
const SUNRISE_FADE_THUNDER = 1.0;

/**
 * Weather-driven skylight-subtraction penalty (Stage 18B q2).
 *
 * Added to the base `WorldTime.getSkylightSubtracted()` value, clamped
 * to [0, 15]. Reproduces the brief's exact effective outdoor light
 * table at full weather strength:
 *
 *   Clear day    : base=0  penalty=0  effective=15
 *   Rain  day    : base=0  penalty=3  effective=12
 *   Thund day    : base=0  penalty=5  effective=10
 *   Clear night  : base=11 penalty=0  effective=4
 *   Rain  night  : base=11 penalty=3  effective=1
 *   Thund night  : base=11 penalty=4  effective=0
 *
 * Thunder penalty differs day vs night (5 vs 4) — the effective level
 * hits 0 at night exactly at strength 1, no clipping. We interpolate by
 * time-of-day day-factor `d = clamp(cos(a*2π)*2 + 0.5, 0, 1)`.
 */
export const RAIN_SKYLIGHT_PENALTY = 3;
export const THUNDER_SKYLIGHT_PENALTY_DAY = 5;
export const THUNDER_SKYLIGHT_PENALTY_NIGHT = 4;

/**
 * Wind vector — shared world-space slant for rain sheets, snow drift,
 * and future particles. Points in the direction rain/snow drift toward
 * (matches cloud drift: negative X in Stage 17 CloudRenderer).
 *
 * Magnitude is the horizontal fall-shift per unit of vertical extent
 * a rain sheet spans, so `RAIN_SLANT_X * cellHeight` is how far the
 * top of a rain quad shifts world-space X vs its bottom.
 */
export const WIND_X = -0.35;
export const WIND_Z = 0.0;

/**
 * Lightweight fade preview — computed BEFORE the sky-sphere pass so
 * the sky renderer can pass the correct celestial opacity into
 * `CelestialRenderer.update`. This avoids the need for a two-pass
 * arrangement where atmospheric state is built twice per frame.
 */
export function previewWeatherFade(rain: number, thunder: number): {
  celestialFade: number;
  sunriseFade: number;
} {
  const r = clamp01(rain);
  const t = clamp01(thunder);
  return {
    celestialFade: clamp01(1 - r * CELESTIAL_FADE_RAIN - t * CELESTIAL_FADE_THUNDER),
    sunriseFade: clamp01(1 - r * SUNRISE_FADE_RAIN - t * SUNRISE_FADE_THUNDER),
  };
}

export interface AtmosphericColors {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly hex: number;
}

/**
 * Immutable per-frame snapshot. Every renderer reads from ONE instance.
 * All colours in sRGB display space; `hex` is packed 0xRRGGBB.
 */
export interface AtmosphericState {
  /** Beta rain strength (raw, [0,1]). */
  readonly rainStrength: number;
  /** Beta rain × thunder product (renderable thunder strength, [0,1]). */
  readonly thunderStrength: number;

  /** Weather-blended sky colour (biome sky × time × rain × thunder). */
  readonly sky: AtmosphericColors;
  /** Weather-blended horizon (sky sphere horizon band + fog colour). */
  readonly horizon: AtmosphericColors;
  /** Weather-blended base fog colour (raw Beta getFogColor after blend). */
  readonly fog: AtmosphericColors;
  /** Weather-blended cloud base colour (bright white → grey in rain/thunder). */
  readonly cloud: AtmosphericColors;

  /** Overworld fog-density multiplier. 1.0 clear, up to THUNDER_FOG_DENSITY_MULTIPLIER. */
  readonly fogDensityMultiplier: number;
  /** Shader-side fog strength for clouds. */
  readonly cloudFogStrength: number;
  /** Opacity multiplier for Sun / Moon / Stars. 1.0 clear → 0.0 full thunder. */
  readonly celestialFade: number;
  /** Sunrise disc opacity multiplier — fades in storms. */
  readonly sunriseFade: number;

  /**
   * Weather-driven skylight-subtraction penalty in [0, 15]. ADDED to
   * WorldTime.getSkylightSubtracted() by Engine before passing to
   * ChunkRenderer. Reproduces the brief's exact effective-outdoor-light
   * table at full strength — see the RAIN_SKYLIGHT_PENALTY constant
   * doc for the derivation.
   */
  readonly weatherSkylightPenalty: number;

  /**
   * Wind vector (world-space, XZ plane). Consumed by PrecipitationRenderer
   * to slant rain sheets; a future particle system can read it for
   * blowing debris. Magnitude is the horizontal fall-shift per unit of
   * vertical extent (dimensionless — multiply by height to get a
   * world-space offset).
   */
  readonly wind: { readonly x: number; readonly z: number };

  /** Delegate through the underlying sky state for consumers that also need noon/star/skylight info. */
  readonly sky_state: SkyColorState;
  readonly weather_state: WeatherState;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function luminance(r: number, g: number, b: number): number {
  return r * 0.3 + g * 0.59 + b * 0.11;
}
function packHex(r: number, g: number, b: number): number {
  const R = Math.round(clamp01(r) * 255) & 0xff;
  const G = Math.round(clamp01(g) * 255) & 0xff;
  const B = Math.round(clamp01(b) * 255) & 0xff;
  return (R << 16) | (G << 8) | B;
}

/** Apply Beta's rain+thunder desaturation curve to one RGB triplet. */
function applyWeatherBlend(
  r: number, g: number, b: number,
  rain: number, thunder: number,
  rainStrengthMix: number, thunderStrengthMix: number,
): AtmosphericColors {
  let R = r;
  let G = g;
  let B = b;
  if (rain > 0) {
    const grey = luminance(R, G, B) * GREY_LUM_RAIN;
    const mix = 1 - rain * rainStrengthMix;
    R = R * mix + grey * (1 - mix);
    G = G * mix + grey * (1 - mix);
    B = B * mix + grey * (1 - mix);
  }
  if (thunder > 0) {
    const grey = luminance(R, G, B) * GREY_LUM_THUNDER;
    const mix = 1 - thunder * thunderStrengthMix;
    R = R * mix + grey * (1 - mix);
    G = G * mix + grey * (1 - mix);
    B = B * mix + grey * (1 - mix);
  }
  return { r: R, g: G, b: B, hex: packHex(R, G, B) };
}

/**
 * Build the shared atmospheric state for the current frame. Called
 * once per Engine.tick(); the returned object is passed to every
 * atmospheric renderer.
 */
export function buildAtmosphericState(
  skyState: SkyColorState,
  weather: WeatherState,
): AtmosphericState {
  const rain = clamp01(weather.getRainStrength(weather.partialTick));
  const thunder = clamp01(weather.getThunderStrength(weather.partialTick));

  const sky = applyWeatherBlend(
    skyState.skyR, skyState.skyG, skyState.skyB,
    rain, thunder,
    SKY_RAIN_MIX, SKY_THUNDER_MIX,
  );
  const horizon = applyWeatherBlend(
    skyState.horizonR, skyState.horizonG, skyState.horizonB,
    rain, thunder,
    SKY_RAIN_MIX, SKY_THUNDER_MIX,
  );
  const fog = applyWeatherBlend(
    skyState.fogR, skyState.fogG, skyState.fogB,
    rain, thunder,
    SKY_RAIN_MIX, SKY_THUNDER_MIX,
  );

  // Clouds: Beta base is bright white × day factor. The
  // SkyColorController.getCloudColor() already applied weather when we
  // called it, but here we recompute using our own knobs so ALL
  // atmospheric weather blending lives in ONE place.
  //
  // Base cloud (before weather) = white × day-factor from SkyColorState.
  // Reproduce the day-factor from Beta func_628_d without recomputing
  // the celestial angle: it's the same math the base fog got — the
  // ratio between sky.b and the biome sky base blue at that angle.
  // Simpler: reuse the sky's sun-brightness factor. When sunBrightness
  // = 1 (noon) cloud base = 1; at midnight = 0.1 approximately (Beta
  // constants R/G *= f*0.9+0.1, B *= f*0.85+0.15).
  const dayFactor = clamp01(skyState.sunBrightnessFactor);
  const cloudBaseR = dayFactor * 0.9 + 0.1;
  const cloudBaseG = dayFactor * 0.9 + 0.1;
  const cloudBaseB = dayFactor * 0.85 + 0.15;
  const cloud = applyWeatherBlend(
    cloudBaseR, cloudBaseG, cloudBaseB,
    rain, thunder,
    CLOUD_RAIN_MIX, CLOUD_THUNDER_MIX,
  );

  // Multipliers (Q4/Q7).
  const fogDensityMultiplier =
    FOG_MULT_CLEAR
    + (RAIN_FOG_DENSITY_MULTIPLIER - FOG_MULT_CLEAR) * rain
    + (THUNDER_FOG_DENSITY_MULTIPLIER - RAIN_FOG_DENSITY_MULTIPLIER) * thunder;
  const cloudFogStrength =
    CLOUD_FOG_CLEAR
    + (CLOUD_FOG_RAIN - CLOUD_FOG_CLEAR) * rain
    + (CLOUD_FOG_THUNDER - CLOUD_FOG_RAIN) * thunder;
  const celestialFade = clamp01(
    1 - rain * CELESTIAL_FADE_RAIN - thunder * CELESTIAL_FADE_THUNDER,
  );
  const sunriseFade = clamp01(
    1 - rain * SUNRISE_FADE_RAIN - thunder * SUNRISE_FADE_THUNDER,
  );

  // Weather skylight penalty (Stage 18B q2). Time-of-day interpolates
  // between the day- and night-thunder penalties. Beta day-factor
  // `d = clamp(cos(a*2π)*2 + 0.5, 0, 1)` is the "how much daylight is
  // present" scalar; the sky controller already stores its clamped
  // cousin as `sunBrightnessFactor`, which we reuse to avoid recomputing.
  const dayFactorForPenalty = clamp01(skyState.sunBrightnessFactor);
  const rainPenalty = rain * RAIN_SKYLIGHT_PENALTY;
  const thunderPenalty = thunder *
    (THUNDER_SKYLIGHT_PENALTY_DAY * dayFactorForPenalty
      + THUNDER_SKYLIGHT_PENALTY_NIGHT * (1 - dayFactorForPenalty));
  // The two penalties overlap conceptually (thunder implies rain), but
  // Beta's `func_27166_f` renders thunder strength as (thunder × rain)
  // — so `thunderStrength` here already reflects that gating. We take
  // the MAX rather than sum so a full storm at noon is capped at the
  // day-thunder value 5, matching the brief table exactly.
  const weatherSkylightPenalty = Math.min(15, Math.max(rainPenalty, thunderPenalty));

  return {
    rainStrength: rain,
    thunderStrength: thunder,
    sky, horizon, fog, cloud,
    fogDensityMultiplier,
    cloudFogStrength,
    celestialFade,
    sunriseFade,
    weatherSkylightPenalty,
    wind: { x: WIND_X, z: WIND_Z },
    sky_state: skyState,
    weather_state: weather,
  };
}
