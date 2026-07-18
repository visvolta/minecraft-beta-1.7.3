export class RegionCorruptionError extends Error {
  public constructor(
    message: string,
    public readonly rawBytes?: Uint8Array,
    public readonly sectorOffset?: number,
    public readonly sectorCount?: number,
  ) {
    super(message);
    this.name = 'RegionCorruptionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
