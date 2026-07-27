import * as THREE from 'three';
import { EntityTypeIds } from '../core/EntityType';
import type { EntityWorldContext } from '../core/EntityContext';
import type { NbtCompound, NbtTag } from '../../nbt/Nbt';
import { Entity } from '../core/Entity';
import type { LivingEntity } from '../living/LivingEntity';
import { ProjectileEntity, type ProjectileBlockHit } from './ProjectileEntity';
import { ItemIconResolver } from '../../inventory/ItemIconResolver';
import { DamageSource } from '../damage/DamageSource';
import { useOpaqueEntityQueue } from '../../rendering/RenderOrder';
import { ChickenEntity } from '../living/ChickenEntity';

/**
 * Beta thrown items (`EntitySnowball`, `EntityEgg`).
 *
 * Both share `EntityThrowable`-style motion: a 0.25 cube, drag 0.99 and
 * gravity 0.03 per tick (`var18`/`var19` in the decompiled source), thrown at
 * speed 1.5 with inaccuracy 1.0 from `ItemSnowball`/`ItemEgg.onItemRightClick`.
 *
 * Neither deals damage in Beta: the snowball calls
 * `attackEntityFrom(thrower, 0)` — a zero-damage hit that still triggers the
 * target's knockback/aggro — and the egg does the same before rolling for a
 * chicken. Anything that claims snowballs hurt mobs is post-Beta behaviour.
 */

/** Beta `var19`: gravity applied per tick to a thrown item. */
const THROWN_GRAVITY = 0.03;
/** Beta `var18`: per-tick velocity retention. */
const THROWN_DRAG = 0.99;
/** Beta throws both items at this speed with this inaccuracy. */
export const THROWN_ITEM_SPEED = 1.5;
export const THROWN_ITEM_INACCURACY = 1;
/** Beta's 0.25 x 0.25 throwable bounding box. */
const THROWN_SIZE = 0.25;
/** Rendered billboard size; Beta draws the item icon at a small fixed scale. */
const THROWN_RENDER_SIZE = 0.25;

export abstract class ThrownItemEntity extends ProjectileEntity {
  protected readonly gravity = THROWN_GRAVITY;
  protected readonly drag = THROWN_DRAG;
  private ownMaterial: THREE.SpriteMaterial | null = null;

  protected constructor(
    ctx: EntityWorldContext,
    owner: Entity | null,
    x: number,
    y: number,
    z: number,
    /** Item icon name used for the billboard sprite. */
    private readonly iconName: string,
  ) {
    super(ctx, owner);
    this.setSize(THROWN_SIZE, THROWN_SIZE);
    this.setPosition(x, y, z);
    this.buildModel();
  }

  /**
   * Beta deals no damage: `attackEntityFrom(thrower, 0)`. The hit still
   * registers, so a struck mob reacts, but loses no health.
   */
  protected onEntityImpact(entity: LivingEntity | 'player'): void {
    if (entity !== 'player') this.applyZeroDamageHit(entity);
    this.onImpact();
    this.markRemoved();
  }

  protected onBlockImpact(_hit: ProjectileBlockHit): void {
    this.onImpact();
    this.markRemoved();
  }

  /** Hook for subclass-specific impact behaviour (egg hatching). */
  protected onImpact(): void {}

  private applyZeroDamageHit(entity: LivingEntity): void {
    // Beta passes 0 damage: the hit registers (so the target reacts) but no
    // health is lost. Snowballs and eggs are harmless in Beta 1.7.3.
    entity.attackEntityFrom(DamageSource.projectile(this.owner ?? this), 0);
  }

  private buildModel(): void {
    const material = new THREE.SpriteMaterial({ transparent: false, alphaTest: 0.1, depthWrite: true, depthTest: true });
    useOpaqueEntityQueue(material);
    const iconUrl = new ItemIconResolver().resolve(this.iconName);
    const texture = new THREE.TextureLoader().load(iconUrl);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    this.ownMaterial = material;
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(THROWN_RENDER_SIZE, THROWN_RENDER_SIZE, THROWN_RENDER_SIZE);
    // Assigning renderObject stamps the entity render layer, so the sprite
    // stays visible through water.
    this.renderObject = sprite;
    this.ctx.scene.add(sprite);
  }

  public override onRestore(): void { this.buildModel(); }

  public onRemove(): void {
    if (this.renderObject !== null) {
      this.renderObject.removeFromParent();
      this.renderObject = null;
    }
    this.ownMaterial?.map?.dispose();
    this.ownMaterial?.dispose();
    this.ownMaterial = null;
  }

  protected writeEntityNbt(_map: Map<string, NbtTag>): void {}
  protected readEntityNbt(_data: NbtCompound): void {}
}

/** Beta `EntitySnowball`: no damage, eight `snowballpoof` particles on impact. */
export class SnowballEntity extends ThrownItemEntity {
  public readonly typeId = EntityTypeIds.Snowball;
  public readonly typeStringId = 'Snowball';

  public constructor(ctx: EntityWorldContext, owner: Entity | null, x: number, y: number, z: number) {
    super(ctx, owner, x, y, z, 'snowball');
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): SnowballEntity {
    const entity = new SnowballEntity(ctx, null, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}

/**
 * Beta `EntityEgg`: on impact there is a 1-in-8 chance to spawn a chicken,
 * and within that a further 1-in-32 chance to spawn four instead of one.
 */
export class ThrownEggEntity extends ThrownItemEntity {
  public readonly typeId = EntityTypeIds.ThrownEgg;
  public readonly typeStringId = 'ThrownEgg';

  public constructor(ctx: EntityWorldContext, owner: Entity | null, x: number, y: number, z: number) {
    super(ctx, owner, x, y, z, 'egg');
  }

  protected override onImpact(): void {
    // Beta: rand.nextInt(8) == 0 hatches, and rand.nextInt(32) == 0 within
    // that makes it four chicks rather than one.
    if (this.ctx.rng.nextInt(8) !== 0) return;
    const count = this.ctx.rng.nextInt(32) === 0 ? 4 : 1;
    for (let i = 0; i < count; i++) {
      this.ctx.manager.add(new ChickenEntity(this.ctx, this.position.x, this.position.y, this.position.z));
    }
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): ThrownEggEntity {
    const entity = new ThrownEggEntity(ctx, null, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
