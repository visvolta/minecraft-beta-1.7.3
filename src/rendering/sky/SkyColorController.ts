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

const DAY_TOP: RgbColor = { r: 0x45 / 255, g: 0x79 / 255, b: 0xff / 255 };
const DAY_HORIZON: RgbColor = { r: 0x8f / 255, g: 0xc6 / 255, b: 0xff / 255 };
const DAY_BOTTOM: RgbColor = { r: 0xd7 / 255, g: 0xec / 255, b: 0xff / 255 };

const DUSK_TOP: RgbColor = { r: 0x16 / 255, g: 0x1d / 255, b: 0x44 / 255 };
const DUSK_HORIZON: RgbColor = { r: 0xf4 / 255, g: 0x88 / 255, b: 0x3d / 255 };
const DUSK_BOTTOM: RgbColor = { r: 0x3d / 255, g: 0x29 / 255, b: 0x39 / 255 };

const NIGHT_TOP: RgbColor = { r: 0x00 / 255, g: 0x02 / 255, b: 0x08 / 255 };
const NIGHT_HORIZON: RgbColor = { r: 0x05 / 255, g: 0x09 / 255, b: 0x18 / 255 };
const NIGHT_BOTTOM: RgbColor = { r: 0x01 / 255, g: 0x02 / 255, b: 0x07 / 255 };

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

export class SkyColorController {
  public compute(worldTime: WorldTime): SkyColorState {
    const celestialAngle = worldTime.getCelestialAngle();
    const time = worldTime.getTimeOfDayTicks();
    const starOpacity = worldTime.getStarBrightness();
    const sunriseSunset = worldTime.calcSunriseSunsetColors();
    const skylightSubtracted = worldTime.getSkylightSubtracted();

    const sunAltitude = Math.cos(celestialAngle * Math.PI * 2);
    let dayFactor = clamp01((sunAltitude + 0.22) / 1.22);
    dayFactor = Math.pow(dayFactor, 0.7);

    const duskWindow = clamp01(1 - Math.abs(sunAltitude) / 0.26);
    const duskStrength = duskWindow * duskWindow;

    const dayTop = lerpRgb(DUSK_TOP, DAY_TOP, dayFactor);
    const dayHorizon = lerpRgb(DUSK_HORIZON, DAY_HORIZON, dayFactor);
    const dayBottom = lerpRgb(DUSK_BOTTOM, DAY_BOTTOM, dayFactor);

    let skyTop = lerpRgb(NIGHT_TOP, dayTop, dayFactor);
    let skyHorizon = lerpRgb(NIGHT_HORIZON, dayHorizon, Math.max(dayFactor, duskStrength * 0.55));
    let skyBottom = lerpRgb(NIGHT_BOTTOM, dayBottom, Math.max(dayFactor, duskStrength * 0.35));

    if (sunriseSunset !== null) {
      const sunriseTint: RgbColor = {
        r: sunriseSunset.r,
        g: sunriseSunset.g,
        b: sunriseSunset.b,
      };
      const horizonTint = sunriseSunset.a * 0.75;
      const bottomTint = sunriseSunset.a * 0.45;
      skyHorizon = mixWithTint(skyHorizon, sunriseTint, horizonTint);
      skyBottom = mixWithTint(skyBottom, sunriseTint, bottomTint);
    }

    const betaFog = worldTime.getFogColor();
    fogDay.setRGB(betaFog.r, betaFog.g, betaFog.b);
    const fogBase: RgbColor = {
      r: fogDay.r,
      g: fogDay.g,
      b: fogDay.b,
    };

    let fogColor = mixWithTint(fogBase, skyHorizon, 0.35 + duskStrength * 0.2 + (1 - dayFactor) * 0.15);
    if (sunriseSunset !== null) {
      fogColor = mixWithTint(
        fogColor,
        { r: sunriseSunset.r, g: sunriseSunset.g, b: sunriseSunset.b },
        sunriseSunset.a * 0.22,
      );
    }

    let phase: string;
    if (time >= 22000 || time < 250) {
      phase = 'pre-dawn';
    } else if (time < 1500) {
      phase = 'sunrise';
    } else if (time < 5000) {
      phase = 'morning';
    } else if (time < 10000) {
      phase = 'day';
    } else if (time < 12000) {
      phase = 'afternoon';
    } else if (time < 13750) {
      phase = 'sunset';
    } else if (time < 16000) {
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
