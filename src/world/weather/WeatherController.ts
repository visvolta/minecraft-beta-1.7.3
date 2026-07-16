import { JavaRandom } from '../generation/random/JavaRandom';
import { WeatherState, type WeatherMode } from './WeatherState';

/**
 * Beta 1.7.3 weather simulation controller (renderer-independent).
 *
 * Ports `World.updateWeather()` from mc-dev verbatim, plus adds three
 * debug override paths (F8/F9/F10 in Engine) that force clear/rain/
 * thunder and can return to automatic simulation.
 *
 * Determinism (per Stage 18 answer q3):
 *   The `JavaRandom` this controller uses is seeded once per session
 *   (not per world seed). Beta itself reseeds `world.rand` on load,
 *   so weather sequences differ across sessions in vanilla; matching
 *   that behaviour lets `world seed` remain a pure terrain-generator
 *   input while weather still uses Java's exact RNG algorithm.
 *
 * Timers (all in game ticks; 20 tps):
 *   OFF (clear) : rand.nextInt(0x29040) + 12000        = 12000..180000 (10 min..2h30m)
 *   Rain ON     : rand.nextInt(12000) + 12000          = 12000..24000 (10..20 min)
 *   Thunder ON  : rand.nextInt(12000) + 3600           = 3600..15600  (3..13 min)
 *
 * Strengths advance ±0.01/tick (WeatherState.advanceStrengthsOneTick).
 */
const GAME_TICKS_PER_SECOND = 20;

/** Beta constants. */
const RAIN_OFF_MAX = 0x29040; // 168000; +12000 = 180000 max off period
const RAIN_OFF_MIN_OFFSET = 12000;
const RAIN_ON_MAX = 12000;
const RAIN_ON_MIN_OFFSET = 12000;
const THUNDER_OFF_MAX = 0x29040;
const THUNDER_OFF_MIN_OFFSET = 12000;
const THUNDER_ON_MAX = 12000;
const THUNDER_ON_MIN_OFFSET = 3600;

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

  /**
   * Force a specific weather mode. The Beta timer machinery keeps
   * running underneath so returning to `setAuto()` picks up the natural
   * schedule cleanly.
   */
  public forceMode(mode: WeatherMode): void {
    this.forced = mode;
    this.state.raining = mode === 'rain' || mode === 'thunder';
    this.state.thundering = mode === 'thunder';
  }

  public setAuto(): void {
    this.forced = null;
    // Do NOT overwrite state.raining/thundering here — let the natural
    // timers gradually take over. Next tick will keep the current
    // strengths ramping toward whatever the timers say.
  }

  public getForcedMode(): ForcedMode {
    return this.forced;
  }

  public getState(): WeatherState {
    return this.state;
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
