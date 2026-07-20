import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { BlockBehaviourRegistry } from '../../world/BlockBehaviour';
import { getBlockBounds } from '../../world/BlockBehaviour';
import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import { CHUNK_SIZE_Y } from '../../world/chunkConstants';
import { PathPoint } from './PathPoint';
import { PathEntity } from './PathEntity';

/**
 * A binary min-heap of path nodes ordered by estimated total cost
 * `f = totalPathDistance + distanceToTarget` (Beta's `Path`). Maintains each
 * node's `index` so an existing entry can be re-prioritised when a cheaper
 * route is found.
 */
class OpenHeap {
  private readonly nodes: PathPoint[] = [];

  public get size(): number {
    return this.nodes.length;
  }

  private static f(node: PathPoint): number {
    return node.totalPathDistance + node.distanceToTarget;
  }

  public push(node: PathPoint): void {
    node.index = this.nodes.length;
    this.nodes.push(node);
    this.bubbleUp(node.index);
  }

  public pop(): PathPoint | undefined {
    if (this.nodes.length === 0) {
      return undefined;
    }
    const top = this.nodes[0]!;
    const last = this.nodes.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = last;
      last.index = 0;
      this.bubbleDown(0);
    }
    top.index = -1;
    return top;
  }

  /** Re-asserts heap order after a node's cost decreased. */
  public update(node: PathPoint): void {
    this.bubbleUp(node.index);
  }

  private bubbleUp(index: number): void {
    const node = this.nodes[index]!;
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = this.nodes[parentIndex]!;
      if (OpenHeap.f(node) >= OpenHeap.f(parent)) {
        break;
      }
      this.nodes[index] = parent;
      parent.index = index;
      index = parentIndex;
    }
    this.nodes[index] = node;
    node.index = index;
  }

  private bubbleDown(index: number): void {
    const node = this.nodes[index]!;
    const count = this.nodes.length;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < count && OpenHeap.f(this.nodes[left]!) < OpenHeap.f(this.nodes[smallest]!)) {
        smallest = left;
      }
      if (right < count && OpenHeap.f(this.nodes[right]!) < OpenHeap.f(this.nodes[smallest]!)) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }
      const child = this.nodes[smallest]!;
      this.nodes[index] = child;
      child.index = index;
      index = smallest;
    }
    this.nodes[index] = node;
    node.index = index;
  }
}

export interface PathRequest {
  /** Entity footprint in blocks. */
  readonly width: number;
  readonly height: number;
  /** Maximum blocks the entity can step up without jumping. */
  readonly stepHeight: number;
  /** Maximum blocks the entity is willing to drop. */
  readonly maxFall: number;
  /** Search radius from the start, in blocks. */
  readonly maxDistance: number;
  /** Hard cap on nodes explored (keeps pathfinding bounded). */
  readonly maxNodes: number;
}

const DEFAULT_REQUEST: PathRequest = {
  width: 0.9,
  height: 0.9,
  stepHeight: 1,
  maxFall: 3,
  maxDistance: 16,
  maxNodes: 256,
};

const CARDINAL: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Grid-based A* pathfinder (Beta `Pathfinder`).
 *
 * - Operates on integer feet-cell nodes over 4-cardinal moves.
 * - Collision is metadata-aware via `getBlockBounds(..., 'collision')`, so
 *   non-full blocks (slabs, doors…) are respected.
 * - Honours step-height (up) and a fall limit (down); will not route off high
 *   drops.
 * - Bounded by both a search radius and a node budget.
 * - Never generates/loads chunks: unloaded columns are treated as impassable,
 *   keeping paths within already-streamed terrain (chunk-boundary safe).
 */
export class Pathfinder {
  public constructor(
    private readonly blockRegistry: BlockRegistry,
    private readonly behaviourRegistry: BlockBehaviourRegistry,
    private readonly world: BlockUpdateWorld,
  ) {}

  /** Finds a path from `start` to `target` (feet positions), or undefined. */
  public createPath(
    start: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    request: Partial<PathRequest> = {},
  ): PathEntity | undefined {
    const opts: PathRequest = { ...DEFAULT_REQUEST, ...request };

    const startX = Math.floor(start.x);
    const startY = Math.floor(start.y);
    const startZ = Math.floor(start.z);
    const targetX = Math.floor(target.x);
    const targetY = Math.floor(target.y);
    const targetZ = Math.floor(target.z);

    const pointMap = new Map<number, PathPoint>();
    const closed = new Set<number>();
    const open = new OpenHeap();

    const openPoint = (x: number, y: number, z: number): PathPoint => {
      const hash = PathPoint.hash(x, y, z);
      let point = pointMap.get(hash);
      if (point === undefined) {
        point = new PathPoint(x, y, z);
        pointMap.set(hash, point);
      }
      return point;
    };

    const targetPoint = new PathPoint(targetX, targetY, targetZ);

    const startNode = openPoint(startX, startY, startZ);
    startNode.totalPathDistance = 0;
    startNode.distanceToTarget = startNode.distanceTo(targetPoint);
    startNode.isFirst = true;
    open.push(startNode);

    let explored = 0;
    let reached: PathPoint | undefined;

    while (open.size > 0 && explored < opts.maxNodes) {
      const current = open.pop()!;
      explored += 1;

      // Reached the target column (allow a small vertical tolerance).
      if (
        current.xCoord === targetX &&
        current.zCoord === targetZ &&
        Math.abs(current.yCoord - targetY) <= 1
      ) {
        reached = current;
        break;
      }

      closed.add(current.hashCode);

      for (const [dx, dz] of CARDINAL) {
        const nx = current.xCoord + dx;
        const nz = current.zCoord + dz;

        // Stay within the search radius (Euclidean, horizontal + vertical).
        const ddx = nx - startX;
        const ddz = nz - startZ;
        if (Math.sqrt(ddx * ddx + ddz * ddz) > opts.maxDistance) {
          continue;
        }

        const ny = this.findStandableY(nx, nz, current.yCoord, opts);
        if (ny === undefined) {
          continue;
        }

        const neighbour = openPoint(nx, ny, nz);
        if (closed.has(neighbour.hashCode)) {
          continue;
        }

        const tentativeG = current.totalPathDistance + current.distanceTo(neighbour);
        if (!neighbour.isAssigned() || tentativeG < neighbour.totalPathDistance) {
          neighbour.previous = current;
          neighbour.totalPathDistance = tentativeG;
          neighbour.distanceToNext = current.distanceTo(neighbour);
          neighbour.distanceToTarget = neighbour.distanceTo(targetPoint);
          if (neighbour.isAssigned()) {
            open.update(neighbour);
          } else {
            open.push(neighbour);
          }
        }
      }
    }

    if (reached === undefined) {
      return undefined;
    }
    return this.buildPath(reached);
  }

  private buildPath(end: PathPoint): PathEntity {
    const points: PathPoint[] = [];
    let node: PathPoint | null = end;
    while (node !== null) {
      points.push(node);
      node = node.previous;
    }
    points.reverse();
    return new PathEntity(points);
  }

  /**
   * Finds a standable feet-Y in column `(x, z)` near `fromY`, allowing step-up
   * and fall within the request limits. Prefers level, then small steps up,
   * then small drops. Returns undefined if the column is unloaded or has no
   * valid standing position.
   */
  private findStandableY(x: number, z: number, fromY: number, opts: PathRequest): number | undefined {
    // Chunk-boundary safety: never path into unloaded terrain.
    if (!this.world.isLoaded(x, z)) {
      return undefined;
    }

    const candidates: number[] = [0];
    const limit = Math.max(opts.stepHeight, opts.maxFall);
    for (let d = 1; d <= limit; d++) {
      if (d <= opts.stepHeight) {
        candidates.push(d);
      }
      if (d <= opts.maxFall) {
        candidates.push(-d);
      }
    }

    for (const dy of candidates) {
      const y = fromY + dy;
      if (this.canStand(x, y, z, opts)) {
        return y;
      }
    }
    return undefined;
  }

  /** True if an entity can stand with feet at `(x, y, z)`. */
  private canStand(x: number, y: number, z: number, opts: PathRequest): boolean {
    if (y < 1 || y >= CHUNK_SIZE_Y) {
      return false;
    }
    // Needs solid ground beneath the feet.
    if (!this.cellSolid(x, y - 1, z)) {
      return false;
    }
    // Body cells (feet up to head) must be clear.
    const headCells = Math.max(1, Math.ceil(opts.height));
    for (let i = 0; i < headCells; i++) {
      if (this.cellSolid(x, y + i, z)) {
        return false;
      }
    }
    return true;
  }

  /** True if the block at `(x, y, z)` presents any collision geometry. */
  private cellSolid(x: number, y: number, z: number): boolean {
    if (y < 0 || y >= CHUNK_SIZE_Y) {
      return false;
    }
    return getBlockBounds(this.blockRegistry, this.behaviourRegistry, this.world, x, y, z, 'collision').length > 0;
  }
}
