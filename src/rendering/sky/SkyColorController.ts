/**
 * Beta 1.7.3 sky/fog/celestial colour calculations, ported verbatim from
 * mc-dev decompiled sources (World.java `func_4079_a` / `getFogColor` /
 * `calcSunriseSunsetColors` / `getStarBrightness`, and WorldProviderSurface's
 * `calcSunriseSunsetColors` / `getFogColor`).
 *
 * Pure data in, pure data out: no Three.js, no scene graph, no state
 * beyond a single reusable colour scratch buffer. SkyRenderer /
 * CelestialRenderer / FogController all consume the returned SkyColorState.
 *
 * Biome sky-tint hook:
 *   The default `biomeSample` is a Plains-equivalent (temperature 0.8,
 *   humidity 0.4). This matches how Beta's Plains biome tints the sky in
 *   Overworld. When per-biome sky colouring is wired up later, only the
 *   caller (Engine) needs to change — the interface here already accepts
 *   temperature / humidity, so no rewrite of this file is required.
 *
 * Everything below is deliberately allocation-free once constructed;
 * `compute()` returns a fresh plain object but reuses the sunrise
 * scratch array so a null result is still garbage-collectable.
 */

import type { WorldTime } from '../../world/WorldTime';

/** Beta's WorldProviderSurface base fog colour (0.7529412, 0.8470588, 1.0). */
const FOG_BASE_R = 0.7529412;
const FOG_BASE_G = 0.8470588;
const FOG_BASE_B = 1.0;

/** Sunrise/sunset band from calcSunriseSunsetColors (Beta constant 0.4). */
const SUNRISE_BAND = 0.4;

/** Beta's base sky colour hex 0x74A5FF used when biome/temperature not overridden. */
const DEFAULT_SKY_HEX = 0x74a5ff;

/**
 * Plains-equivalent biome sample. Temperature 0.8, humidity 0.4 approximates
 * the Beta Plains biome and produces the classic "temperate" blue sky.
 */
export const PLAINS_BIOME_SAMPLE = { temperature: 0.8, humidity: 0.4 } as const;

export interface BiomeSample {
  readonly temperature: number;
  readonly humidity: number;
}

export interface SunriseSunsetColors {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/**
 * One frame's colour state. All colour channels are linear [0..1].
 * `*Hex` fields are packed sRGB 0xRRGGBB for convenience of callers that
 * need to hand a Three.js Color/Fog a hex value directly.
 */
export interface SkyColorState {
  /** Beta celestial angle in [0, 1), 0 = noon (sun overhead). */
  readonly celestialAngle: number;
  /** Human-readable phase label, mirrors Beta's rough day/night bands. */
  readonly skyPhase: string;
  /** Beta getStarBrightness result, [0, 0.5]. */
  readonly starOpacity: number;
  /** cos(celestialAngle * 2π), used by CelestialRenderer for altitude tests. */
  readonly sunAltitude: number;
  /** Beta calculateSkylightSubtracted, integer [0, 11]. */
  readonly skylightSubtracted: number;
  /** Beta sun-brightness factor, [0, 1]. */
  readonly sunBrightnessFactor: number;

  /** Base sky colour before any zenith/horizon split (Beta getSkyColor). */
  readonly skyR: number;
  readonly skyG: number;
  readonly skyB: number;

  /** Beta fog colour (getFogColor / WorldProviderSurface.getFogColor). */
  readonly fogR: number;
  readonly fogG: number;
  readonly fogB: number;

  /** Zenith / horizon / bottom colours for the sky sphere, derived from sky + fog. */
  readonly zenithR: number;
  readonly zenithG: number;
  readonly zenithB: number;
  readonly horizonR: number;
  readonly horizonG: number;
  readonly horizonB: number;
  readonly bottomR: number;
  readonly bottomG: number;
  readonly bottomB: number;

  readonly skyColorHex: number;
  readonly horizonColorHex: number;
  readonly fogColorHex: number;

  /**
   * When the sun is within the sunrise/sunset band, this is non-null and
   * describes the disc / horizon tint colour + strength. Null otherwise.
   */
  readonly sunriseSunset: SunriseSunsetColors | null;
}

/** Reused float array for calcSunriseSunsetColors output (Beta returns float[4]). */
const sunriseScratch: [number, number, number, number] = [0, 0, 0, 0];

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function packHex(r: number, g: number, b: number): number {
  const R = Math.round(clamp01(r) * 255) & 0xff;
  const G = Math.round(clamp01(g) * 255) & 0xff;
  const B = Math.round(clamp01(b) * 255) & 0xff;
  return (R << 16) | (G << 8) | B;
}

/**
 * Beta's phase-label ranges (approximate — used only for the F3 overlay).
 * Beta itself doesn't expose named phases; this is a purely cosmetic label.
 */
function computePhase(ticks: number): string {
  if (ticks >= 23000 || ticks < 500) return 'pre-dawn';
  if (ticks < 1500) return 'sunrise';
  if (ticks < 5000) return 'morning';
  if (ticks < 10000) return 'midday';
  if (ticks < 12000) return 'afternoon';
  if (ticks < 13000) return 'sunset';
  if (ticks < 14000) return 'dusk';
  if (ticks < 22000) return 'night';
  return 'night';
}

/**
 * Beta WorldProviderSurface.calcSunriseSunsetColors, ported verbatim.
 * Returns the shared sunriseScratch reused each call (or null if outside band).
 * Consumer must consume before the next compute() call — SkyColorController
 * copies these into a stable object before returning.
 */
function calcSunriseSunset(celestialAngle: number): [number, number, number, number] | null {
  const f = SUNRISE_BAND;
  const cosA = Math.cos(celestialAngle * Math.PI * 2) - 0;
  const centre = 0;

  if (cosA < centre - f || cosA > centre + f) {
    return null;
  }

  const f3 = ((cosA - centre) / f) * 0.5 + 0.5;
  let f4 = 1 - (1 - Math.sin(f3 * Math.PI)) * 0.99;
  f4 *= f4;

  sunriseScratch[0] = f3 * 0.3 + 0.7;
  sunriseScratch[1] = f3 * f3 * 0.7 + 0.2;
  sunriseScratch[2] = f3 * f3 * 0 + 0.2;
  sunriseScratch[3] = f4;
  return sunriseScratch;
}

/**
 * Beta WorldProviderSurface.getFogColor, ported verbatim. No re-mixing
 * with sky colour — Beta's fog colour is standalone.
 */
function computeFogColor(celestialAngle: number): { r: number; g: number; b: number } {
  let f = Math.cos(celestialAngle * Math.PI * 2) * 2 + 0.5;
  f = clamp01(f);
  const r = FOG_BASE_R * (f * 0.94 + 0.06);
  const g = FOG_BASE_G * (f * 0.94 + 0.06);
  const b = FOG_BASE_B * (f * 0.91 + 0.09);
  return { r, g, b };
}

/**
 * Beta BiomeGenBase.getSkyColorByTemp:
 *   float f = temperature / 3.0F;
 *   f = clamp(f, -1, 1);
 *   return Color.getHSBColor(0.6222222F - f * 0.05F, 0.5F + f * 0.1F, 1.0F);
 *
 * Ported to sRGB via HSV->RGB. Beta calls Java's Color.getHSBColor which is
 * HSV (not HSL). Output is a stable per-biome constant.
 */
function biomeSkyBaseColor(temperature: number): { r: number; g: number; b: number } {
  let f = temperature / 3;
  if (f < -1) f = -1;
  if (f > 1) f = 1;
  const h = 0.6222222 - f * 0.05;
  const s = 0.5 + f * 0.1;
  const v = 1;
  return hsvToRgb(h, s, v);
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 1) + 1) % 1;
  const i = Math.floor(hh * 6);
  const f = hh * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0: return { r: v, g: t, b: p };
    case 1: return { r: q, g: v, b: p };
    case 2: return { r: p, g: v, b: t };
    case 3: return { r: p, g: q, b: v };
    case 4: return { r: t, g: p, b: v };
    default: return { r: v, g: p, b: q };
  }
}

/**
 * Beta World.func_4079_a: biome sky colour multiplied by the celestial
 * day factor. Rain and thunder branches are omitted (weather is out of scope).
 */
function computeSkyColor(
  celestialAngle: number,
  biome: BiomeSample,
): { r: number; g: number; b: number } {
  let f = Math.cos(celestialAngle * Math.PI * 2) * 2 + 0.5;
  f = clamp01(f);
  const base = biomeSkyBaseColor(biome.temperature);
  return {
    r: base.r * f,
    g: base.g * f,
    b: base.b * f,
  };
}

/**
 * Beta getStarBrightness, ported verbatim. Returns f*f*0.5.
 */
function computeStarBrightness(celestialAngle: number): number {
  let f = 1 - (Math.cos(celestialAngle * Math.PI * 2) * 2 + 0.75);
  f = clamp01(f);
  return f * f * 0.5;
}

/**
 * Beta calculateSkylightSubtracted (no rain/thunder branches). In real Beta,
 * the source performs `f2 = 1 - f2` twice — those two flips cancel when no
 * weather is applied. The simplified equivalent is:
 *   f2 = 1 - (cos(a*2π)*2 + 0.5);  f2 = clamp(f2, 0, 1);  return floor(f2*11)
 * Max is 11 (Beta caps at `(int)(1.0F * 11F)`).
 */
function computeSkylightSubtracted(celestialAngle: number): number {
  let f = 1 - (Math.cos(celestialAngle * Math.PI * 2) * 2 + 0.5);
  f = clamp01(f);
  return Math.floor(f * 11);
}

/**
 * Sun-brightness factor. Beta's own is `v * 0.8 + 0.2` (0.2 minimum);
 * Stage 16 removes that floor (see WorldTime.getSunBrightnessFactor doc)
 * so a fully enclosed cave at midnight can reach true darkness. Kept in
 * this file so the debug HUD reads the same value the rest of the sky
 * subsystem does.
 */
function computeSunBrightnessFactor(celestialAngle: number): number {
  let f = 1 - (Math.cos(celestialAngle * Math.PI * 2) * 2 + 0.2);
  f = clamp01(f);
  return 1 - f;
}

/**
 * Beta cloud base colour (World.field_1019_F). Overworld constant 0xFFFFFF;
 * exposed here so a future dimension port would only need to change this.
 */
const CLOUD_BASE_R = 1;
const CLOUD_BASE_G = 1;
const CLOUD_BASE_B = 1;

/**
 * Weather knobs consumed by Beta's cloud (and sky/fog) colour math. Both
 * are the [0, 1] "strength" values Beta stores per world tick. Stage 17
 * has no weather system yet, so callers always pass 0 for both — the
 * cloud renderer nonetheless routes them through here so a future rain /
 * thunder implementation only needs to fill in a weather source and the
 * clouds will darken and desaturate automatically, no cloud-side changes.
 */
export interface WeatherStrength {
  readonly rainStrength: number;
  readonly thunderStrength: number;
}
export const NO_WEATHER: WeatherStrength = { rainStrength: 0, thunderStrength: 0 };

export interface CloudColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly hex: number;
}

/**
 * Beta World.func_628_d (cloud colour), ported verbatim from mc-dev:
 *
 *   f2 = clamp(cos(a*2π)*2 + 0.5, 0, 1)
 *   base = (field_1019_F >> 16..0) / 255 = (1, 1, 1) for Overworld
 *   if rain > 0:
 *     grey = (r*0.3 + g*0.59 + b*0.11) * 0.6
 *     mix  = 1 - rain*0.95
 *     r,g,b = r*mix + grey*(1-mix)   // desaturate toward gray
 *   r *= f2*0.9  + 0.1
 *   g *= f2*0.9  + 0.1
 *   b *= f2*0.85 + 0.15               // slight blue lift at night
 *   if thunder > 0:
 *     grey = (r*0.3 + g*0.59 + b*0.11) * 0.2
 *     mix  = 1 - thunder*0.95
 *     r,g,b = r*mix + grey*(1-mix)   // further desaturate
 *
 * At noon (a=0): factor 1.0 → cloud = (1.0, 1.0, 1.0) pure white.
 * At midnight (a=0.5): factor 0.0 → cloud = (0.10, 0.10, 0.15) —
 * the requested dark blue-grey.
 */
export class SkyColorController {
  /**
   * Optional per-frame biome sample override. When null (default),
   * PLAINS_BIOME_SAMPLE is used. Setter is for future per-camera-column
   * biome sampling — Engine can call it once per frame if desired.
   */
  private activeBiome: BiomeSample = PLAINS_BIOME_SAMPLE;

  public setBiome(biome: BiomeSample): void {
    this.activeBiome = biome;
  }

  public compute(worldTime: WorldTime): SkyColorState {
    const celestialAngle = worldTime.getCelestialAngle();
    const timeTicks = worldTime.getTimeOfDayTicks();

    const sky = computeSkyColor(celestialAngle, this.activeBiome);
    const fog = computeFogColor(celestialAngle);
    // Sunrise/sunset factor for the current celestial angle. Consumed
    // twice below: to tint the sky-sphere horizon band AND to emit the
    // discrete SunriseSunsetColors used by CelestialRenderer's disc.
    const sunriseRaw = calcSunriseSunset(celestialAngle);

    // Zenith is a slightly-deeper-blue variant of sky (shift toward blue,
    // darken slightly). This is a small deterministic derivation from
    // Beta's sky colour — NOT a hand-authored palette — so biome tint
    // still propagates upward.
    const zenithR = sky.r * 0.85;
    const zenithG = sky.g * 0.85;
    const zenithB = Math.min(1, sky.b * 1.05);

    // Base horizon = Beta's raw fog colour. During dawn / dusk we mix a
    // fraction of the sunrise/sunset tint into the horizon so the sky
    // sphere's horizon band and the terrain-fog colour BOTH carry the
    // warm dawn/dusk hue. Stage 17B: this mix was previously done
    // locally inside SkyRenderer's applyColorState AFTER packing
    // horizonColorHex — meaning the sky-sphere horizon showed sunrise
    // orange while the fog behind terrain stayed cool. Doing it here
    // and packing the tinted values keeps a SINGLE canonical horizon
    // colour that both consumers read.
    //
    // The sunrise mix strength (35%) matches Stage 16D's original
    // choice — the sunrise disc in CelestialRenderer carries the
    // strong visible colour; the sky-sphere horizon is subtly warmed.
    let horizonR = fog.r;
    let horizonG = fog.g;
    let horizonB = fog.b;
    if (sunriseRaw !== null) {
      const strength = sunriseRaw[3] * 0.35;
      horizonR = horizonR * (1 - strength) + sunriseRaw[0] * strength;
      horizonG = horizonG * (1 - strength) + sunriseRaw[1] * strength;
      horizonB = horizonB * (1 - strength) + sunriseRaw[2] * strength;
    }

    // Bottom (below horizon) is a slightly dimmed horizon; Beta's void plane
    // uses `f * 0.2 + 0.04` per channel — same principle here.
    const bottomR = fog.r * 0.2 + 0.04;
    const bottomG = fog.g * 0.2 + 0.04;
    const bottomB = fog.b * 0.6 + 0.1;

    const sunriseSunset: SunriseSunsetColors | null =
      sunriseRaw === null
        ? null
        : { r: sunriseRaw[0], g: sunriseRaw[1], b: sunriseRaw[2], a: sunriseRaw[3] };

    return {
      celestialAngle,
      skyPhase: computePhase(timeTicks),
      starOpacity: computeStarBrightness(celestialAngle),
      sunAltitude: Math.cos(celestialAngle * Math.PI * 2),
      skylightSubtracted: computeSkylightSubtracted(celestialAngle),
      sunBrightnessFactor: computeSunBrightnessFactor(celestialAngle),

      skyR: sky.r,
      skyG: sky.g,
      skyB: sky.b,

      fogR: fog.r,
      fogG: fog.g,
      fogB: fog.b,

      zenithR,
      zenithG,
      zenithB,
      horizonR,
      horizonG,
      horizonB,
      bottomR,
      bottomG,
      bottomB,

      skyColorHex: packHex(sky.r, sky.g, sky.b),
      horizonColorHex: packHex(horizonR, horizonG, horizonB),
      fogColorHex: packHex(fog.r, fog.g, fog.b),

      sunriseSunset,
    };
  }

  /**
   * Beta World.func_628_d — cloud colour for the current celestial
   * angle and (future) weather state. This is the SINGLE central cloud
   * colour source; CloudRenderer only reads from here. Weather is
   * optional; NO_WEATHER (Stage 17 default) is bit-for-bit Beta in a
   * calm world.
   */
  public getCloudColor(
    worldTime: WorldTime,
    weather: WeatherStrength = NO_WEATHER,
  ): CloudColor {
    const celestialAngle = worldTime.getCelestialAngle();
    let factor = Math.cos(celestialAngle * Math.PI * 2) * 2 + 0.5;
    factor = clamp01(factor);

    let r = CLOUD_BASE_R;
    let g = CLOUD_BASE_G;
    let b = CLOUD_BASE_B;

    // Rain desaturation branch (Beta: if f6 > 0F).
    if (weather.rainStrength > 0) {
      const grey = (r * 0.3 + g * 0.59 + b * 0.11) * 0.6;
      const mix = 1 - weather.rainStrength * 0.95;
      r = r * mix + grey * (1 - mix);
      g = g * mix + grey * (1 - mix);
      b = b * mix + grey * (1 - mix);
    }

    // Day/night factor. Beta scales R/G by 0.9*f+0.1 and B by 0.85*f+0.15
    // — the slight blue lift is what makes night clouds read as blue-grey.
    r *= factor * 0.9 + 0.1;
    g *= factor * 0.9 + 0.1;
    b *= factor * 0.85 + 0.15;

    // Thunder further-desaturates. Beta: if f8 > 0F.
    if (weather.thunderStrength > 0) {
      const grey = (r * 0.3 + g * 0.59 + b * 0.11) * 0.2;
      const mix = 1 - weather.thunderStrength * 0.95;
      r = r * mix + grey * (1 - mix);
      g = g * mix + grey * (1 - mix);
      b = b * mix + grey * (1 - mix);
    }

    return { r, g, b, hex: packHex(r, g, b) };
  }
}

export const DEFAULT_SKY_COLOR_HEX = DEFAULT_SKY_HEX;
