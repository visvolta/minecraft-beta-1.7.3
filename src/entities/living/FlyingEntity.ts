import type { EntityTickContext } from '../core/EntityContext';
import { LivingEntity } from './LivingEntity';

/** Air drag for a flying entity (Beta `EntityFlying` land branch). */
const FLYING_AIR_DRAG = 0.91;
/** Water drag for a flying entity (Beta `EntityFlying` water branch). */
const FLYING_WATER_DRAG = 0.8;
/** Lava drag for a flying entity (Beta `EntityFlying` lava branch). */
const FLYING_LAVA_DRAG = 0.5;

/**
 * Beta `EntityFlying`: a living entity that moves under its own power with no
 * gravity. Unlike `EntityMob`, the AI sets velocity directly (the Ghast nudges
 * itself toward a waypoint), so movement here only integrates velocity through
 * the shared physics mover and applies medium drag. There is no jump and no
 * fall damage; `fall` stays a no-op.
 *
 * Ground pathfinding/navigation tasks are NOT added here — flying entities do
 * their own steering. `LivingEntity` still constructs a `Navigation`, but with
 * no path queued it is inert.
 */
export abstract class FlyingEntity extends LivingEntity {
  protected override moveLiving(ctx: EntityTickContext, _strafe: number, _forward: number): void {
    // Gravity is never applied: the AI owns vertical motion. Only the medium
    // drag from Beta `moveEntityWithHeading` is reproduced.
    ctx.world.physics.move(this);
    const drag = this.inWater ? FLYING_WATER_DRAG : this.inLava ? FLYING_LAVA_DRAG : FLYING_AIR_DRAG;
    this.velocity.x *= drag;
    this.velocity.y *= drag;
    this.velocity.z *= drag;
    this.fallDistance = 0;
  }
}
