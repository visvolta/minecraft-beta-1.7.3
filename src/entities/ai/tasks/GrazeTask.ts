import type { AiTask } from '../AiTask';
import { ControlFlags } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';
import { SheepEntity } from '../../living/SheepEntity';
import type { BlockUpdateWorld } from '../../../world/BlockUpdateWorld';
import { BlockIds } from '../../../blocks/BlockId';

/** Ticks the sheep spends eating once it reaches the grass. */
const EAT_TICKS = 40;
/** Head pitch (degrees) while grazing (head lowered toward the ground). */
const GRAZE_HEAD_PITCH = 45;
/** Horizontal search radius for a grass target (blocks). */
const SEARCH_RADIUS = 4;
/** Distance at which the sheep can eat the target grass. */
const EAT_REACH = 1.6;

/**
 * Reusable grazing task (registered only by sheep in this stage). The sheep
 * finds a nearby grass block, walks to it, lowers its head, then eats: the
 * grass block is converted to dirt through the normal block-update pipeline and
 * the fleece regrows once. Interruptible by panic/damage/hazards (those tasks
 * hold higher priority and the same control channels).
 *
 * Documented post-Beta deviation: Beta 1.7.3 sheep do not graze.
 */
export class GrazeTask implements AiTask {
  public readonly priority = 15;
  public readonly controlFlags = ControlFlags.Move | ControlFlags.Look;

  private grazeTimer = 0; // <0 approaching, >0 eating countdown, 0 idle
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;

  public constructor(private readonly world: BlockUpdateWorld) {}

  public shouldStart(entity: LivingEntity): boolean {
    if (!(entity instanceof SheepEntity) || !entity.onGround) {
      return false;
    }
    // Graze occasionally while idle.
    if (entity.nextInt(120) !== 0) {
      return false;
    }
    return this.findGrass(entity);
  }

  public shouldContinue(entity: LivingEntity): boolean {
    return this.grazeTimer !== 0 && entity.isAlive();
  }

  public start(entity: LivingEntity): void {
    // findGrass already located a target in shouldStart.
    this.grazeTimer = -1;
    entity.navigation.moveTo(entity, { x: this.targetX + 0.5, y: this.targetY + 1, z: this.targetZ + 0.5 });
  }

  public tick(entity: LivingEntity): void {
    if (this.grazeTimer < 0) {
      // Approaching: begin eating once close to a still-valid grass target.
      const near =
        Math.abs(entity.position.x - (this.targetX + 0.5)) < EAT_REACH &&
        Math.abs(entity.position.z - (this.targetZ + 0.5)) < EAT_REACH;
      if (near && this.world.getBlock(this.targetX, this.targetY, this.targetZ) === BlockIds.Grass) {
        this.grazeTimer = EAT_TICKS;
      } else if (!entity.navigation.hasPath()) {
        this.grazeTimer = 0; // cannot reach; give up
        return;
      }
    }

    if (this.grazeTimer > 0) {
      entity.headPitch = GRAZE_HEAD_PITCH;
      this.grazeTimer -= 1;
      if (this.grazeTimer === 0) {
        this.eatGrass(entity);
      }
    }
  }

  public stop(entity: LivingEntity): void {
    entity.headPitch = 0;
    entity.navigation.clearPath();
    this.grazeTimer = 0;
  }

  /** Finds a reachable grass block near the sheep; stores it as the target. */
  private findGrass(entity: LivingEntity): boolean {
    const cx = Math.floor(entity.position.x);
    const cy = Math.floor(entity.position.y);
    const cz = Math.floor(entity.position.z);
    let best = -1;
    for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
      for (let dz = -SEARCH_RADIUS; dz <= SEARCH_RADIUS; dz++) {
        for (let dy = -2; dy <= 1; dy++) {
          const x = cx + dx;
          const y = cy + dy;
          const z = cz + dz;
          if (this.world.getBlock(x, y, z) !== BlockIds.Grass) {
            continue;
          }
          const dist = dx * dx + dz * dz;
          if (best < 0 || dist < best) {
            best = dist;
            this.targetX = x;
            this.targetY = y;
            this.targetZ = z;
          }
        }
      }
    }
    return best >= 0;
  }

  /** Converts the target grass block to dirt and regrows the fleece (once). */
  private eatGrass(entity: LivingEntity): void {
    if (this.world.getBlock(this.targetX, this.targetY, this.targetZ) === BlockIds.Grass) {
      this.world.setBlock(this.targetX, this.targetY, this.targetZ, BlockIds.Dirt, {
        reason: 'world',
        notifyNeighbours: true,
        updateLighting: true,
      });
    }
    if (entity instanceof SheepEntity) {
      entity.regrowWool();
    }
  }
}
