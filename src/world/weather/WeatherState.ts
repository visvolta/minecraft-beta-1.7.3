/**
 * Weather simulation data & Beta-accurate strength interpolation.
 *
 * Ported from Beta 1.7.3 mc-dev `World.updateWeather()` (see
 * scripts/verifySkyStage16.ts for parity assertions):
 *
 *   - Two independent boolean flags `raining` / `thundering`, each
 *     driven by its own countdown timer.
 *   - Strengths advance ±0.01 per game tick (20 tps) toward the target
 *     dictated by the boolean flag. Clamped [0, 1].
 *   - Effective (renderable) thunder strength = current rain strength
 *     × current thunder strength — thunder is always gated by rain.
 *
 * This module is renderer-independent: no THREE, no DOM, no scene
 * graph. It exposes plain-data getters that consumers (sky / clouds /
 * precipitation / lightning / fog) read once per frame from the shared
 * atmospheric state (see AtmosphericState.ts).
 */

/** Weather mode. Beta only knows raining and thundering; the top-level "mode" is a UI/debug abstraction. */
export type WeatherMode = 'clear' | 'rain' | 'thunder';

/** Public snapshot of the weather simulation at the current tick. */
export interface WeatherStateSnapshot {
  readonly raining: boolean;
  readonly thundering: boolean;
  readonly rainingStrength: number;
  readonly prevRainingStrength: number;
  readonly thunderingStrength: number;
  readonly prevThunderingStrength: number;
  readonly rainTime: number;
  readonly thunderTime: number;
  /** Fractional-tick residue for interpolating strengths mid-frame. */
  readonly partialTick: number;
}

/** Per-tick delta applied to rain/thunder strengths in Beta. */
export const STRENGTH_DELTA_PER_TICK = 0.01;

export class WeatherState {
  public raining = false;
  public thundering = false;
  public rainingStrength = 0;
  public prevRainingStrength = 0;
  public thunderingStrength = 0;
  public prevThunderingStrength = 0;

  /** Ticks until the raining flag flips. */
  public rainTime = 0;
  /** Ticks until the thundering flag flips. */
  public thunderTime = 0;

  /** Fractional-tick residue accumulated between whole-tick updates. */
  public partialTick = 0;

  /**
   * Advances rain/thunder strengths one whole game tick toward the
   * target dictated by the boolean flag. Beta-exact behaviour.
   */
  public advanceStrengthsOneTick(): void {
    this.prevRainingStrength = this.rainingStrength;
    if (this.raining) {
      this.rainingStrength += STRENGTH_DELTA_PER_TICK;
    } else {
      this.rainingStrength -= STRENGTH_DELTA_PER_TICK;
    }
    if (this.rainingStrength < 0) this.rainingStrength = 0;
    if (this.rainingStrength > 1) this.rainingStrength = 1;

    this.prevThunderingStrength = this.thunderingStrength;
    if (this.thundering) {
      this.thunderingStrength += STRENGTH_DELTA_PER_TICK;
    } else {
      this.thunderingStrength -= STRENGTH_DELTA_PER_TICK;
    }
    if (this.thunderingStrength < 0) this.thunderingStrength = 0;
    if (this.thunderingStrength > 1) this.thunderingStrength = 1;
  }

  /**
   * Linear interpolation across the current tick — mimics Beta's
   * `func_27162_g(partialTick)` = prev + (cur - prev) * partial.
   */
  public getRainStrength(partial: number): number {
    return this.prevRainingStrength + (this.rainingStrength - this.prevRainingStrength) * partial;
  }

  /**
   * Beta's `func_27166_f(partialTick)` — thundering is always gated by
   * the current rain strength, so an unrained thunder can never render
   * (matches: thunder always co-occurs with rain in Beta).
   */
  public getThunderStrength(partial: number): number {
    const thunder =
      this.prevThunderingStrength +
      (this.thunderingStrength - this.prevThunderingStrength) * partial;
    return thunder * this.getRainStrength(partial);
  }

  /** Convenience: current interpolated mode label for debug HUD. */
  public getEffectiveMode(partial: number): WeatherMode {
    const r = this.getRainStrength(partial);
    const t = this.getThunderStrength(partial);
    if (t > 0.05) return 'thunder';
    if (r > 0.05) return 'rain';
    return 'clear';
  }

  public snapshot(): WeatherStateSnapshot {
    return {
      raining: this.raining,
      thundering: this.thundering,
      rainingStrength: this.rainingStrength,
      prevRainingStrength: this.prevRainingStrength,
      thunderingStrength: this.thunderingStrength,
      prevThunderingStrength: this.prevThunderingStrength,
      rainTime: this.rainTime,
      thunderTime: this.thunderTime,
      partialTick: this.partialTick,
    };
  }
}
