export interface LightningBoltState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly seed: bigint;
  readonly ageTicks: number;
  readonly stateTicks: number;
}

/** Plain visual-lightning state. No THREE, no rendering, no gameplay side effects. */
export class LightningState {
  private readonly bolts: LightningBoltState[] = [];
  private flashTicks = 0;

  public replaceBolts(next: LightningBoltState[]): void {
    this.bolts.length = 0;
    this.bolts.push(...next);
  }

  public setFlashTicks(ticks: number): void {
    this.flashTicks = Math.max(0, ticks);
  }

  public getBolts(): readonly LightningBoltState[] {
    return this.bolts;
  }

  /** Beta sky flash strength: lightningFlash=2 gives one full-strength frame. */
  public getFlashStrength(partialTick = 0): number {
    if (this.flashTicks <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, this.flashTicks - partialTick));
  }

  public getActiveBoltCount(): number {
    return this.bolts.length;
  }
}
