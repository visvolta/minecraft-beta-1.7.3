import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import { nbt, type NbtCompound, type NbtTag } from '../../nbt/Nbt';
import { LivingEntity } from '../living/LivingEntity';
import { SlimeModel } from './models/SlimeModel';
import type { Drop } from '../items/BlockDropResolver';
import type { Player } from '../../player/Player';
import { DamageSource } from '../damage/DamageSource';

/**
 * Beta 1.7.3 `EntitySlime`. Hops toward the player, deals touch damage (size > 1),
 * splits into 4 on death (size > 1), and drops slimeballs (size == 1 only).
 * Custom hop AI — no A* pathfinding. Squish animation drives the model scale.
 *
 * Size: 1 (0.6×0.6, h1), 2 (1.2×1.2, h4), 4 (2.4×2.4, h16).
 * NBT stores "Size" = slimeSize - 1 (0/1/3).
 */
export class SlimeEntity extends LivingEntity {
  public readonly typeId = EntityTypeIds.Slime;
  public readonly typeStringId = 'Slime';
  public override get isHostileMob(): boolean { return true; }

  private slimeSize = 1;
  private slimeJumpDelay = 0;
  /** Squish animation state (Beta `squishAmount`/`squishFactor`). */
  public squishAmount = 0;
  public squishFactor = 0;
  private wasOnGround = false;
  private model: SlimeModel | null = null;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number, size = 1) {
    super(ctx);
    this.slimeJumpDelay = this.nextInt(20) + 10;
    this.setSlimeSize(size);
    this.setPosition(x, y, z);
    this.yOffset = 0;
    this.rebuildModel();
  }

  public getSlimeSize(): number { return this.slimeSize; }

  public setSlimeSize(size: number): void {
    this.slimeSize = size;
    this.setSize(0.6 * size, 0.6 * size);
    this.maxHealth = size * size;
    this.health = size * size;
  }

  public override onTick(ctx: EntityTickContext): void {
    this.squishFactor = this.squishAmount;

    this.wasOnGround = this.onGround;
    super.onTick(ctx);

    // Landing detection.
    if (this.onGround && !this.wasOnGround) {
      if (this.slimeSize > 2) {
        this.emitSound('mob.slime', 'ambient', 0.6, ((this.nextFloat() - this.nextFloat()) * 0.2 + 1) / 0.8);
      }
      this.squishAmount = -0.5;
    }
    this.squishAmount *= 0.6;

    // Hop AI (Beta updatePlayerActionState).
    const player = this.ctx.player;
    let nearestPlayer: Player | null = null;
    if (player !== undefined && player.isAlive()) {
      const dx = player.position.x - this.position.x;
      const dy = player.position.y - this.position.y;
      const dz = player.position.z - this.position.z;
      if (dx * dx + dy * dy + dz * dz < 256) nearestPlayer = player; // 16 blocks
    }

    if (nearestPlayer) {
      const fdx = nearestPlayer.position.x - this.position.x;
      const fdz = nearestPlayer.position.z - this.position.z;
      this.yaw = Math.atan2(fdx, fdz) * 180 / Math.PI;
    }

    if (this.onGround && this.slimeJumpDelay-- <= 0) {
      this.slimeJumpDelay = this.nextInt(20) + 10;
      if (nearestPlayer) { this.slimeJumpDelay = Math.floor(this.slimeJumpDelay / 3); }
      this.isJumping = true;
      if (this.slimeSize > 1) {
        this.emitSound('mob.slime', 'ambient', 0.6, ((this.nextFloat() - this.nextFloat()) * 0.2 + 1) * 0.8);
      }
      this.squishAmount = 1;
      this.moveStrafing = 1 - this.nextFloat() * 2;
      this.moveForward = this.slimeSize;
    } else {
      this.isJumping = false;
      if (this.onGround) { this.moveStrafing = 0; this.moveForward = 0; }
    }

    // Touch damage (Beta onCollideWithPlayer).
    if (nearestPlayer && this.slimeSize > 1) {
      const dx = nearestPlayer.position.x - this.position.x;
      const dy = nearestPlayer.position.y - this.position.y;
      const dz = nearestPlayer.position.z - this.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 0.6 * this.slimeSize) {
        
        nearestPlayer.attackEntityFrom(DamageSource.mob(this), this.slimeSize);
        this.emitSound('mob.slimeattack', 'attack', 1, (this.nextFloat() - this.nextFloat()) * 0.2 + 1);
      }
    }
  }

  /** Beta `setEntityDead`: split into 4 smaller slimes. */
  protected override onDeath(source: DamageSource): void {
    super.onDeath(source);
    if (this.slimeSize > 1 && this.health <= 0) {
      const childSize = Math.floor(this.slimeSize / 2);
      for (let i = 0; i < 4; i++) {
        const ox = ((i % 2) - 0.5) * this.slimeSize / 4;
        const oz = (Math.floor(i / 2) - 0.5) * this.slimeSize / 4;
        const child = new SlimeEntity(this.ctx, this.position.x + ox, this.position.y + 0.5, this.position.z + oz, childSize);
        child.yaw = this.nextFloat() * 360;
        this.ctx.manager.add(child);
      }
    }
  }

  protected override getDropItems(): Drop[] {
    return this.slimeSize === 1 ? [{ type: 'item', id: 'slimeball', count: 1, metadata: 0 }] : [];
  }

  protected override getHurtSoundId(): string { return 'mob.slime'; }
  protected override getDeathSoundId(): string { return 'mob.slime'; }
  protected override getSoundVolume(): number { return 0.6; }

  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha);
    if (this.model) {
      const interpolatedSquish = this.squishFactor + (this.squishAmount - this.squishFactor) * alpha;
      this.model.updateSquish(interpolatedSquish, this.slimeSize);
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
    this.setSlimeSize((sizeTag?.type === 'int' || sizeTag?.type === 'short' || sizeTag?.type === 'byte') ? sizeTag.value + 1 : 1);
  }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): SlimeEntity {
    const e = new SlimeEntity(ctx, 0, 0, 0);
    e.readFromNbt(data);
    e.rebuildModel();
    return e;
  }
}
