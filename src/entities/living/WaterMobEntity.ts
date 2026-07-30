import type { EntityTickContext } from '../core/EntityContext';
import { LivingEntity } from './LivingEntity';

/**
 * Beta `EntityWaterMob`: a water-native entity base. No gravity in water
 * (handles own buoyancy), takes suffocation damage out of water, and falls
 * normally when removed from water.
 */
export abstract class WaterMobEntity extends LivingEntity {
  /** Ticks spent out of water; after 300 the entity takes damage (Beta air supply). */
  private airSupply = 300;

  protected override moveLiving(ctx: EntityTickContext, _strafe: number, _forward: number): void {
    // In water: gentle buoyancy, no gravity, drag-based swim.
    if (this.inWater) {
      this.velocity.y *= 0.8;
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
      ctx.world.physics.move(this);
      this.airSupply = 300;
    } else {
      // Out of water: apply gravity like a normal entity.
      this.velocity.y -= 0.08;
      if (this.velocity.y < -1.5) this.velocity.y = -1.5;
      ctx.world.physics.move(this);
      this.airSupply--;
      if (this.airSupply <= -20) {
        this.airSupply = 0;
        const { DamageSource } = require('../damage/DamageSource');
        this.attackEntityFrom(DamageSource.drown(), 1);
      }
    }
  }
}
