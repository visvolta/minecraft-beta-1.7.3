/**
 * Axis-aligned bounding box in world space.
 * Pure geometry: no chunk, block, or gameplay knowledge.
 */
export class AABB {
  public constructor(
    public minX: number,
    public minY: number,
    public minZ: number,
    public maxX: number,
    public maxY: number,
    public maxZ: number,
  ) {}

  /** Returns a new AABB offset by (dx, dy, dz). */
  public translated(dx: number, dy: number, dz: number): AABB {
    return new AABB(
      this.minX + dx,
      this.minY + dy,
      this.minZ + dz,
      this.maxX + dx,
      this.maxY + dy,
      this.maxZ + dz,
    );
  }

  /** True if this box overlaps another (touching edges do not count). */
  public intersects(other: AABB): boolean {
    return (
      this.minX < other.maxX &&
      this.maxX > other.minX &&
      this.minY < other.maxY &&
      this.maxY > other.minY &&
      this.minZ < other.maxZ &&
      this.maxZ > other.minZ
    );
  }
}
