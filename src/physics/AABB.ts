/**
 * Axis-aligned bounding box in world space.
 * Pure geometry: no chunk, block, or gameplay knowledge.
 *
 * Extended with Beta 1.7.3 AxisAlignedBB collision methods used by
 * player physics and entity collision resolution.
 */
import type { FaceNormal } from '../world/Raycaster';

export class AABB {
  public constructor(
    public minX: number,
    public minY: number,
    public minZ: number,
    public maxX: number,
    public maxY: number,
    public maxZ: number,
  ) {}

  public intersectRay(
    originX: number, originY: number, originZ: number,
    dirX: number, dirY: number, dirZ: number
  ): { distance: number; face: FaceNormal } | undefined {
    let tmin = -Infinity, tmax = Infinity;
    let tminFace: FaceNormal | undefined;

    const checkAxis = (
      dir: number, origin: number,
      min: number, max: number,
      faceMin: FaceNormal, faceMax: FaceNormal
    ) => {
      if (dir !== 0) {
        let tx1 = (min - origin) / dir;
        let tx2 = (max - origin) / dir;
        let f1 = faceMin;
        let f2 = faceMax;
        if (tx1 > tx2) {
          const t = tx1; tx1 = tx2; tx2 = t;
          const f = f1; f1 = f2; f2 = f;
        }
        if (tx1 > tmin) { tmin = tx1; tminFace = f1; }
        if (tx2 < tmax) { tmax = tx2; }
        if (tmin > tmax) return false;
      } else if (origin < min || origin > max) {
        return false;
      }
      return true;
    };

    if (!checkAxis(dirX, originX, this.minX, this.maxX, { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })) return undefined;
    if (!checkAxis(dirY, originY, this.minY, this.maxY, { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 })) return undefined;
    if (!checkAxis(dirZ, originZ, this.minZ, this.maxZ, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 })) return undefined;

    if (tmax < 0) return undefined;
    
    return {
      distance: tmin >= 0 ? tmin : 0,
      face: tminFace ?? { x: 0, y: 1, z: 0 } // Fallback, shouldn't occur if tmin >= 0
    };
  }

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

  /**
   * Mutates this box in-place by (dx, dy, dz). Returns `this` for chaining.
   * Matches Beta's AxisAlignedBB.offset().
   */
  public offset(dx: number, dy: number, dz: number): this {
    this.minX += dx;
    this.minY += dy;
    this.minZ += dz;
    this.maxX += dx;
    this.maxY += dy;
    this.maxZ += dz;
    return this;
  }

  /**
   * Returns a deep copy of this AABB.
   * Matches Beta's AxisAlignedBB.copy().
   */
  public copy(): AABB {
    return new AABB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ);
  }

  /**
   * Returns a new AABB expanded outward by (dx, dy, dz) on each side.
   * Matches Beta's AxisAlignedBB.expand().
   */
  public expand(dx: number, dy: number, dz: number): AABB {
    return new AABB(
      this.minX - dx,
      this.minY - dy,
      this.minZ - dz,
      this.maxX + dx,
      this.maxY + dy,
      this.maxZ + dz,
    );
  }

  /**
   * Returns a new AABB contracted inward by (dx, dy, dz) on each side.
   * Matches Beta's AxisAlignedBB.contract().
   */
  public contract(dx: number, dy: number, dz: number): AABB {
    return new AABB(
      this.minX + dx,
      this.minY + dy,
      this.minZ + dz,
      this.maxX - dx,
      this.maxY - dy,
      this.maxZ - dz,
    );
  }

  /**
   * Returns a new AABB that includes the displacement (dx, dy, dz),
   * expanding whichever side the displacement moves toward.
   * Matches Beta's AxisAlignedBB.addCoord().
   */
  public addCoord(dx: number, dy: number, dz: number): AABB {
    let minX = this.minX;
    let minY = this.minY;
    let minZ = this.minZ;
    let maxX = this.maxX;
    let maxY = this.maxY;
    let maxZ = this.maxZ;

    if (dx < 0) minX += dx;
    else if (dx > 0) maxX += dx;

    if (dy < 0) minY += dy;
    else if (dy > 0) maxY += dy;

    if (dz < 0) minZ += dz;
    else if (dz > 0) maxZ += dz;

    return new AABB(minX, minY, minZ, maxX, maxY, maxZ);
  }

  /**
   * Calculates the maximum distance this box can move along the X axis
   * without penetrating `other`. Returns the clamped `distance`.
   * Matches Beta's AxisAlignedBB.calculateXOffset().
   */
  public calculateXOffset(other: AABB, distance: number): number {
    if (other.maxY <= this.minY || other.minY >= this.maxY) return distance;
    if (other.maxZ <= this.minZ || other.minZ >= this.maxZ) return distance;

    if (distance > 0 && other.maxX <= this.minX) {
      const gap = this.minX - other.maxX;
      if (gap < distance) distance = gap;
    }

    if (distance < 0 && other.minX >= this.maxX) {
      const gap = this.maxX - other.minX;
      if (gap > distance) distance = gap;
    }

    return distance;
  }

  /**
   * Calculates the maximum distance this box can move along the Y axis
   * without penetrating `other`. Returns the clamped `distance`.
   * Matches Beta's AxisAlignedBB.calculateYOffset().
   */
  public calculateYOffset(other: AABB, distance: number): number {
    if (other.maxX <= this.minX || other.minX >= this.maxX) return distance;
    if (other.maxZ <= this.minZ || other.minZ >= this.maxZ) return distance;

    if (distance > 0 && other.maxY <= this.minY) {
      const gap = this.minY - other.maxY;
      if (gap < distance) distance = gap;
    }

    if (distance < 0 && other.minY >= this.maxY) {
      const gap = this.maxY - other.minY;
      if (gap > distance) distance = gap;
    }

    return distance;
  }

  /**
   * Calculates the maximum distance this box can move along the Z axis
   * without penetrating `other`. Returns the clamped `distance`.
   * Matches Beta's AxisAlignedBB.calculateZOffset().
   */
  public calculateZOffset(other: AABB, distance: number): number {
    if (other.maxX <= this.minX || other.minX >= this.maxX) return distance;
    if (other.maxY <= this.minY || other.minY >= this.maxY) return distance;

    if (distance > 0 && other.maxZ <= this.minZ) {
      const gap = this.minZ - other.maxZ;
      if (gap < distance) distance = gap;
    }

    if (distance < 0 && other.minZ >= this.maxZ) {
      const gap = this.maxZ - other.minZ;
      if (gap > distance) distance = gap;
    }

    return distance;
  }

  /**
   * Average of the three edge lengths. Used for render-distance checks.
   * Matches Beta's AxisAlignedBB.getAverageEdgeLength().
   */
  public getAverageEdgeLength(): number {
    return ((this.maxX - this.minX) + (this.maxY - this.minY) + (this.maxZ - this.minZ)) / 3;
  }

  /**
   * Sets this box's bounds from another AABB (in-place). Returns `this`.
   * Matches Beta's AxisAlignedBB.setBB().
   */
  public setBounds(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): this {
    this.minX = minX;
    this.minY = minY;
    this.minZ = minZ;
    this.maxX = maxX;
    this.maxY = maxY;
    this.maxZ = maxZ;
    return this;
  }
}
