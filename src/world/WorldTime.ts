export interface SunriseSunsetColors {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const TICKS_PER_DAY = 24000;
const GAME_TICKS_PER_SECOND = 20;
const DAY_SET_TIME = 1000;
const NIGHT_SET_TIME = 13000;

export class WorldTime {
  private ticks = 0;

  public update(deltaSeconds: number): void {
    this.ticks += deltaSeconds * GAME_TICKS_PER_SECOND;
  }

  public addTicks(deltaTicks: number): void {
    this.ticks += deltaTicks;
  }

  public setDay(): void {
    this.setTimeOfDay(DAY_SET_TIME);
  }

  public setNight(): void {
    this.setTimeOfDay(NIGHT_SET_TIME);
  }

  public getTotalTicks(): number {
    return this.ticks;
  }

  public getDayNumber(): number {
    return Math.floor(this.ticks / TICKS_PER_DAY);
  }

  public getTimeOfDayTicks(): number {
    let time = this.ticks % TICKS_PER_DAY;
    if (time < 0) {
      time += TICKS_PER_DAY;
    }
    return time;
  }

  public getCelestialAngle(): number {
    let value = this.getTimeOfDayTicks() / TICKS_PER_DAY - 0.25;

    if (value < 0) {
      value += 1;
    }
    if (value > 1) {
      value -= 1;
    }

    const original = value;
    value = 1 - (Math.cos(value * Math.PI) + 1) / 2;
    value = original + (value - original) / 3;
    return value;
  }

  public calcSunriseSunsetColors(): SunriseSunsetColors | null {
    const celestialAngle = this.getCelestialAngle();
    const band = 0.4;
    const cosine = Math.cos(celestialAngle * Math.PI * 2);

    if (cosine < -band || cosine > band) {
      return null;
    }

    const t = (cosine / band) * 0.5 + 0.5;
    let alpha = 1 - (1 - Math.sin(t * Math.PI)) * 0.99;
    alpha *= alpha;

    return {
      r: t * 0.3 + 0.7,
      g: t * t * 0.7 + 0.2,
      b: t * t * 0.0 + 0.2,
      a: alpha,
    };
  }

  public getFogColor(): { r: number; g: number; b: number } {
    const celestialAngle = this.getCelestialAngle();
    let factor = Math.cos(celestialAngle * Math.PI * 2) * 2 + 0.5;

    factor = Math.max(0, Math.min(1, factor));

    return {
      r: 0.7529412 * (factor * 0.94 + 0.06),
      g: 0.8470588 * (factor * 0.94 + 0.06),
      b: 1.0 * (factor * 0.91 + 0.09),
    };
  }

  /**
   * Beta 1.7.3 `getStarBrightness`, ported verbatim from mc-dev:
   *   float f2 = 1.0F - (MathHelper.cos(f1 * 3.141593F * 2.0F) * 2.0F + 0.75F);
   *   return f2 * f2 * 0.5F;
   *
   * The prior implementation used `0.85` here and `0.25` inside the cos()
   * term — both slight deviations. Now bit-for-bit Beta.
   */
  public getStarBrightness(): number {
    const celestialAngle = this.getCelestialAngle();
    let value = 1 - (Math.cos(celestialAngle * Math.PI * 2) * 2 + 0.75);

    value = Math.max(0, Math.min(1, value));
    return value * value * 0.5;
  }

  /** Kept phase-ready even though Stage 16 renders a single Moon texture. */
  public getMoonPhaseIndex(): number {
    return ((Math.floor(this.ticks / TICKS_PER_DAY) % 8) + 8) % 8;
  }

  /**
   * Beta 1.7.3 `calculateSkylightSubtracted`, ported from mc-dev:
   *   return (int)(f2 * 11F);
   *
   * The prior implementation used 13 here — a deviation that kept
   * outdoor terrain 2 skylight levels brighter at midnight than Beta.
   * Now bit-for-bit Beta (max 11).
   */
  public getSkylightSubtracted(): number {
    const celestialAngle = this.getCelestialAngle();
    let value = Math.cos(celestialAngle * Math.PI * 2) * 2 + 0.5;

    value = Math.max(0, Math.min(1, value));
    return Math.floor((1 - value) * 11);
  }

  /**
   * "How much of peak sunlight is present" factor multiplied into skylight
   * contributions by ChunkRenderer.
   *
   * Beta's own value is `f * 0.8 + 0.2` (hard 0.2 floor). Stage 16
   * intentionally deviates: we drop the 0.2 floor so a fully enclosed,
   * skylight=0 block genuinely renders black rather than 20% grey. The
   * downstream lighting pipeline (getLightBrightness) also has its 0.05
   * floor removed, so together they let caves and unlit-corner nights
   * reach true darkness without introducing a global "night overlay".
   *
   * Returns [0, 1]. At noon, `value = 1`; at midnight, `value = 0`.
   */
  public getSunBrightnessFactor(): number {
    const celestialAngle = this.getCelestialAngle();
    let value = 1 - (Math.cos(celestialAngle * Math.PI * 2) * 2 + 0.2);

    value = Math.max(0, Math.min(1, value));
    value = 1 - value;
    return value * 0.8 + 0.2;
  }

  public getSkyPhase(): string {
    const time = this.getTimeOfDayTicks();
    if (time < 500 || time >= 23000) {
      return 'sunrise';
    }
    if (time < 12000) {
      return 'day';
    }
    if (time < 13500) {
      return 'sunset';
    }
    return 'night';
  }

  private setTimeOfDay(targetTicks: number): void {
    const day = this.getDayNumber();
    this.ticks = day * TICKS_PER_DAY + targetTicks;
  }
  /** Persistence restoration; total ticks are the authoritative world-time value. */
  public setTotalTicks(ticks: number): void {
    if (!Number.isFinite(ticks) || ticks < 0) throw new Error('Invalid persisted world time');
    this.ticks = Math.floor(ticks);
  }

}
