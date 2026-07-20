import type { AiTask } from '../AiTask';
import { ControlFlags } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';

/** How long panic lasts (ticks). ~3 seconds. */
const PANIC_DURATION_TICKS = 60;
/** Panic speed multiplier over the entity's normal moveSpeed (a controlled run). */
const PANIC_SPEED_MULTIPLIER = 2.0;
/** Escape target distance range (blocks). */
const ESCAPE_DISTANCE_MIN = 5;
const ESCAPE_DISTANCE_SPREAD = 3;

/**
 * Passive-mob panic / run-away response (Beta animals flee after being hurt).
 *
 * Higher priority than wandering and idle-looking, so it overrides them. On a
 * full hit (`entity.recentlyHurt`), the mob picks an escape destination away
 * from its attacker (random direction for environmental damage with no
 * attacker) and runs there using the existing bounded {@link Navigation}. The
 * path is computed once and only re-picked when it finishes or the mob gets
 * stuck (Navigation throttles recomputation), never every tick. After a limited
 * duration the mob recovers to normal AI. Reusable for future passive mobs.
 *
 * No permanent fear memory or threat evaluation — just a temporary flee state.
 */
export class PanicTask implements AiTask {
  public readonly priority = 20;
  public readonly controlFlags = ControlFlags.Move | ControlFlags.Look | ControlFlags.Jump;

  private panicTicks = 0;
  private baseMoveSpeed = 0;

  public shouldStart(entity: LivingEntity): boolean {
    return entity.recentlyHurt && entity.isAlive();
  }

  public shouldContinue(entity: LivingEntity): boolean {
    return this.panicTicks > 0 && entity.isAlive();
  }

  public start(entity: LivingEntity): void {
    entity.recentlyHurt = false; // consume the trigger
    this.panicTicks = PANIC_DURATION_TICKS;
    this.baseMoveSpeed = entity.moveSpeed;
    entity.moveSpeed = this.baseMoveSpeed * PANIC_SPEED_MULTIPLIER;
    this.pickEscapeDestination(entity);
  }

  public tick(entity: LivingEntity): void {
    this.panicTicks -= 1;
    // Re-pick only when the current path is gone (reached or stuck). Navigation's
    // internal recalculation cooldown throttles this so it never runs every tick.
    if (!entity.navigation.hasPath()) {
      this.pickEscapeDestination(entity);
    }
  }

  public stop(entity: LivingEntity): void {
    entity.moveSpeed = this.baseMoveSpeed;
    entity.navigation.clearPath();
    this.panicTicks = 0;
  }

  /** Chooses a reachable escape destination away from the attacker (fallbacks included). */
  private pickEscapeDestination(entity: LivingEntity): void {
    let dirX: number;
    let dirZ: number;
    const attacker = entity.lastAttackerPosition;
    if (attacker) {
      dirX = entity.position.x - attacker.x; // away from the attacker
      dirZ = entity.position.z - attacker.z;
    } else {
      const angle = (entity.nextInt(360) * Math.PI) / 180; // environmental: random
      dirX = Math.cos(angle);
      dirZ = Math.sin(angle);
    }
    const length = Math.hypot(dirX, dirZ);
    if (length < 1e-6) {
      dirX = 1;
      dirZ = 0;
    } else {
      dirX /= length;
      dirZ /= length;
    }

    // Try a few angularly-spread destinations until one is pathable.
    for (let attempt = 0; attempt < 5; attempt++) {
      const distance = ESCAPE_DISTANCE_MIN + entity.nextInt(ESCAPE_DISTANCE_SPREAD);
      const spread = (entity.nextInt(61) - 30) * (Math.PI / 180);
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const rx = dirX * cos - dirZ * sin;
      const rz = dirX * sin + dirZ * cos;
      const targetX = entity.position.x + rx * distance;
      const targetZ = entity.position.z + rz * distance;
      if (entity.navigation.moveTo(entity, { x: targetX, y: entity.position.y, z: targetZ })) {
        return;
      }
    }
    // No pathable destination found (e.g. trapped): the mob stays put until panic expires.
  }
}
