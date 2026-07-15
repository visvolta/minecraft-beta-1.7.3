import * as THREE from 'three';
import type { SunriseSunsetColors, WorldTime } from '../../world/WorldTime';

export interface SkyColorState {
  readonly celestialAngle: number;
  readonly skyPhase: string;
  readonly starOpacity: number;
  readonly sunAltitude: number;
  readonly skylightSubtracted: number;
  readonly skyTopColorHex: number;
  readonly skyHorizonColorHex: number;
  readonly skyBottomColorHex: number;
  readonly fogColorHex: number;
  readonly sunriseSunset: SunriseSunsetColors | null;
}

interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const DAY_TOP: RgbColor = { r: 0x57 / 255, g: 0x85 / 255, b: 0xff / 255 };
const DAY_HORIZON: RgbColor = { r: 0xa8 / 255, g: 0xc8 / 255, b: 0xff / 255 };
const DAY_BOTTOM: RgbColor = { r: 0xd8 / 255, g: 0xe8 / 255, b: 0xff / 255 };

const NIGHT_TOP: RgbColor = { r: 0x02 / 255, g: 0x05 / 255, b: 0x12 / 255 };
const NIGHT_HORIZON: RgbColor = { r: 0x08 / 255, g: 0x10 / 255, b: 0x24 / 255 };
const NIGHT_BOTTOM: RgbColor = { r: 0x03 / 255, g: 0x05 / 255, b: 0x10 / 255 };

const fogDay = new THREE.Color();

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function colorToHex(color: RgbColor): number {
  const r = THREE.MathUtils.clamp(Math.round(color.r * 255), 0, 255);
  const g = THREE.MathUtils.clamp(Math.round(color.g * 255), 0, 255);
  const b = THREE.MathUtils.clamp(Math.round(color.b * 255), 0, 255);
  return (r << 16) | (g << 8) | b;
}

function lerpRgb(a: RgbColor, b: RgbColor, t: number): RgbColor {
  return {
    r: THREE.MathUtils.lerp(a.r, b.r, t),
    g: THREE.MathUtils.lerp(a.g, b.g, t),
    b: THREE.MathUtils.lerp(a.b, b.b, t),
  };
}

function mixWithTint(base: RgbColor, tint: RgbColor, strength: number): RgbColor {
  const t = clamp01(strength);
  return {
    r: THREE.MathUtils.lerp(base.r, tint.r, t),
    g: THREE.MathUtils.lerp(base.g, tint.g, t),
    b: THREE.MathUtils.lerp(base.b, tint.b, t),
  };
}

/**
 * Computes the full time-of-day color state shared by the sky, fog, stars,
 * and global skylight darkening.
 */
export class SkyColorController {
  public compute(worldTime: WorldTime): SkyColorState {
    const celestialAngle = worldTime.getCelestialAngle();
    const time = worldTime.getTimeOfDayTicks();
    const skyPhase = worldTime.getSkyPhase();
    const starOpacity = worldTime.getStarBrightness();
    const sunriseSunset = worldTime.calcSunriseSunsetColors();
    const skylightSubtracted = worldTime.getSkylightSubtracted();

    let dayFactor = Math.cos(celestialAngle * Math.PI * 2) * 0.5 + 0.5;
    dayFactor = clamp01(dayFactor * 1.15 - 0.05);

    const sunAltitude = Math.cos(celestialAngle * Math.PI * 2);

    let skyTop = lerpRgb(NIGHT_TOP, DAY_TOP, dayFactor);
    let skyHorizon = lerpRgb(NIGHT_HORIZON, DAY_HORIZON, dayFactor);
    let skyBottom = lerpRgb(NIGHT_BOTTOM, DAY_BOTTOM, dayFactor);

    if (sunriseSunset !== null) {
      const sunriseTint: RgbColor = {
        r: sunriseSunset.r,
        g: sunriseSunset.g,
        b: sunriseSunset.b,
      };
      const tintStrength = sunriseSunset.a * 0.45;
      skyHorizon = mixWithTint(skyHorizon, sunriseTint, tintStrength);
      skyBottom = mixWithTint(skyBottom, sunriseTint, tintStrength * 0.65);
    }

    const betaFog = worldTime.getFogColor();
    fogDay.setRGB(betaFog.r, betaFog.g, betaFog.b);
    const fogBase: RgbColor = {
      r: fogDay.r,
      g: fogDay.g,
      b: fogDay.b,
    };

    let fogColor = mixWithTint(
      fogBase,
      skyHorizon,
      0.25 + (1 - dayFactor) * 0.15,
    );

    if (sunriseSunset !== null) {
      const sunriseTint: RgbColor = {
        r: sunriseSunset.r,
        g: sunriseSunset.g,
        b: sunriseSunset.b,
      };
      fogColor = mixWithTint(fogColor, sunriseTint, sunriseSunset.a * 0.22);
    }

    // Keep the sky-phase transitions readable in F3 by using a few named
    // buckets while the color values themselves still interpolate smoothly.
    let phase = skyPhase;
    if (time >= 22000 || time < 250) {
      phase = 'pre-dawn';
    } else if (time >= 250 && time < 1500) {
      phase = 'sunrise';
    } else if (time >= 1500 && time < 5000) {
      phase = 'morning';
    } else if (time >= 5000 && time < 10000) {
      phase = 'day';
    } else if (time >= 10000 && time < 12000) {
      phase = 'afternoon';
    } else if (time >= 12000 && time < 13750) {
      phase = 'sunset';
    } else if (time >= 13750 && time < 16000) {
      phase = 'dusk';
    } else {
      phase = 'night';
    }

    return {
      celestialAngle,
      skyPhase: phase,
      starOpacity,
      sunAltitude,
      skylightSubtracted,
      skyTopColorHex: colorToHex(skyTop),
      skyHorizonColorHex: colorToHex(skyHorizon),
      skyBottomColorHex: colorToHex(skyBottom),
      fogColorHex: colorToHex(fogColor),
      sunriseSunset,
    };
  }
}
