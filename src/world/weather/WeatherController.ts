import { JavaRandom } from '../generation/random/JavaRandom';
import { WeatherState, type WeatherMode } from './WeatherState';
import {
  GAME_TICKS_PER_SECOND,
  RAIN_OFF_MAX,
  RAIN_OFF_MIN_OFFSET,
  RAIN_ON_MAX,
  RAIN_ON_MIN_OFFSET,
  THUNDER_OFF_MAX,
  THUNDER_OFF_MIN_OFFSET,
  THUNDER_ON_MAX,
  THUNDER_ON_MIN_OFFSET,
} from './BetaWeatherMath';

/**
 * Beta 1.7.3 weather simulation controller (renderer-independent).
 *
 * Ports `World.updateWeather()` from mc-dev verbatim, plus adds debug
 * override paths (F8/F9/F10 in Engine) that force clear/rain/thunder and
 * can return to automatic simulation. Timer constants live in
 * BetaWeatherMath.ts so rendering and debug code share the same source.
 */

/** Debug override mode. `null` means fully automatic. */
type ForcedMode = WeatherMode | null;

export class WeatherController {
  private readonly state = new WeatherState();
  private readonly random: JavaRandom;

  private forced: ForcedMode = null;

  public constructor(sessionSeed: bigint) {
    this.random = new JavaRandom(sessionSeed);
    // Beta seeds rain/thunder timers on world init.
    this.state.rainTime = this.random.nextInt(RAIN_OFF_MAX) + RAIN_OFF_MIN_OFFSET;
    this.state.thunderTime = this.random.nextInt(THUNDER_OFF_MAX) + THUNDER_OFF_MIN_OFFSET;
  }

  /**
   * Advance the simulation by `deltaSeconds`. Accumulates fractional
   * ticks so precipitation renderers can query a smooth
   * `getRainStrength(partial)` between whole-tick updates.
   */
  public update(deltaSeconds: number): void {
    const ticks = deltaSeconds * GAME_TICKS_PER_SECOND;
    let acc = this.state.partialTick + ticks;
    while (acc >= 1) {
      this.tickOnce();
      acc -= 1;
    }
    this.state.partialTick = acc;
  }

  public getForcedMode(): ForcedMode {
    return this.forced;
  }

  /**
   * Forces a weather mode (`/weather`). Passing `null` hands control back to
   * Beta's random timers. `durationTicks > 0` schedules a return to automatic
   * weather after that many ticks; 0 keeps it forced indefinitely.
   *
   * The strength ramps in `tickOnce` still run, so the transition is gradual
   * exactly as it is for naturally-triggered weather.
   */
  public setForcedMode(mode: ForcedMode, durationTicks = 0): void {
    this.forced = mode;
    if (mode === null) return;
    this.state.raining = mode === 'rain' || mode === 'thunder';
    this.state.thundering = mode === 'thunder';
    if (durationTicks > 0) {
      this.state.rainTime = durationTicks;
      this.state.thunderTime = durationTicks;
    }
  }

  public getState(): WeatherState {
    return this.state;
  }

  /**
   * Restores saved weather, EXCEPT for the fresh-world sentinel
   * (clear + all-zero timers) which means "no real weather state yet" — in
   * that case the constructor's seeded clear-weather timers are kept so the
   * first tick does not immediately transition to storm. A real save always
   * has at least one non-zero timer or an active storm flag.
   */
  public restore(state: { readonly raining: boolean; readonly thundering: boolean; readonly rainTime: number; readonly thunderTime: number }): void {
    this.state.raining = state.raining;
    this.state.thundering = state.thundering;
    const isFresh = !state.raining && !state.thundering && state.rainTime === 0 && state.thunderTime === 0;
    if (!isFresh) {
      this.state.rainTime = state.rainTime;
      this.state.thunderTime = state.thunderTime;
    }
  }

  private tickOnce(): void {
    if (this.forced === null) {
      // Beta updateWeather() — thunder timer first, then rain timer.
      this.state.thunderTime -= 1;
      if (this.state.thunderTime <= 0) {
        this.state.thundering = !this.state.thundering;
        this.state.thunderTime = this.state.thundering
          ? this.random.nextInt(THUNDER_ON_MAX) + THUNDER_ON_MIN_OFFSET
          : this.random.nextInt(THUNDER_OFF_MAX) + THUNDER_OFF_MIN_OFFSET;
      }

      this.state.rainTime -= 1;
      if (this.state.rainTime <= 0) {
        this.state.raining = !this.state.raining;
        this.state.rainTime = this.state.raining
          ? this.random.nextInt(RAIN_ON_MAX) + RAIN_ON_MIN_OFFSET
          : this.random.nextInt(RAIN_OFF_MAX) + RAIN_OFF_MIN_OFFSET;
      }
    }
    // else: forced mode — bypass timer transitions but still tick
    // strength ramps below toward the forced booleans.

    this.state.advanceStrengthsOneTick();
  }
}
