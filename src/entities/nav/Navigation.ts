import type { Pathfinder } from './Pathfinder';
import type { PathEntity } from './PathEntity';

/**
 * The surface Navigation needs from a living entity. `LivingEntity` satisfies
 * this structurally; defining it here avoids a circular import (LivingEntity
 * owns a Navigation).
 */
export interface NavigationHost {
  readonly position: { x: number; y: number; z: number };
  width: number;
  height: number;
  stepHeight: number;
  yaw: number;
  moveForward: number;
  moveStrafing: number;
  isJumping: boolean;
  onGround: boolean;
  isCollidedHorizontally: boolean;
}

/**
 * Walks a living entity along a computed {@link PathEntity} (Beta
 * `EntityCreature` path-following). Handles waypoint advancement, heading
 * toward the current waypoint, stepping/jumping up blocks, stuck detection and
 * a recalculation cooldown so paths are not rebuilt every tick.
 */
export class Navigation {
  private path: PathEntity | null = null;
  private recalcCooldown = 0;
  private stuckTicks = 0;
  private lastX = 0;
  private lastZ = 0;

  public constructor(
    private readonly pathfinder: Pathfinder,
    private readonly maxFall = 3,
    private readonly maxSearchDistance = 16,
    /**
     * Maximum block height the *pathfinder* may route up. Decoupled from the
     * entity's physics `stepHeight` (0.5): the pathfinder still plans 1-block
     * step-ups, which the entity completes with a jump.
     */
    private readonly pathMaxStepUp = 1,
  ) {}

  /** Computes and sets a path to `target` (feet position). */
  public moveTo(host: NavigationHost, target: { x: number; y: number; z: number }): boolean {
    if (this.recalcCooldown > 0) {
      return this.path !== null;
    }
    const path = this.pathfinder.createPath(
      { x: host.position.x, y: host.position.y, z: host.position.z },
      target,
      {
        width: host.width,
        height: host.height,
        stepHeight: this.pathMaxStepUp,
        maxFall: this.maxFall,
        maxDistance: this.maxSearchDistance,
      },
    );
    this.path = path ?? null;
    this.recalcCooldown = 20;
    this.stuckTicks = 0;
    this.lastX = host.position.x;
    this.lastZ = host.position.z;
    return path !== undefined;
  }

  public hasPath(): boolean {
    return this.path !== null;
  }

  public clearPath(): void {
    this.path = null;
  }

  /** Advances along the path and steers the host for this tick. */
  public update(host: NavigationHost): void {
    if (this.recalcCooldown > 0) {
      this.recalcCooldown -= 1;
    }

    // Default: no movement intent; the active path (if any) overrides below.
    host.moveForward = 0;
    host.moveStrafing = 0;

    const path = this.path;
    if (path === null) {
      return;
    }

    // Advance past waypoints we have reached.
    let target = path.getPosition(host.width);
    while (target !== undefined && this.horizontalDistance(host, target) < 0.6) {
      path.incrementPathIndex();
      if (path.isFinished()) {
        this.path = null;
        return;
      }
      target = path.getPosition(host.width);
    }
    if (target === undefined) {
      this.path = null;
      return;
    }

    // Steer toward the current waypoint (Beta yaw convention).
    const dx = target.x - host.position.x;
    const dz = target.z - host.position.z;
    host.yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90;
    host.moveForward = 1.0;

    // Jump/step when the next waypoint is higher or we are blocked.
    const stepUp = target.y - Math.floor(host.position.y);
    if (stepUp > 0 || host.isCollidedHorizontally) {
      host.isJumping = true;
    }

    // Stuck detection: abandon the path if we barely move for too long.
    const moved = Math.hypot(host.position.x - this.lastX, host.position.z - this.lastZ);
    if (moved < 0.01) {
      this.stuckTicks += 1;
    } else {
      this.stuckTicks = 0;
    }
    this.lastX = host.position.x;
    this.lastZ = host.position.z;
    if (this.stuckTicks > 40) {
      this.path = null;
    }
  }

  private horizontalDistance(host: NavigationHost, target: { x: number; z: number }): number {
    return Math.hypot(target.x - host.position.x, target.z - host.position.z);
  }
}
