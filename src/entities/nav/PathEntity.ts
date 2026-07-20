import type { PathPoint } from './PathPoint';

/**
 * A computed path as an ordered list of nodes (Beta `PathEntity`). A moving
 * entity walks toward `getPosition()` and advances `incrementPathIndex()` as
 * each waypoint is reached.
 */
export class PathEntity {
  private readonly points: readonly PathPoint[];
  public readonly pathLength: number;
  private pathIndex = 0;

  public constructor(points: readonly PathPoint[]) {
    this.points = points;
    this.pathLength = points.length;
  }

  public incrementPathIndex(): void {
    this.pathIndex += 1;
  }

  public isFinished(): boolean {
    return this.pathIndex >= this.points.length;
  }

  public getCurrentIndex(): number {
    return this.pathIndex;
  }

  public getFinalPoint(): PathPoint | undefined {
    return this.pathLength > 0 ? this.points[this.pathLength - 1] : undefined;
  }

  /**
   * World-space target for the current waypoint (feet position, centred on
   * the block). Beta offsets by `(int)(width + 1) * 0.5`; for sub-1-block
   * widths this is 0.5, i.e. the block centre.
   */
  public getPosition(width: number): { x: number; y: number; z: number } | undefined {
    const point = this.points[this.pathIndex];
    if (point === undefined) {
      return undefined;
    }
    const centre = Math.floor(width + 1) * 0.5;
    return {
      x: point.xCoord + centre,
      y: point.yCoord,
      z: point.zCoord + centre,
    };
  }
}
