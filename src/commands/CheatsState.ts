/**
 * Simple cheats authorization check.
 * Consults the authoritative world-level property (WorldMetadata.cheatsEnabled).
 * Designed to be injectable; commands receive it through CommandService.
 */
export class CheatsState {
  private enabled = false;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(value: boolean): void {
    this.enabled = value;
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}
