/**
 * Beta 1.7.3 player portal state, plus an explicit asynchronous transition
 * lock.
 *
 * Beta timings (`EntityPlayerSP.onLivingUpdate` / `EntityPlayer.setInPortal`):
 *   - `timeInPortal += 0.0125` per tick while touching a portal, so a full
 *     charge takes 80 ticks (4 seconds).
 *   - `timeInPortal -= 0.05` per tick once clear of the portal.
 *   - reaching 1.0 sets `timeUntilPortal = 10` and triggers travel.
 *   - `setInPortal()` while `timeUntilPortal > 0` re-arms the cooldown to 10
 *     instead of re-triggering, which is what stops an immediate bounce-back
 *     after arriving inside the destination portal.
 *
 * The `Transitioning` phase is NOT from Beta: destination chunks must load
 * asynchronously here, and without an explicit lock the player could trigger
 * repeatedly while that happens, duplicating portals or moving mid-switch.
 * The Beta 10-tick cooldown is kept separate from that lock.
 */
export const enum PortalPhase {
  /** Not touching a portal. */
  Normal = 0,
  /** Touching a portal; charge is building. */
  InPortal = 1,
  /** Travel triggered; destination is being prepared asynchronously. */
  Transitioning = 2,
  /** Destination ready; player placed, waiting to resume normal simulation. */
  DestinationReady = 3,
}

/** Beta: 0.0125 per tick => 80 ticks to charge. */
export const PORTAL_CHARGE_PER_TICK = 0.0125;
/** Beta: 0.05 per tick decay when out of the portal. */
export const PORTAL_DECAY_PER_TICK = 0.05;
/** Beta: `timeUntilPortal = 10` after travelling. */
export const PORTAL_COOLDOWN_TICKS = 10;

export interface PortalTickResult {
  /** True on the tick the travel threshold is first reached. */
  readonly shouldTravel: boolean;
  /** True on the tick contact begins (plays `portal.trigger`). */
  readonly startedContact: boolean;
}

export class PortalTravelState {
  private phase: PortalPhase = PortalPhase.Normal;
  private timeInPortal = 0;
  private previousTimeInPortal = 0;
  private cooldownTicks = 0;
  /** Set by the portal block each tick the player is inside one. */
  private touchingPortal = false;

  /** Beta `Entity.setInPortal` / `EntityPlayer.setInPortal`. */
  public setInPortal(): void {
    if (this.cooldownTicks > 0) {
      // Standing in the destination portal after arriving must not bounce the
      // player straight back; Beta re-arms the cooldown instead.
      this.cooldownTicks = PORTAL_COOLDOWN_TICKS;
      return;
    }
    this.touchingPortal = true;
  }

  /** Advances one game tick. */
  public tick(): PortalTickResult {
    this.previousTimeInPortal = this.timeInPortal;

    // While a transition is in flight the timer is frozen: no repeat triggers.
    if (this.phase === PortalPhase.Transitioning) {
      this.touchingPortal = false;
      return { shouldTravel: false, startedContact: false };
    }

    let shouldTravel = false;
    let startedContact = false;

    if (this.touchingPortal) {
      if (this.timeInPortal === 0) startedContact = true;
      this.phase = PortalPhase.InPortal;
      this.timeInPortal += PORTAL_CHARGE_PER_TICK;
      if (this.timeInPortal >= 1) {
        this.timeInPortal = 1;
        this.cooldownTicks = PORTAL_COOLDOWN_TICKS;
        this.phase = PortalPhase.Transitioning;
        shouldTravel = true;
      }
      this.touchingPortal = false;
    } else {
      if (this.timeInPortal > 0) this.timeInPortal -= PORTAL_DECAY_PER_TICK;
      if (this.timeInPortal < 0) this.timeInPortal = 0;
      if (this.timeInPortal === 0 && this.phase === PortalPhase.InPortal) {
        this.phase = PortalPhase.Normal;
      }
    }

    if (this.cooldownTicks > 0) this.cooldownTicks -= 1;

    return { shouldTravel, startedContact };
  }

  /** Called once the destination world is ready and the player is placed. */
  public completeTransition(): void {
    this.phase = PortalPhase.DestinationReady;
    // Beta leaves the player fully charged on arrival; it decays normally and
    // the cooldown prevents an instant return trip.
    this.timeInPortal = 1;
    this.cooldownTicks = PORTAL_COOLDOWN_TICKS;
  }

  /** Called if the transition failed, so the player is not stuck frozen. */
  public abortTransition(): void {
    this.phase = PortalPhase.Normal;
    this.timeInPortal = 0;
    this.cooldownTicks = PORTAL_COOLDOWN_TICKS;
  }

  /** Resumes normal play after arrival. */
  public resumeNormal(): void {
    if (this.phase === PortalPhase.DestinationReady) this.phase = PortalPhase.Normal;
  }

  public isTransitioning(): boolean {
    return this.phase === PortalPhase.Transitioning;
  }

  public getPhase(): PortalPhase {
    return this.phase;
  }

  /** 0..1 overlay strength, interpolated for smooth rendering. */
  public getOverlayStrength(partialTick = 1): number {
    return this.previousTimeInPortal + (this.timeInPortal - this.previousTimeInPortal) * partialTick;
  }

  public getCooldownTicks(): number {
    return this.cooldownTicks;
  }
}
