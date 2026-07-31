import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import { nbt, type NbtCompound, type NbtTag } from '../../nbt/Nbt';
import { DamageSource } from '../damage/DamageSource';
import { AnimalEntity } from './AnimalEntity';
import type { LivingEntity } from './LivingEntity';
import { WolfModel } from './WolfModel';
import { Player } from '../../player/Player';
import type { Entity } from '../core/Entity';
import type { Drop } from '../items/BlockDropResolver';
import { wrapDegrees } from './LivingAnimationMath';
import { applyEntityModelVisualState } from '../../rendering/LivingRenderTransform';
import { WanderTask } from '../ai/tasks/WanderTask';
import { LookAtPlayerTask } from '../ai/tasks/LookAtPlayerTask';
import { IdleLookTask } from '../ai/tasks/IdleLookTask';
import { ArrowEntity } from '../projectiles/ArrowEntity';
import { Difficulty } from '../../world/Difficulty';

/** Hurt-flash duration (matches LivingEntity.MAX_HURT_TIME). */
const MAX_HURT_TIME = 10;

/**
 * Beta 1.7.3 `EntityWolf`. Wild health=8, tamed health=20, moveSpeed=0.3
 * (Beta's `moveSpeed = 1.1F` is the EntityCreature path-speed multiplier; in
 * our absolute blocks/tick convention 0.3 yields Beta-observable walk speed).
 *
 * Wild wolves are neutral: they do not chase the player unless attacked
 * (wolf-anger pack-aggro). Tamed wolves follow their owner and defend them.
 *
 * Breeding is out of scope; minimal bone-taming and sit/stand interactions work.
 */
export class WolfEntity extends AnimalEntity {
  public readonly typeId = EntityTypeIds.Wolf;
  public readonly typeStringId = 'Wolf';

  // Breeding stubs (out of scope for this project).
  public get breedingItemId(): string { return ''; }
  protected createChild(x: number, y: number, z: number): AnimalEntity { return new WolfEntity(this.ctx, x, y, z); }

  // Data-watcher flags (byte 16 bits): bit0=sitting, bit1=angry, bit2=tamed.
  private isTamed = false;
  private isAngry = false;
  private isSitting = false;
  private ownerName = '';
  private looksWithInterest = false;
  private headRotationCourse = 0;
  private prevHeadRotationCourse = 0;
  private isWolfShaking = false;
  private fieldShaking = false;
  private timeWolfIsShaking = 0;
  private prevTimeWolfIsShaking = 0;

  /** Tamed wolf attack target (set when owner is attacked / owner attacks). */
  public target: LivingEntity | Player | null = null;
  private model: WolfModel | null = null;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx);
    this.setSize(0.8, 0.8);
    this.maxHealth = 8;
    this.health = 8;
    this.moveSpeed = 0.3;
    // Wolves don't breed/tempt in b1.7.3; add Wander + LookAtPlayer + IdleLook.
    this.aiController.addTask(new WanderTask());
    this.aiController.addTask(new LookAtPlayerTask());
    this.aiController.addTask(new IdleLookTask());
    this.setPosition(x, y, z);
    this.rebuildModel();
  }

  public get wolfTamed(): boolean { return this.isTamed; }
  public get wolfAngry(): boolean { return this.isAngry; }
  public get wolfSitting(): boolean { return this.isSitting; }
  public get owner(): string { return this.ownerName; }

  public setWolfTamed(tamed: boolean): void { this.isTamed = tamed; }
  public setWolfAngry(angry: boolean): void { this.isAngry = angry; }
  public setWolfSitting(sitting: boolean): void {
    this.isSitting = sitting;
    if (sitting) {
      this.navigation.clearPath();
      this.isJumping = false;
    }
  }
  public setWolfOwner(name: string): void { this.ownerName = name; }

  /** Beta `isMovementCeased`: sitting OR mid-shake locks movement. */
  private get movementCeased(): boolean {
    return this.isSitting || this.fieldShaking;
  }

  /**
   * Beta `attackEntityFrom`:
   *  - Non-player, non-arrow damage is halved.
   *  - Non-tamed wolves become angry at the attacker; nearby non-tamed pack
   *    members within a 16/4/16 box without existing target also aggro.
   *  - Tamed wolves set their playerToAttack to the attacker (owner defense).
   */
  public override attackEntityFrom(source: DamageSource, amount: number): boolean {
    let adjAmount = amount;
    const attacker = source.attacker as Entity | null;
    if (attacker !== null && !(attacker instanceof Player) && !(attacker instanceof ArrowEntity)) {
      adjAmount = Math.floor((adjAmount + 1) / 2);
    }

    this.setWolfSitting(false);

    if (!super.attackEntityFrom(source, adjAmount)) return false;

    let aggro: Entity | null = attacker;
    if (aggro instanceof ArrowEntity) {
      const owner = aggro.owner;
      if (owner !== null && owner !== undefined) aggro = owner as Entity;
    }

    if (!this.isTamed) {
      if (!this.isAngry) {
        if (aggro instanceof Player) {
          this.setWolfAngry(true);
          this.target = aggro;
        }
        if (aggro !== null) {
          // Pack anger: non-tamed wolves within 16/4/16 without target.
          const box = this.getAABB().expand(16, 4, 16);
          for (const wolf of this.ctx.manager.getEntitiesInAABB(box, (e): e is WolfEntity =>
            e instanceof WolfEntity && e !== this && !e.wolfTamed && e.target === null)) {
            if (aggro instanceof Player) wolf.setWolfAngry(true);
            wolf.target = aggro as LivingEntity | Player;
          }
        }
      }
    } else if (aggro !== this && aggro !== null && aggro !== undefined) {
      // Tamed wolves never attack their owner; single-player treats 'player' as owner.
      if (aggro instanceof Player && (this.ownerName === '' || this.ownerName === 'player')) {
        return true;
      }
      if (aggro instanceof Player || this.isLivingEntity(aggro)) {
        this.target = aggro as LivingEntity | Player;
      }
    }
    return true;
  }

  /** Bone-tame success path (consumed by AnimalInteractionService after 1/3 chance). */
  public tame(ownerName: string): void {
    this.isTamed = true;
    this.ownerName = ownerName;
    this.setWolfAngry(false);
    this.setWolfSitting(true);
    this.target = null;
    this.maxHealth = 20;
    this.health = 20;
    this.navigation.clearPath();
    this.rebuildModel();
  }

  /** Particle placeholders for Wave 4. */
  public setSmokeAfterFail(): void { /* smoke particles deferred */ }
  public setHeartsAfterTame(): void { /* heart particles deferred */ }

  public clearTarget(): void { this.target = null; }

  public toggleSitting(): void {
    this.setWolfSitting(!this.isSitting);
  }

  public override onTick(ctx: EntityTickContext): void {
    if ((this.ctx.difficulty?.() ?? Difficulty.Normal) === Difficulty.Peaceful && !this.isTamed) {
      this.setWolfAngry(false);
      this.clearTarget();
    }

    // ---- looksWithInterest head-tilt ----
    this.prevHeadRotationCourse = this.headRotationCourse;
    this.looksWithInterest = false;
    if (this.target === null && !this.navigation.hasPath() && !this.isTamed) {
      const player = this.ctx.player;
      if (player !== undefined && player.isAlive()) {
        const held = this.ctx.playerHeldItemId?.();
        if (held === 'bone') {
          const dx = player.position.x - this.position.x;
          const dz = player.position.z - this.position.z;
          if (dx*dx + dz*dz < 64) this.looksWithInterest = true;
        }
      }
    }
    if (this.looksWithInterest) {
      this.headRotationCourse += (1 - this.headRotationCourse) * 0.4;
    } else {
      this.headRotationCourse += (0 - this.headRotationCourse) * 0.4;
    }

    // ---- Wet shaking ----
    this.updateShaking();

    if (!this.movementCeased) {
      if (this.isTamed) {
        this.updateTamedAi();
      } else {
        this.updateWildAi();
      }
    } else {
      this.moveStrafing = 0;
      this.moveForward = 0;
      this.isJumping = false;
      this.navigation.clearPath();
    }

    if (this.inWater) this.setWolfSitting(false);

    super.onTick(ctx);
  }

  /** Beta tamed wolf AI: follow owner, path when >5 away, teleport when no path and >12 away. */
  private updateTamedAi(): void {
    if (this.target !== null) {
      this.pursueTarget();
      return;
    }
    const owner = this.findOwnerPlayer();
    if (owner === null) {
      if (!this.inWater) this.setWolfSitting(true);
      return;
    }
    const dx = owner.position.x - this.position.x;
    const dz = owner.position.z - this.position.z;
    const distSq = dx*dx + dz*dz;
    if (distSq > 25) {
      if (!this.navigation.hasPath()) {
        this.navigation.moveTo(this, owner.position);
      }
      if (distSq > 144 && !this.navigation.hasPath()) {
        this.tryTeleportToOwner(owner);
      }
    } else if (distSq < 9) {
      this.moveStrafing = 0;
      this.moveForward = 0;
      this.navigation.clearPath();
    }
  }

  /** Wild wolf: angry → chase target; idle → occasional sheep hunt. */
  private updateWildAi(): void {
    if (this.isAngry) {
      if (this.target === null || !this.isTargetAlive()) {
        const player = this.ctx.player;
        if (player !== undefined && player.isAlive()) this.target = player;
      }
      if (this.target !== null) this.pursueTarget();
    } else {
      if (this.target === null && this.nextInt(100) === 0) {
        const box = this.getAABB().expand(16, 4, 16);
        const sheep = this.ctx.manager.getEntitiesInAABB(box,
          (e): e is LivingEntity => e.typeStringId === 'Sheep' && (e as LivingEntity).isAlive());
        if (sheep.length > 0) this.target = sheep[this.nextInt(sheep.length)]!;
      }
      if (this.target !== null) this.pursueTarget();
    }
  }

  /** Pursues current target via path + Beta leap attack. */
  private pursueTarget(): void {
    const t = this.target;
    if (t === null) return;
    if (!this.isTargetAlive()) { this.target = null; return; }
    const dx = t.position.x - this.position.x;
    const dz = t.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.yaw = Math.atan2(dx, dz) * 180 / Math.PI;
    this.setHeadLookIntent(this.yaw);
    if (!this.navigation.hasPath()) this.navigation.moveTo(this, t.position);
    if (dist > 2 && dist < 6 && this.onGround && this.nextInt(10) === 0) {
      const inv = 1 / Math.max(dist, 0.001);
      this.velocity.x = dx * inv * 0.5 * 0.8 + this.velocity.x * 0.2;
      this.velocity.z = dz * inv * 0.5 * 0.8 + this.velocity.z * 0.2;
      this.velocity.y = 0.4;
    } else if (dist < 1.5 && this.attackTime <= 0) {
      const myBox = this.getAABB();
      const theirBox = t.getAABB();
      if (theirBox.maxY > myBox.minY && theirBox.minY < myBox.maxY) {
        this.attackTime = 20;
        const dmg = this.isTamed ? 4 : 2;
        if (t instanceof Player) {
          t.attackFromMob(dmg, this);
        } else {
          (t as LivingEntity).attackEntityFrom(DamageSource.mob(this), dmg);
        }
      }
    }
  }

  private isTargetAlive(): boolean {
    const t = this.target;
    if (t === null) return false;
    if (t instanceof Player) return t.isAlive();
    return (t as LivingEntity).isAlive();
  }

  /** Beta `getPathOrWalkableBlock` teleport search: 5×5×3 around owner. */
  private tryTeleportToOwner(owner: Player): void {
    const ox = Math.floor(owner.position.x) - 2;
    const oz = Math.floor(owner.position.z) - 2;
    const feetY = Math.floor(owner.position.y) - 1;
    for (let dxi = 0; dxi <= 4; dxi++) {
      for (let dzi = 0; dzi <= 4; dzi++) {
        if (dxi >= 1 && dzi >= 1 && dxi <= 3 && dzi <= 3) continue; // outer ring only
        for (let dyi = -1; dyi <= 1; dyi++) {
          const tx = ox + dxi, ty = feetY + dyi, tz = oz + dzi;
          if (this.isValidTeleportSpot(tx, ty, tz)) {
            this.setPosition(tx + 0.5, ty, tz + 0.5);
            this.velocity.x = 0; this.velocity.y = 0; this.velocity.z = 0;
            this.navigation.clearPath();
            return;
          }
        }
      }
    }
  }

  private isValidTeleportSpot(bx: number, by: number, bz: number): boolean {
    const world = this.ctx.blockUpdateWorld;
    const reg = this.ctx.blockRegistry;
    const below = reg.getById(world.getBlock(bx, by - 1, bz));
    const at = reg.getById(world.getBlock(bx, by, bz));
    const above = reg.getById(world.getBlock(bx, by + 1, bz));
    if (!below?.solid) return false;
    if (at?.solid || at?.isLiquid) return false;
    if (above?.solid || above?.isLiquid) return false;
    return true;
  }

  private findOwnerPlayer(): Player | null {
    const p = this.ctx.player;
    if (p === undefined || !p.isAlive()) return null;
    if (this.isOwnerPlayer()) return p;
    return null;
  }

  private isOwnerPlayer(): boolean {
    return this.ownerName === '' || this.ownerName === 'player';
  }

  private isLivingEntity(e: Entity): e is LivingEntity {
    return 'isAlive' in e && typeof (e as LivingEntity).isAlive === 'function' && 'health' in e;
  }

  /** Beta wet-shake state machine. */
  private updateShaking(): void {
    if (this.isWet()) {
      this.isWolfShaking = true;
      this.fieldShaking = false;
      this.timeWolfIsShaking = 0;
      this.prevTimeWolfIsShaking = 0;
    } else if ((this.isWolfShaking || this.fieldShaking) && this.fieldShaking) {
      if (this.timeWolfIsShaking === 0) {
        this.emitSound('mob.wolf.shake', 'ambient', this.getSoundVolume(),
          (this.nextFloat() - this.nextFloat()) * 0.2 + 1);
      }
      this.prevTimeWolfIsShaking = this.timeWolfIsShaking;
      this.timeWolfIsShaking += 0.05;
      if (this.prevTimeWolfIsShaking >= 2) {
        this.isWolfShaking = false;
        this.fieldShaking = false;
        this.prevTimeWolfIsShaking = 0;
        this.timeWolfIsShaking = 0;
      }
    }
    if (this.isWolfShaking && !this.fieldShaking && !this.navigation.hasPath() && this.onGround) {
      this.fieldShaking = true;
      this.timeWolfIsShaking = 0;
      this.prevTimeWolfIsShaking = 0;
    }
  }

  private isWet(): boolean { return this.inWater; }

  public getCombatDamage(): number { return this.isTamed ? 4 : 2; }

  protected override getDropItems(): Drop[] { return []; }

  protected override getAmbientSoundId(): string {
    if (this.isAngry) return 'mob.wolfgrowl';
    if (this.nextInt(3) === 0) {
      if (this.isTamed && this.health < 10) return 'mob.wolf.whine';
      return 'mob.wolf.panting';
    }
    return 'mob.wolf';
  }
  protected override getHurtSoundId(): string { return 'mob.wolfhurt'; }
  protected override getDeathSoundId(): string { return 'mob.wolfdeath'; }
  protected override getSoundVolume(): number { return 0.4; }

  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha);
    const model = this.model;
    if (model === null) return;

    const legYaw = this.prevLegYaw + (this.legYaw - this.prevLegYaw) * alpha;
    const bodyYaw = this.prevRenderYawOffset + wrapDegrees(this.renderYawOffset - this.prevRenderYawOffset) * alpha;
    const headYaw = this.prevHeadYaw + wrapDegrees(this.headYaw - this.prevHeadYaw) * alpha;
    const headPitch = this.prevHeadPitch + (this.headPitch - this.prevHeadPitch) * alpha;
    const interestedAngle = (this.prevHeadRotationCourse + (this.headRotationCourse - this.prevHeadRotationCourse) * alpha) * 0.15 * Math.PI;
    const tailAngle = this.isAngry ? 1.5393804 : this.isTamed
      ? (0.55 - (20 - this.health) * 0.02) * Math.PI
      : 0.62831855;
    const headRelYaw = wrapDegrees(headYaw - bodyYaw) * (Math.PI / 180) + interestedAngle;
    const headPitchRad = headPitch * (Math.PI / 180);

    model.updatePose(
      this.isTamed,
      this.isAngry,
      this.isSitting,
      legYaw,
      this.legSwing,
      headRelYaw,
      headPitchRad,
      tailAngle,
      this.timeWolfIsShaking,
      this.prevTimeWolfIsShaking,
    );

    applyEntityModelVisualState(model, model.pose, {
      hurtTime: this.hurtTime,
      maxHurtTime: this.maxHurtTime > 0 ? this.maxHurtTime : MAX_HURT_TIME,
      dead: this.isDead(),
      deathTime: this.deathTime,
    });
  }

  protected rebuildModel(): void {
    this.model?.dispose();
    this.model = new WolfModel(
      this.ctx.entityTextures?.get('wolf'),
      this.ctx.entityTextures?.get('wolfTame'),
      this.ctx.entityTextures?.get('wolfAngry'),
      this.ctx.entityTextures?.get('wolfCollar'),
    );
    this.renderObject = this.model.root; this.ctx.scene.add(this.model.root);
  }
  protected override disposeRender(): void { this.model?.dispose(); this.model = null; }
  public override onRestore(): void { this.rebuildModel(); }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    this.writeLivingNbt(map);
    map.set('Owner', nbt.string(this.ownerName));
    map.set('Angry', nbt.byte(this.isAngry ? 1 : 0));
    map.set('Sitting', nbt.byte(this.isSitting ? 1 : 0));
    map.set('Tamed', nbt.byte(this.isTamed ? 1 : 0));
  }
  protected readEntityNbt(data: NbtCompound): void {
    this.readLivingNbt(data);
    const owner = data.value.get('Owner'); this.ownerName = owner?.type === 'string' ? owner.value : '';
    const angry = data.value.get('Angry'); this.isAngry = angry?.type === 'byte' ? angry.value !== 0 : false;
    const sitting = data.value.get('Sitting'); this.isSitting = sitting?.type === 'byte' ? sitting.value !== 0 : false;
    const tamed = data.value.get('Tamed');
    if (tamed?.type === 'byte' && tamed.value !== 0) {
      this.isTamed = true; this.maxHealth = 20;
    } else {
      this.maxHealth = 8;
    }
    this.target = null;
    this.rebuildModel();
  }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): WolfEntity {
    const e = new WolfEntity(ctx, 0, 0, 0); e.readFromNbt(data); return e;
  }
}
