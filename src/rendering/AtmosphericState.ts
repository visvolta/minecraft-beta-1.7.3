import type { SkyColorState } from './sky/SkyColorController';
import type { WeatherState } from '../world/weather/WeatherState';
import {
  buildBetaWeatherColors,
  type BetaColor,
} from '../world/weather/BetaWeatherMath';

/** Shared weather wind, matching the existing rain slant direction. */
export const WIND_X = -0.35;
export const WIND_Z = 0.0;

/** Compatibility exports retained for debug/verification imports. */
export const RAIN_FOG_DENSITY_MULTIPLIER = 1.0;
export const THUNDER_FOG_DENSITY_MULTIPLIER = 1.0;
export const CLOUD_FOG_CLEAR = 0.0;
export const CLOUD_FOG_RAIN = 0.0;
export const CLOUD_FOG_THUNDER = 0.0;
export const RAIN_SKYLIGHT_PENALTY = 0;
export const THUNDER_SKYLIGHT_PENALTY_DAY = 0;
export const THUNDER_SKYLIGHT_PENALTY_NIGHT = 0;

export type AtmosphericColors = BetaColor;

/**
 * Immutable per-frame atmospheric snapshot. All weather colour/math is
 * source-derived and built once in Engine; renderers consume this object
 * instead of owning their own weather formulas.
 */
export interface AtmosphericState {
  readonly rainStrength: number;
  readonly thunderStrength: number;
  readonly sky: AtmosphericColors;
  readonly horizon: AtmosphericColors;
  readonly fog: AtmosphericColors;
  readonly cloud: AtmosphericColors;
  readonly fogDensityMultiplier: number;
  readonly cloudFogStrength: number;
  readonly celestialFade: number;
  readonly sunriseFade: number;
  readonly weatherSkylightPenalty: number;
  readonly effectiveSkylightSubtracted: number;
  readonly sunBrightnessFactor: number;
  readonly wind: { readonly x: number; readonly z: number };
  readonly sky_state: SkyColorState;
  readonly weather_state: WeatherState;
}

/**
 * Beta uses 1 - rainStrength for Sun/Moon/Stars. This preview is used
 * before the full atmospheric state is built so celestials can be updated
 * during SkyRenderer.update without a second colour pass.
 */
export function previewWeatherFade(rain: number, _thunder: number): {
  celestialFade: number;
  sunriseFade: number;
} {
  void _thunder;
  const fade = rain < 0 ? 1 : rain > 1 ? 0 : 1 - rain;
  return { celestialFade: fade, sunriseFade: fade };
}

export function buildAtmosphericState(
  skyState: SkyColorState,
  weather: WeatherState,
  lightningFlashStrength = 0,
): AtmosphericState {
  const beta = buildBetaWeatherColors(skyState, weather, lightningFlashStrength);

  return {
    rainStrength: beta.rainStrength,
    thunderStrength: beta.thunderStrength,
    sky: beta.sky,
    horizon: beta.horizon,
    fog: beta.fog,
    cloud: beta.cloud,
    // Strict Beta source mode: no extra invented weather fog-distance
    // multiplier. Weather colour changes still come from Beta math.
    fogDensityMultiplier: 1,
    cloudFogStrength: 0,
    celestialFade: beta.celestialAlpha,
    sunriseFade: beta.celestialAlpha,
    weatherSkylightPenalty: 0,
    effectiveSkylightSubtracted: Math.round(beta.skylightSubtracted * (1 - Math.max(0, Math.min(1, lightningFlashStrength)))),
    sunBrightnessFactor: Math.min(1, beta.sunBrightnessFactor + Math.max(0, Math.min(1, lightningFlashStrength))),
    wind: { x: WIND_X, z: WIND_Z },
    sky_state: skyState,
    weather_state: weather,
  };
}
