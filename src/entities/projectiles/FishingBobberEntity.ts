import * as THREE from 'three';
import { Entity } from '../core/Entity';
import { LivingEntity } from '../living/LivingEntity';
import { EntityTypeIds } from '../core/EntityType';
import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { BlockIds } from '../../blocks/BlockId';
import type { NbtCompound, NbtTag } from '../../nbt/Nbt';

/**
 * Beta 1.7.3 `EntityFish` — the fishing bobber.
 *
 * Faithful port of Beta's tick loop: ballistic flight, block/entity ray
 * checks, water buoyancy sampled in five vertical slices, the random bite
 * timer, and the reel-in result codes that drive rod durability.
 *
 * Lifetime is owned by the angler: the bobber removes itself if the player
 * dies, stops holding the rod, or moves more than 32 blocks away, which is
 * what stops a stale bobber surviving an item switch or respawn.
 */

/** Beta `EntityFish` size. */
const BOBBER_SIZE = 0.25;
/** Beta cast speed / spread from `calculateVelocity(..., 1.5F, 1.0F)`. */
export const BOBBER_CAST_SPEED = 1.5;
export const BOBBER_CAST_SPREAD = 1;
/** Beta initial motion scale before `calculateVelocity`. */
const BOBBER_LAUNCH_SCALE = 0.4;
/** Beta despawns a stuck bobber after this many ticks in ground. */
const MAX_TICKS_IN_GROUND = 1200;
/** Beta drops the bobber beyond 32 blocks (1024 squared). */
const MAX_ANGLER_DISTANCE_SQ = 1024;
/** Beta water-column sampling resolution. */
const BUOYANCY_SLICES = 5;
/** Beta bite chance denominator: 500 normally, 300 while rained on. */
const BITE_CHANCE_CLEAR = 500;
const BITE_CHANCE_RAIN = 300;

/** Result of reeling in, matching Beta `catchFish`'s return codes. */
export type FishingCatchResult = 0 | 1 | 2 | 3;
export const CATCH_NOTHING: FishingCatchResult = 0;
export const CATCH_FISH: FishingCatchResult = 1;
export const CATCH_GROUND: FishingCatchResult = 2;
export const CATCH_ENTITY: FishingCatchResult = 3;

export class FishingBobberEntity extends Entity {
  public override readonly typeId = EntityTypeIds.FishingBobber;
  public override readonly typeStringId = 'Fish';

  /** Entity the bobber has hooked, if any (Beta `bobber`). */
  public hookedEntity: Entity | null = null;
  /** Ticks remaining in which a reel-in yields a fish (Beta `ticksCatchable`). */
  private ticksCatchable = 0;
  private ticksInGround = 0;
  private ticksInAir = 0;
  private inGround = false;
  private tileBlockId = 0;
  private tileX = -1;
  private tileY = -1;
  private tileZ = -1;

  private ownMaterial: THREE.Material | null = null;

  /**
   * Spawns the caught raw fish flying toward the angler. Injected so the
   * bobber does not need to know about the item-entity system.
   */
  public spawnCatch?: (x: number, y: number, z: number, mx: number, my: number, mz: number) => void;

  public constructor(
    private readonly ctx: EntityWorldContext,
    /** The angler. Kept so the bobber can follow their lifecycle. */
    public angler: Entity | null,
    x: number,
    y: number,
    z: number,
  ) {
    super();
    this.setSize(BOBBER_SIZE, BOBBER_SIZE);
    this.setPosition(x, y, z);
    this.buildModel();
  }

  /**
   * Beta launches the bobber along the angler's look vector at 0.4 scale,
   * then normalises through `calculateVelocity` at speed 1.5.
   */
  public cast(yawRadians: number, pitchRadians: number): void {
    const dirX = -Math.sin(yawRadians) * Math.cos(pitchRadians) * BOBBER_LAUNCH_SCALE;
    const dirY = -Math.sin(pitchRadians) * BOBBER_LAUNCH_SCALE;
    const dirZ = Math.cos(yawRadians) * Math.cos(pitchRadians) * BOBBER_LAUNCH_SCALE;
    const length = Math.hypot(dirX, dirY, dirZ) || 1;
    const spread = BOBBER_CAST_SPREAD * 0.0075;
    this.velocity.x = (dirX / length + (this.ctx.rng.nextFloat() - this.ctx.rng.nextFloat()) * spread) * BOBBER_CAST_SPEED;
    this.velocity.y = (dirY / length + (this.ctx.rng.nextFloat() - this.ctx.rng.nextFloat()) * spread) * BOBBER_CAST_SPEED;
    this.velocity.z = (dirZ / length + (this.ctx.rng.nextFloat() - this.ctx.rng.nextFloat()) * spread) * BOBBER_CAST_SPEED;
    this.yaw = Math.atan2(this.velocity.x, this.velocity.z) * 180 / Math.PI;
    this.pitch = Math.atan2(this.velocity.y, Math.hypot(this.velocity.x, this.velocity.z)) * 180 / Math.PI;
  }

  /** True while a fish is biting, so the UI/audio can react. */
  public isBiting(): boolean {
    return this.ticksCatchable > 0;
  }

  public override onTick(_tickCtx: EntityTickContext): void {
    this.age += 1;

    if (!this.validateAngler()) return;

    // A hooked entity drags the bobber along with it.
    if (this.hookedEntity !== null) {
      if (!this.hookedEntity.removed) {
        this.position.x = this.hookedEntity.position.x;
        this.position.y = this.hookedEntity.position.y + this.hookedEntity.height * 0.8;
        this.position.z = this.hookedEntity.position.z;
        return;
      }
      this.hookedEntity = null;
    }

    if (this.inGround) {
      // Beta releases the bobber if the block it stuck to changed.
      if (this.ctx.blockUpdateWorld.getBlock(this.tileX, this.tileY, this.tileZ) === this.tileBlockId) {
        this.ticksInGround += 1;
        if (this.ticksInGround === MAX_TICKS_IN_GROUND) this.markRemoved();
        return;
      }
      this.inGround = false;
      this.velocity.x *= this.ctx.rng.nextFloat() * 0.2;
      this.velocity.y *= this.ctx.rng.nextFloat() * 0.2;
      this.velocity.z *= this.ctx.rng.nextFloat() * 0.2;
      this.ticksInGround = 0;
      this.ticksInAir = 0;
    } else {
      this.ticksInAir += 1;
    }

    if (this.sweepForImpact()) return;

    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;
    this.position.z += this.velocity.z;

    const submerged = this.submergedFraction();
    this.updateBiteTimer(submerged);

    if (this.ticksCatchable > 0) {
      // Beta bobs the float down while a fish is biting.
      const r = this.ctx.rng;
      this.velocity.y -= r.nextFloat() * r.nextFloat() * r.nextFloat() * 0.2;
    }

    // Buoyancy: Beta maps submersion onto a -1..+1 push.
    const buoyancy = submerged * 2 - 1;
    this.velocity.y += 0.04 * buoyancy;

    let drag = this.onGround || this.isCollidedHorizontally ? 0.5 : 0.92;
    if (submerged > 0) {
      drag *= 0.9;
      this.velocity.y *= 0.8;
    }
    this.velocity.x *= drag;
    this.velocity.y *= drag;
    this.velocity.z *= drag;
  }

  /**
   * Beta removes the bobber when the angler dies, swaps away from the rod, or
   * gets too far away. This is what cleans up on item switch, death and
   * world unload.
   */
  private validateAngler(): boolean {
    const angler = this.angler;
    if (angler === null || angler.removed) {
      this.markRemoved();
      return false;
    }
    const dx = angler.position.x - this.position.x;
    const dy = angler.position.y - this.position.y;
    const dz = angler.position.z - this.position.z;
    if (dx * dx + dy * dy + dz * dz > MAX_ANGLER_DISTANCE_SQ) {
      this.markRemoved();
      return false;
    }
    const heldId = this.ctx.playerHeldItemId?.();
    if (heldId !== undefined && heldId !== 'fishing_rod' && heldId !== 346) {
      this.markRemoved();
      return false;
    }
    if (!this.ctx.blockUpdateWorld.isLoaded(this.position.x, this.position.z)) {
      this.markRemoved();
      return false;
    }
    return true;
  }

  /** Steps along this tick's motion looking for a block or entity to hit. */
  private sweepForImpact(): boolean {
    const speed = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z);
    const steps = Math.max(1, Math.ceil(speed * 8));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = this.position.x + this.velocity.x * t;
      const y = this.position.y + this.velocity.y * t;
      const z = this.position.z + this.velocity.z * t;

      // Beta ignores the angler for the first few ticks so casting past
      // yourself works.
      const probe = this.getAABB().translated(
        x - this.position.x, y - this.position.y, z - this.position.z,
      );
      const hits = this.ctx.manager.getEntitiesInAABB(
        probe,
        (e): e is LivingEntity => e instanceof LivingEntity && e !== this.angler,
      );
      if (hits.length > 0 && this.ticksInAir >= 5) {
        this.hookedEntity = hits[0]!;
        this.setPosition(x, y, z);
        return true;
      }

      const bx = Math.floor(x);
      const by = Math.floor(y);
      const bz = Math.floor(z);
      const blockId = this.ctx.blockUpdateWorld.getBlock(bx, by, bz);
      // Water must not stop the bobber — it is the target surface.
      if (blockId === BlockIds.Air || isWater(blockId)) continue;
      if (this.ctx.blockRegistry.getById(blockId)?.solid !== true) continue;

      this.setPosition(x, y, z);
      this.inGround = true;
      this.tileX = bx;
      this.tileY = by;
      this.tileZ = bz;
      this.tileBlockId = blockId;
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.velocity.z = 0;
      return true;
    }
    return false;
  }

  /**
   * Beta samples the bobber's AABB in five horizontal slices and returns the
   * fraction sitting in water, which drives both buoyancy and bite chance.
   */
  private submergedFraction(): number {
    let submerged = 0;
    const minY = this.position.y;
    const maxY = this.position.y + this.height;
    for (let slice = 0; slice < BUOYANCY_SLICES; slice++) {
      const sliceY = minY + (maxY - minY) * (slice + 0.5) / BUOYANCY_SLICES;
      const blockId = this.ctx.blockUpdateWorld.getBlock(
        Math.floor(this.position.x), Math.floor(sliceY), Math.floor(this.position.z),
      );
      if (isWater(blockId)) submerged += 1 / BUOYANCY_SLICES;
    }
    return submerged;
  }

  /** Beta's random bite roll, faster when the bobber is rained on. */
  private updateBiteTimer(submerged: number): void {
    if (submerged <= 0) return;
    if (this.ticksCatchable > 0) {
      this.ticksCatchable -= 1;
      return;
    }
    const raining = this.ctx.weather?.isRaining() === true;
    const chance = raining ? BITE_CHANCE_RAIN : BITE_CHANCE_CLEAR;
    if (this.ctx.rng.nextInt(chance) !== 0) return;

    this.ticksCatchable = this.ctx.rng.nextInt(30) + 10;
    this.velocity.y -= 0.2;
    this.ctx.sounds?.emit({
      id: 'random.splash',
      kind: 'ambient',
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      volume: 0.25,
      pitch: 1 + (this.ctx.rng.nextFloat() - this.ctx.rng.nextFloat()) * 0.4,
      attenuationDistance: 16,
    });
  }

  /**
   * Beta `catchFish`: pulls a hooked entity toward the angler, or spawns a
   * raw fish flying at them, and returns the durability cost.
   */
  public reelIn(): FishingCatchResult {
    let result: FishingCatchResult = CATCH_NOTHING;
    const angler = this.angler;

    if (this.hookedEntity !== null && angler !== null) {
      const dx = angler.position.x - this.position.x;
      const dy = angler.position.y - this.position.y;
      const dz = angler.position.z - this.position.z;
      const distance = Math.hypot(dx, dy, dz);
      const pull = 0.1;
      this.hookedEntity.velocity.x += dx * pull;
      this.hookedEntity.velocity.y += dy * pull + Math.sqrt(distance) * 0.08;
      this.hookedEntity.velocity.z += dz * pull;
      result = CATCH_ENTITY;
    } else if (this.ticksCatchable > 0 && angler !== null) {
      const dx = angler.position.x - this.position.x;
      const dy = angler.position.y - this.position.y;
      const dz = angler.position.z - this.position.z;
      const distance = Math.hypot(dx, dy, dz);
      const pull = 0.1;
      this.spawnCatch?.(
        this.position.x, this.position.y, this.position.z,
        dx * pull, dy * pull + Math.sqrt(distance) * 0.08, dz * pull,
      );
      result = CATCH_FISH;
    }

    if (this.inGround) result = CATCH_GROUND;

    this.markRemoved();
    return result;
  }

  private buildModel(): void {
    if (typeof document === 'undefined') return;
    // Beta `RenderFish` billboards the bobber: it rotates the quad by
    // `180 - playerViewY` about Y and `-playerViewX` about X every frame, so
    // the sprite always faces the camera. A THREE.Sprite reproduces that
    // exactly without needing the camera here, and unlike a fixed PlaneGeometry
    // it can never present edge-on as an invisible sliver.
    const material = new THREE.SpriteMaterial({
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.1,
      // Beta draws the bobber unfogged at full brightness.
      fog: false,
      depthTest: true,
      depthWrite: false,
    });
    const texture = this.ctx.entityTextures?.get('fishingBobber');
    if (texture !== undefined) material.map = texture;
    this.ownMaterial = material;
    const sprite = new THREE.Sprite(material);
    // Beta scales the sprite by 0.5 over a 1-block quad, i.e. half a block,
    // but clamps the drawn size to the 0.25 entity box.
    sprite.scale.set(BOBBER_SIZE, BOBBER_SIZE, BOBBER_SIZE);
    // The bobber is small and often at the edge of view while cast; Beta sets
    // `ignoreFrustumCheck`, so match that or it pops out near screen borders.
    sprite.frustumCulled = false;
    this.renderObject = sprite;
    this.ctx.scene.add(sprite);
  }

  public onRemove(): void {
    if (this.renderObject !== null) {
      this.renderObject.removeFromParent();
      this.renderObject = null;
    }
    this.ownMaterial?.dispose();
    this.ownMaterial = null;
  }

  /**
   * Bobbers are transient. Beta writes tile state, but a bobber restored
   * without its angler is meaningless — it would resurrect a hook the player
   * no longer holds — so nothing type-specific is persisted and the entity is
   * dropped on load by not being registered as a deserialisable type.
   */
  protected override writeEntityNbt(_map: Map<string, NbtTag>): void {}

  protected override readEntityNbt(_data: NbtCompound): void {}
}

/** Beta treats both flowing and still water as the fishing surface. */
function isWater(blockId: number): boolean {
  return blockId === BlockIds.WaterStill || blockId === BlockIds.WaterFlowing;
}
