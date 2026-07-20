/**
 * A single A* search node (Beta `PathPoint`).
 *
 * Coordinates are integer block positions (the entity's feet cell). The cost
 * fields mirror Beta: `totalPathDistance` (g, cost from start),
 * `distanceToNext` (edge cost), `distanceToTarget` (h, heuristic to goal),
 * plus the back-pointer used to reconstruct the final path.
 */
export class PathPoint {
  public readonly xCoord: number;
  public readonly yCoord: number;
  public readonly zCoord: number;
  private readonly hash: number;

  /** Heap index (-1 when not in the open set). */
  public index = -1;
  public totalPathDistance = 0;
  public distanceToNext = 0;
  public distanceToTarget = 0;
  public previous: PathPoint | null = null;
  public isFirst = false;

  public constructor(x: number, y: number, z: number) {
    this.xCoord = x;
    this.yCoord = y;
    this.zCoord = z;
    this.hash = PathPoint.hash(x, y, z);
  }

  /** Beta's coordinate hash (handles negative coordinates). */
  public static hash(x: number, y: number, z: number): number {
    return (
      (y & 255) |
      ((x & 32767) << 8) |
      ((z & 32767) << 24) |
      (x < 0 ? 0x80000000 : 0) |
      (z < 0 ? 0x00008000 : 0)
    );
  }

  public get hashCode(): number {
    return this.hash;
  }

  public distanceTo(other: PathPoint): number {
    const dx = other.xCoord - this.xCoord;
    const dy = other.yCoord - this.yCoord;
    const dz = other.zCoord - this.zCoord;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  public equals(other: PathPoint): boolean {
    return (
      this.hash === other.hash &&
      this.xCoord === other.xCoord &&
      this.yCoord === other.yCoord &&
      this.zCoord === other.zCoord
    );
  }

  public isAssigned(): boolean {
    return this.index >= 0;
  }
}
