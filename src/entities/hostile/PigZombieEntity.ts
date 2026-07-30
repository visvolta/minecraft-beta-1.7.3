import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import { nbt, type NbtCompound, type NbtTag } from '../../nbt/Nbt';
import { BipedHostileEntity } from './BipedHostileEntity';
import { PigZombieModel } from './models/PigZombieModel';
import { PigZombieSwordRenderer } from './rendering/PigZombieSwordRenderer';
import type { Player } from '../../player/Player';
import type { Drop } from '../items/BlockDropResolver';
import type { DamageSource } from '../damage/DamageSource';

/** Beta `EntityPigZombie` group-anger search radius (boundingBox.expand(32)). */
const PIGMAN_ANGER_RADIUS = 32;
/** Beta `becomeAngryAt`: angerLevel = 400 + rand(400) (ticks). Persisted, never decremented. */
const ANGER_BASE = 400;
const ANGER_RANDOM = 400;
/** Beta `becomeAngryAt`: angry sound plays after rand(40) ticks. */
const ANGER_SOUND_DELAY_MAX = 40;

/**
 * Beta 1.7.3 `EntityPigZombie` (extends `EntityZombie`): a fire-immune biped
 * that is passive until provoked, then permanently hostile (Beta never
 * decrements `angerLevel`). Striking one angers every nearby pigman in a single
 * ±32 search; newly-angered pigmen only set their own state, so the scan is not
 * recursive.
 */
export class ZombiePigmanEntity extends BipedHostileEntity {
  public readonly typeId = EntityTypeIds.PigZombie;
  public readonly typeStringId = 'PigZombie';
  public readonly meleeDamage = 5;

  /** Beta `angerLevel`. Persisted; never decremented (Beta 1.7.3 behaviour). */
  private angerLevel = 0;
  /** Counts down once after becoming angry to play the angry sound. */
  private randomSoundDelay = 0;
  private swordRenderer: PigZombieSwordRenderer | null = null;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx);
    this.setSize(0.6, 1.8);
    this.setPosition(x, y, z);
    this.moveSpeed = 0.5;
    this.isImmuneToFire = true;
    this.rebuildModel();
  }

  public override onTick(ctx: EntityTickContext): void {
    // Beta: moveSpeed jumps to 0.95 while a target is held, else 0.5. No
    // daylight ignition here (the Nether has no sky, and the task requires no
    // burning) — the Zombie burn path is intentionally not inherited.
    this.moveSpeed = this.target !== null ? 0.95 : 0.5;
    if (this.randomSoundDelay > 0 && --this.randomSoundDelay === 0) {
      const pitch = ((this.nextFloat() - this.nextFloat()) * 0.2 + 1) * 1.8;
      this.emitSound('mob.zombiepig.zpigangry', 'attack', this.getSoundVolume() * 2, pitch);
    }
    super.onTick(ctx);
  }

  /** Passive while `angerLevel == 0` (Beta `findPlayerToAttack`). */
  public override acquirePlayerTarget(): Player | null {
    return this.angerLevel === 0 ? null : super.acquirePlayerTarget();
  }

  /**
   * Beta `attackEntityFrom`: a player strike triggers ONE ±32 pigman search;
   * each hit pigman becomes angry at the player. Runs before damage so anger
   * lands even on an invulnerability-frame hit. The scan is not recursive —
   * `becomeAngryAt` only mutates the target pigman's own state.
   */
  public override attackEntityFrom(source: DamageSource, amount: number): boolean {
    if (source.category === 'player' && this.ctx.player !== undefined) {
      this.angerNearbyPigmen(this.ctx.player);
    }
    return super.attackEntityFrom(source, amount);
  }

  private angerNearbyPigmen(player: Player): void {
    const box = this.getAABB().expand(PIGMAN_ANGER_RADIUS, PIGMAN_ANGER_RADIUS, PIGMAN_ANGER_RADIUS);
    const pigmen = this.ctx.manager.getEntitiesInAABB(
      box,
      (e): e is ZombiePigmanEntity => e instanceof ZombiePigmanEntity && e !== this,
    );
    for (const pig of pigmen) pig.becomeAngryAt(player);
    this.becomeAngryAt(player);
  }

  public becomeAngryAt(player: Player): void {
    this.target = player;
    this.angerLevel = ANGER_BASE + this.nextInt(ANGER_RANDOM);
    this.randomSoundDelay = this.nextInt(ANGER_SOUND_DELAY_MAX);
  }

  /** Exposed for validation/group-anger radius checks. */
  public get isAngry(): boolean { return this.angerLevel > 0; }

  protected rebuildModel(): void {
    this.swordRenderer?.dispose();
    const model = new PigZombieModel(this.ctx.entityTextures?.get('zombiePigman'));
    this.attachBiped(model);
    this.swordRenderer = this.ctx.entityTextures ? new PigZombieSwordRenderer(model.rightHandAttachment, this.ctx.entityTextures) : null;
    // The sword mesh is parented after `attachBiped` set renderObject, so it
    // misses the setter's render-order stamp; re-apply to cover it.
    this.refreshRenderOrder();
  }

  protected override disposeRender(): void {
    this.swordRenderer?.dispose();
    this.swordRenderer = null;
    super.disposeRender();
  }

  protected override getDropItems(): Drop[] {
    // Beta `getDropItemId` = cooked porkchop. Ghast Tear is deliberately
    // unrelated to the Pigman.
    return [{ type: 'item', id: 'porkchop_cooked', count: 1, metadata: 0 }];
  }

  protected override getAmbientSoundId(): string { return 'mob.zombiepig.zpig'; }
  protected override getHurtSoundId(): string { return 'mob.zombiepig.zpighurt'; }
  protected override getDeathSoundId(): string { return 'mob.zombiepig.zpigdeath'; }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    this.writeHostileNbt(map);
    map.set('Anger', nbt.short(this.angerLevel));
  }

  protected readEntityNbt(data: NbtCompound): void {
    this.readHostileNbt(data);
    const anger = data.value.get('Anger');
    this.angerLevel = anger?.type === 'short' || anger?.type === 'int' ? anger.value : 0;
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): ZombiePigmanEntity {
    const e = new ZombiePigmanEntity(ctx, 0, 0, 0);
    e.readFromNbt(data);
    return e;
  }
}
