import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import { nbt, type NbtCompound, type NbtTag } from '../../nbt/Nbt';
import { LivingEntity } from '../living/LivingEntity';
import { SlimeModel } from './models/SlimeModel';
import type { Drop } from '../items/BlockDropResolver';
import type { Player } from '../../player/Player';
import { applyEntityModelVisualState } from '../../rendering/LivingRenderTransform';
import { Difficulty } from '../../world/Difficulty';

/** Hurt-flash duration (matches LivingEntity.MAX_HURT_TIME). */
const MAX_HURT_TIME = 10;

/**
 * Beta 1.7.3 `EntitySlime` (verbatim constants and logic).
 *
 * Size at spawn = 1 << rand.nextInt(3) → 1, 2, or 4.
 * setSize(0.6*size, 0.6*size); health = size*size; yOffset = 0.
 * NBT "Size" stores runtimeSize - 1.
 *
 * Custom hop AI — no A* pathfinding. Squish animation drives model scale.
 * On death (size > 1) splits into EXACTLY 4 children of size/2.
 * Drops slimeballs only at size == 1.
 */
export class SlimeEntity extends LivingEntity {
  public readonly typeId = EntityTypeIds.Slime;
  public readonly typeStringId = 'Slime';
  public override get isHostileMob(): boolean { return true; }

  private slimeSize = 1;
  private slimeJumpDelay = 0;
  public squishAmount = 0;
  public squishFactor = 0;
  /** Guards against double-split if split is attempted more than once. */
  private hasSplitOnDeath = false;
  private model: SlimeModel | null = null;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number, size?: number) {
    super(ctx);
    this.yOffset = 0.0;
    this.slimeJumpDelay = this.nextInt(20) + 10;
    // Beta: int size = 1 << this.rand.nextInt(3);
    const rolledSize = size ?? (1 << this.nextInt(3));
    this.setSlimeSize(rolledSize);
    this.setPosition(x, y, z);
    this.rebuildModel();
  }

  public getSlimeSize(): number { return this.slimeSize; }

  /** Beta `setSlimeSize`: updates DW object 16, resizes, sets health = size*size, re-anchors. */
  public setSlimeSize(size: number): void {
    this.slimeSize = size;
    this.setSize(0.6 * size, 0.6 * size);
    this.maxHealth = size * size;
    this.health = size * size;
    this.yOffset = 0.0;
    this.setPosition(this.position.x, this.position.y, this.position.z);
  }

  public override onTick(ctx: EntityTickContext): void {
    if ((this.ctx.difficulty?.() ?? Difficulty.Normal) === Difficulty.Peaceful && this.slimeSize > 1) {
      this.markRemoved();
      return;
    }

    this.squishFactor = this.squishAmount;
    const wasOnGround = this.onGround;

    super.onTick(ctx);

    // Beta onUpdate landing detection.
    if (this.onGround && !wasOnGround) {
      const s = this.slimeSize;
      // Slime particles deferred to Wave 4 (s*8 particles around minY).
      if (s > 2) {
        this.emitSound('mob.slime', 'ambient', this.getSoundVolume(),
          ((this.nextFloat() - this.nextFloat()) * 0.2 + 1) / 0.8);
      }
      this.squishAmount = -0.5;
    }
    this.squishAmount *= 0.6;

    // ---- Hop AI (Beta updatePlayerActionState) ----
    const player = this.findClosestPlayer(16);
    if (player !== null) this.faceEntity(player, 10, 20);

    if (this.onGround && this.slimeJumpDelay-- <= 0) {
      this.slimeJumpDelay = this.nextInt(20) + 10;
      if (player !== null) this.slimeJumpDelay = Math.floor(this.slimeJumpDelay / 3);
      this.isJumping = true;
      if (this.slimeSize > 1) {
        this.emitSound('mob.slime', 'ambient', this.getSoundVolume(),
          ((this.nextFloat() - this.nextFloat()) * 0.2 + 1) * 0.8);
      }
      this.squishAmount = 1.0;
      this.moveStrafing = 1.0 - this.nextFloat() * 2.0;
      this.moveForward = this.slimeSize;
    } else {
      this.isJumping = false;
      if (this.onGround) { this.moveStrafing = 0; this.moveForward = 0; }
    }

    // Touch damage (Beta onCollideWithPlayer).
    if (player !== null && this.slimeSize > 1) {
      const dx = player.position.x - this.position.x;
      const dz = player.position.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6 * this.slimeSize && this.canEntityBeSeen(player)) {
        if (player.attackFromMob(this.slimeSize, this)) {
          this.emitSound('mob.slimeattack', 'attack', 1.0,
            (this.nextFloat() - this.nextFloat()) * 0.2 + 1);
        }
      }
    }
  }

  /** Beta `setEntityDead`: always creates exactly 4 children for size > 1. */
  public override markRemoved(): void {
    if (this.health <= 0 && this.slimeSize > 1 && !this.hasSplitOnDeath) {
      this.hasSplitOnDeath = true;
      const childSize = Math.floor(this.slimeSize / 2);
      for (let i = 0; i < 4; i++) {
        const ox = ((i % 2) - 0.5) * this.slimeSize / 4;
        const oz = (Math.floor(i / 2) - 0.5) * this.slimeSize / 4;
        const child = new SlimeEntity(this.ctx,
          this.position.x + ox,
          this.position.y + 0.5,
          this.position.z + oz,
          childSize,
        );
        child.yaw = this.nextFloat() * 360;
        this.ctx.manager.add(child);
      }
    }
    super.markRemoved();
  }

  protected override getDropItems(): Drop[] {
    if (this.slimeSize !== 1) return [];
    const count = this.nextInt(3);
    return count > 0 ? [{ type: 'item', id: 'slimeball', count, metadata: 0 }] : [];
  }

  protected override getHurtSoundId(): string { return 'mob.slime'; }
  protected override getDeathSoundId(): string { return 'mob.slime'; }
  protected override getSoundVolume(): number { return 0.6; }

  private canEntityBeSeen(target: Player): boolean {
    const world = this.ctx.blockUpdateWorld;
    const reg = this.ctx.blockRegistry;
    if (!world || !reg) return true;
    const dx = target.position.x - this.position.x;
    const dy = (target.position.y + target.getEyeY()) - (this.position.y + this.getEyeHeight());
    const dz = target.position.z - this.position.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return true;
    const steps = Math.ceil(d * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const bx = Math.floor(this.position.x + dx * t);
      const by = Math.floor(this.position.y + this.getEyeHeight() + dy * t);
      const bz = Math.floor(this.position.z + dz * t);
      const def = reg.getById(world.getBlock(bx, by, bz));
      if (def?.solid) return false;
    }
    return true;
  }

  private findClosestPlayer(rangeBlocks: number): Player | null {
    const player = this.ctx.player;
    if (player === undefined || !player.isAlive()) return null;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const dz = player.position.z - this.position.z;
    if (dx*dx + dy*dy + dz*dz > rangeBlocks*rangeBlocks) return null;
    return player;
  }

  private faceEntity(target: Player, _yawSpeed: number, _pitchSpeed: number): void {
    const dx = target.position.x - this.position.x;
    const dz = target.position.z - this.position.z;
    const targetYaw = Math.atan2(dx, dz) * 180 / Math.PI;
    let diff = targetYaw - this.yaw;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    this.yaw += diff * 0.4;
  }

  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha);
    if (this.model) {
      const interpolatedSquish = this.squishFactor + (this.squishAmount - this.squishFactor) * alpha;
      this.model.updateSquish(interpolatedSquish, this.slimeSize);
      applyEntityModelVisualState(this.model, this.model.bodyGroup, {
        hurtTime: this.hurtTime,
        maxHurtTime: this.maxHurtTime > 0 ? this.maxHurtTime : MAX_HURT_TIME,
        dead: this.isDead(),
        deathTime: this.deathTime,
      });
    }
  }

  protected rebuildModel(): void {
    this.model?.dispose();
    this.model = new SlimeModel(this.ctx.entityTextures?.get('slime'));
    this.renderObject = this.model.root;
    this.ctx.scene.add(this.model.root);
  }
  protected override disposeRender(): void { this.model?.dispose(); this.model = null; }
  public override onRestore(): void { this.rebuildModel(); }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    this.writeLivingNbt(map);
    map.set('Size', nbt.int(this.slimeSize - 1));
  }
  protected readEntityNbt(data: NbtCompound): void {
    this.readLivingNbt(data);
    const sizeTag = data.value.get('Size');
    const nbtSize = (sizeTag?.type === 'int' || sizeTag?.type === 'short' || sizeTag?.type === 'byte')
      ? sizeTag.value + 1 : 1;
    this.setSlimeSize(nbtSize);
  }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): SlimeEntity {
    const e = new SlimeEntity(ctx, 0, 0, 0);
    e.readFromNbt(data);
    e.rebuildModel();
    return e;
  }
}
