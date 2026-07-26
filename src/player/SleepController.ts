import { BED_FOOT_TO_HEAD } from '../blocks/shapes/BlockShapes';

/**
 * Beta 1.7.3 sleep presentation.
 *
 * Beta does not skip straight to morning. `EntityPlayer.onUpdate` counts
 * `sleepTimer` up to 100 while asleep, and `World.updateAllPlayersSleepingFlag`
 * only advances time once every sleeper `isPlayerFullyAsleep()` — that is,
 * once the timer reaches 100. `GuiIngame` draws a screen tint whose alpha is
 * `220 * (timer / 100)`, then fades back out over a further 10 ticks after
 * waking.
 *
 * This controller owns that timeline and the derived camera/player pose, so
 * the engine only has to ask "where is the camera and how dark is the screen".
 */

/** Beta: `sleepTimer` is clamped at 100 and marks "fully asleep". */
export const SLEEP_FULLY_ASLEEP_TICKS = 100;
/** Beta: after waking the timer runs on to 110 while the tint fades out. */
export const SLEEP_FADE_OUT_TICKS = 10;
/** Beta `GuiIngame`: peak overlay alpha out of 255. */
export const SLEEP_OVERLAY_MAX_ALPHA = 220;
/** Beta `GuiIngame` overlay colour (0x1052704 masked to RGB). */
export const SLEEP_OVERLAY_COLOUR = 0x100f20;
/** Beta lays the player 0.9375 above the bed block. */
const SLEEP_EYE_Y = 0.9375;
/** Beta `EntityRenderer` nudges the sleeping view up slightly. */
const SLEEP_CAMERA_LIFT = 0.3;
/** Beta shrinks the player's collision box while asleep. */
const SLEEP_BOX_SIZE = 0.2;

export type SleepPhase = 'awake' | 'falling-asleep' | 'asleep' | 'waking';

/** Why sleep ended, so callers can decide whether to advance time. */
export type WakeReason = 'dawn' | 'interrupted' | 'bed-destroyed' | 'died' | 'teardown';

export interface SleepPose {
  /** Camera/eye position while asleep. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Yaw in radians, derived from the bed's facing. */
  readonly yaw: number;
}

export interface SleepBed {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Bed metadata direction bits (0-3). */
  readonly direction: number;
}

/**
 * Beta `sleepInBedAt` offsets the player toward the head of the bed rather
 * than centring them, so they visibly lie along it.
 */
export function sleepPoseFor(bed: SleepBed): SleepPose {
  let offsetX = 0.5;
  let offsetZ = 0.5;
  switch (bed.direction & 3) {
    case 0: offsetZ = 0.9; break;
    case 1: offsetX = 0.1; break;
    case 2: offsetZ = 0.1; break;
    default: offsetX = 0.9; break;
  }
  return {
    x: bed.x + offsetX,
    y: bed.y + SLEEP_EYE_Y,
    z: bed.z + offsetZ,
    // Beta rotates the view by the bed's facing quarter-turns.
    yaw: (bed.direction & 3) * Math.PI / 2,
  };
}

/** Player collision size while asleep (Beta `setSize(0.2F, 0.2F)`). */
export const SLEEP_PLAYER_SIZE = SLEEP_BOX_SIZE;

export class SleepController {
  private phase: SleepPhase = 'awake';
  private timer = 0;
  private bed: SleepBed | null = null;
  private pose: SleepPose | null = null;
  /** Set once the dawn skip has been applied, so it happens exactly once. */
  private timeAdvanced = false;

  /** Called when the player successfully gets into a bed. */
  public beginSleep(bed: SleepBed): void {
    this.bed = bed;
    this.pose = sleepPoseFor(bed);
    this.phase = 'falling-asleep';
    this.timer = 0;
    this.timeAdvanced = false;
  }

  /**
   * Advances the sleep timeline by one tick.
   *
   * Returns `'advance-time'` on the single tick the player becomes fully
   * asleep, which is when Beta skips the night.
   */
  public tick(): 'none' | 'advance-time' {
    if (this.phase === 'falling-asleep') {
      this.timer += 1;
      if (this.timer >= SLEEP_FULLY_ASLEEP_TICKS) {
        this.timer = SLEEP_FULLY_ASLEEP_TICKS;
        this.phase = 'asleep';
        if (!this.timeAdvanced) {
          this.timeAdvanced = true;
          return 'advance-time';
        }
      }
      return 'none';
    }

    if (this.phase === 'waking') {
      this.timer += 1;
      if (this.timer >= SLEEP_FULLY_ASLEEP_TICKS + SLEEP_FADE_OUT_TICKS) {
        this.timer = 0;
        this.phase = 'awake';
        this.bed = null;
        this.pose = null;
      }
      return 'none';
    }

    return 'none';
  }

  /**
   * Ends sleep. Beta's `wakeUpPlayer(immediately, ...)` either resets the
   * timer to 0 (instant) or leaves it at 100 so the tint fades out.
   *
   * Death, world teardown and bed destruction all wake immediately, which is
   * what prevents the camera being left stuck in the sleeping pose.
   */
  public wake(reason: WakeReason): void {
    if (this.phase === 'awake') return;
    const immediate = reason === 'died' || reason === 'teardown' || reason === 'bed-destroyed';
    if (immediate) {
      this.phase = 'awake';
      this.timer = 0;
      this.bed = null;
      this.pose = null;
      return;
    }
    this.phase = 'waking';
    this.timer = SLEEP_FULLY_ASLEEP_TICKS;
  }

  /** True while the player is in bed (not during the post-wake fade). */
  public isSleeping(): boolean {
    return this.phase === 'falling-asleep' || this.phase === 'asleep';
  }

  /** Beta `isPlayerFullyAsleep`. */
  public isFullyAsleep(): boolean {
    return this.phase === 'asleep';
  }

  public getPhase(): SleepPhase {
    return this.phase;
  }

  public getBed(): SleepBed | null {
    return this.bed;
  }

  /**
   * Camera pose while sleeping, including Beta's small upward nudge. Null
   * once fully awake, so the caller restores normal camera control.
   */
  public getCameraPose(): SleepPose | null {
    if (this.pose === null) return null;
    return { ...this.pose, y: this.pose.y + SLEEP_CAMERA_LIFT };
  }

  /**
   * Screen tint alpha in 0..1, following Beta's `GuiIngame` curve: ramps up
   * over 100 ticks, then falls back over the following 10.
   */
  public getOverlayAlpha(): number {
    if (this.timer <= 0) return 0;
    const ratio = this.timer / SLEEP_FULLY_ASLEEP_TICKS;
    const curve = ratio > 1
      ? 1 - (this.timer - SLEEP_FULLY_ASLEEP_TICKS) / SLEEP_FADE_OUT_TICKS
      : ratio;
    const clamped = Math.max(0, Math.min(1, curve));
    return clamped * (SLEEP_OVERLAY_MAX_ALPHA / 255);
  }

  /** True while the sleep tint should be drawn at all. */
  public hasOverlay(): boolean {
    return this.timer > 0;
  }

  /** Direction offset from the bed's foot toward its head. */
  public getBedHeadOffset(): readonly [number, number] {
    const bed = this.bed;
    if (bed === null) return [0, 1];
    return BED_FOOT_TO_HEAD[bed.direction & 3] ?? [0, 1];
  }
}
