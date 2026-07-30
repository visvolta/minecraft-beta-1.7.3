import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import { nbt, type NbtCompound, type NbtTag } from '../../nbt/Nbt';
import { DamageSource } from '../damage/DamageSource';
import { AnimalEntity } from './AnimalEntity';
import type { LivingEntity } from './LivingEntity';
import { WolfModel } from './WolfModel';
import type { Player } from '../../player/Player';
import type { Entity } from '../core/Entity';
import type { Drop } from '../items/BlockDropResolver';
import { wrapDegrees } from './LivingAnimationMath';

export class WolfEntity extends AnimalEntity {
  public readonly typeId = EntityTypeIds.Wolf;
  public readonly typeStringId = 'Wolf';

  private isTamed = false;
  private isAngry = false;
  private isSitting = false;
  private ownerUuid = '';
  public target: LivingEntity | Player | null = null;
  private model: WolfModel | null = null;

  // Breeding is out of scope for this project — stub implementations.
  public get breedingItemId(): string { return ''; }
  protected createChild(x: number, y: number, z: number): AnimalEntity { return new WolfEntity(this.ctx, x, y, z); }

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx);
    this.setSize(0.8, 0.8);
    this.maxHealth = 4;
    this.health = 4;
    this.moveSpeed = 0.8;
    this.setPosition(x, y, z);
    this.rebuildModel();
  }

  public get wolfTamed(): boolean { return this.isTamed; }
  public get wolfAngry(): boolean { return this.isAngry; }
  public get wolfSitting(): boolean { return this.isSitting; }
  public get owner(): string { return this.ownerUuid; }

  public override attackEntityFrom(source: DamageSource, amount: number): boolean {
    if (source.category === 'player' && this.ctx.player !== undefined) {
      this.isAngry = true;
      this.target = this.ctx.player;
      const box = this.getAABB().expand(16, 4, 16);
      for (const wolf of this.ctx.manager.getEntitiesInAABB(box, (e): e is WolfEntity => e instanceof WolfEntity && e !== this)) {
        wolf.isAngry = true;
        if (wolf.target === null) wolf.target = this.ctx.player;
      }
    }
    if (this.isTamed) this.maxHealth = 20;
    return super.attackEntityFrom(source, amount);
  }

  public tame(ownerUuid: string): void {
    this.isTamed = true;
    this.ownerUuid = ownerUuid;
    this.isAngry = false;
    this.maxHealth = 20;
    this.health = 20;
    this.emitSound('mob.wolf.shake', 'attack', this.getSoundVolume(), (this.nextFloat() - this.nextFloat()) * 0.2 + 1);
    this.rebuildModel();
  }

  public clearTarget(): void { this.target = null; }

  public toggleSitting(): void { this.isSitting = !this.isSitting; }

  public override onTick(ctx: EntityTickContext): void {
    if (this.health <= 0) return;
    if ((this.ctx.difficulty?.() ?? 1) === 0) { this.isAngry = false; this.clearTarget(); }
    if (!this.isTamed) {
      if (this.isAngry) {
        if (this.target === null && this.ctx.player !== undefined && this.ctx.player.isAlive()) this.target = this.ctx.player;
      } else {
        this.tryHuntSheep();
      }
    } else {
      this.followOwner();
    }
    if (this.isSitting) { this.moveStrafing = 0; this.moveForward = 0; this.isJumping = false; }
    super.onTick(ctx);
  }

  private tryHuntSheep(): void {
    if (this.target !== null || this.nextInt(20) !== 0) return;
    const box = this.getAABB().expand(16, 4, 16);
    const sheep = this.ctx.manager.getEntitiesInAABB(box, (e): e is Entity => e !== this && !e.removed && e.typeStringId === 'Sheep');
    if (sheep.length > 0) this.target = sheep[0] as unknown as LivingEntity;
  }

  private followOwner(): void {
    if (this.isSitting) return;
    const owner = this.ctx.player;
    if (owner === undefined || !owner.isAlive()) return;
    const dx = owner.position.x - this.position.x;
    const dy = owner.position.y - this.position.y;
    const dz = owner.position.z - this.position.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > 144) {
      this.moveForward = 1;
      this.yaw = Math.atan2(dx, dz) * 180 / Math.PI;
      this.isJumping = this.onGround && this.isCollidedHorizontally;
    } else if (distSq < 9) { this.moveForward = 0; this.moveStrafing = 0; }
    if (distSq > 16384) {
      const ox = owner.position.x, oy = owner.position.y, oz = owner.position.z;
      const below = this.ctx.blockRegistry.getById(this.ctx.blockUpdateWorld.getBlock(Math.floor(ox), Math.floor(oy) - 1, Math.floor(oz)));
      const feet = this.ctx.blockRegistry.getById(this.ctx.blockUpdateWorld.getBlock(Math.floor(ox), Math.floor(oy), Math.floor(oz)));
      const head = this.ctx.blockRegistry.getById(this.ctx.blockUpdateWorld.getBlock(Math.floor(ox), Math.floor(oy) + 1, Math.floor(oz)));
      if (below?.solid && !feet?.solid && !head?.solid) this.setPosition(ox, oy, oz);
    }
  }

  public getCombatDamage(): number { return this.isTamed ? 4 : 2; }

  protected override getDropItems(): Drop[] { return []; }
  protected override getAmbientSoundId(): string {
    if (this.isAngry) return 'mob.wolfgrowl';
    return this.isTamed && this.health < 10 ? 'mob.wolf.whine' : 'mob.wolf.panting';
  }
  protected override getHurtSoundId(): string { return 'mob.wolfhurt'; }
  protected override getDeathSoundId(): string { return 'mob.wolfdeath'; }
  protected override getSoundVolume(): number { return 1; }

  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha);
    const model = this.model;
    if (model === null) return;

    // Interpolate the same Beta-style state the quadrupeds use, so the wolf
    // animates between simulation ticks instead of snapping at 20 Hz.
    const legYaw = this.prevLegYaw + (this.legYaw - this.prevLegYaw) * alpha;
    const bodyYaw = this.prevRenderYawOffset + wrapDegrees(this.renderYawOffset - this.prevRenderYawOffset) * alpha;
    const headYaw = this.prevHeadYaw + wrapDegrees(this.headYaw - this.prevHeadYaw) * alpha;
    const headPitch = this.prevHeadPitch + (this.headPitch - this.prevHeadPitch) * alpha;

    model.updatePose(this.isTamed, this.isAngry, this.isSitting, legYaw, this.legSwing, headYaw - bodyYaw, headPitch);

    const flash = !this.isDead() && this.maxHurtTime > 0 ? this.hurtTime / this.maxHurtTime : 0;
    model.setHurtFlash(Math.max(flash, this.isBurning() ? 0.15 : 0));
    model.setDeathProgress(this.isDead() ? Math.min(this.deathTime / 20, 1) : 0);
  }

  protected rebuildModel(): void {
    this.model?.dispose();
    this.model = new WolfModel(this.ctx.entityTextures?.get('wolf'), this.ctx.entityTextures?.get('wolfTame'), this.ctx.entityTextures?.get('wolfAngry'), this.ctx.entityTextures?.get('wolfCollar'));
    this.renderObject = this.model.root; this.ctx.scene.add(this.model.root);
  }
  protected override disposeRender(): void { this.model?.dispose(); this.model = null; }
  public override onRestore(): void { this.rebuildModel(); }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    this.writeLivingNbt(map);
    if (this.ownerUuid) map.set('Owner', nbt.string(this.ownerUuid));
    map.set('Angry', nbt.byte(this.isAngry ? 1 : 0));
    map.set('Sitting', nbt.byte(this.isSitting ? 1 : 0));
    map.set('Tamed', nbt.byte(this.isTamed ? 1 : 0));
  }
  protected readEntityNbt(data: NbtCompound): void {
    this.readLivingNbt(data);
    const owner = data.value.get('Owner'); this.ownerUuid = owner?.type === 'string' ? owner.value : '';
    const angry = data.value.get('Angry'); this.isAngry = angry?.type === 'byte' ? angry.value !== 0 : false;
    const sitting = data.value.get('Sitting'); this.isSitting = sitting?.type === 'byte' ? sitting.value !== 0 : false;
    const tamed = data.value.get('Tamed');
    if (tamed?.type === 'byte' && tamed.value !== 0) { this.isTamed = true; this.maxHealth = 20; }
    this.target = null; this.rebuildModel();
  }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): WolfEntity {
    const e = new WolfEntity(ctx, 0, 0, 0); e.readFromNbt(data); return e;
  }
}
