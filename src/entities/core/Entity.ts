import type * as THREE from 'three';
import { AABB } from '../../physics/AABB';
import { nbt, type NbtCompound, type NbtTag } from '../../persistence/nbt/Nbt';
import { chunkCoordsOf, generateEntityUuid } from './EntityId';
import type { EntityTickContext, EntityWorldContext } from './EntityContext';

/**
 * Base class for every world entity, mirroring Beta's `Entity`.
 *
 * Position convention (Beta-faithful): `position` is the **bottom-centre**
 * (feet) of the entity. The axis-aligned bounding box therefore spans
 * `(x - width/2, y, z - width/2)` to `(x + width/2, y + height, z + width/2)`.
 * `yOffset` (height/2) is the centre offset used by models that render around
 * their middle.
 *
 * The base owns identity, transform, lifecycle flags and (de)serialisation of
 * the *shared* fields only. Type-specific behaviour and data live in
 * subclasses (`DroppedItemEntity`, `FallingBlockEntity`, `LivingEntity`), and
 * cross-cutting concerns (physics, AI, navigation, rendering) live in
 * dedicated systems — this class never grows gameplay rules.
 */
export abstract class Entity {
  /** Runtime id assigned by the EntityManager on join (0 until assigned). */
  public id = 0;
  /** Persistent identifier used to de-duplicate across save/load. */
  public uuid: string = generateEntityUuid();

  /** Numeric entity-type id (see EntityTypeIds). */
  public abstract readonly typeId: number;
  /** Beta-style string type id written to the NBT `id` field (e.g. "Item"). */
  public abstract readonly typeStringId: string;

  /** Current feet position. */
  public readonly position = { x: 0, y: 0, z: 0 };
  /** Feet position at the start of the current tick (for interpolation). */
  public readonly previousPosition = { x: 0, y: 0, z: 0 };
  /** Velocity in blocks per tick. */
  public readonly velocity = { x: 0, y: 0, z: 0 };

  /** Orientation in degrees (Beta convention). */
  public yaw = 0;
  public pitch = 0;
  public previousYaw = 0;
  public previousPitch = 0;

  /** Bounding-box dimensions in blocks. */
  public width = 0;
  public height = 0;
  /** Centre offset (height/2), Beta `yOffset`. */
  public yOffset = 0;
  /** Maximum block height the entity can step up without jumping. */
  public stepHeight = 0;

  /** Collision state flags, updated by the shared physics mover. */
  public onGround = false;
  public isCollidedHorizontally = false;
  public isCollidedVertically = false;

  /** Set when the entity should be removed; the manager cleans up exactly once. */
  public removed = false;

  /** Beta `entityCollisionReduction`: fraction [0,1] of push impulses ignored. */
  public entityCollisionReduction = 0;

  /** Ticks this entity has existed (Beta `ticksExisted`). */
  public age = 0;
  /** Accumulated fall distance in blocks since last touching ground. */
  public fallDistance = 0;

  /** Owning chunk coordinates; kept in sync as the entity crosses borders. */
  public chunkX = 0;
  public chunkZ = 0;

  /**
   * Optional render object owned by the subclass (built once, never per
   * frame). The manager never constructs or disposes meshes — it only drives
   * `updateRenderInterpolation`. `null` for headless/test entities.
   */
  public renderObject: THREE.Object3D | null = null;

  /** Sets dimensions and recentres the AABB without moving the feet point. */
  protected setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.yOffset = height / 2;
  }

  /** Moves the entity and aligns its previous position + owner chunk. */
  public setPosition(x: number, y: number, z: number): void {
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
    this.previousPosition.x = x;
    this.previousPosition.y = y;
    this.previousPosition.z = z;
    const { chunkX, chunkZ } = chunkCoordsOf(x, z);
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
  }

  /** Current world-space AABB derived from feet position and size. */
  public getAABB(): AABB {
    const halfWidth = this.width / 2;
    return new AABB(
      this.position.x - halfWidth,
      this.position.y,
      this.position.z - halfWidth,
      this.position.x + halfWidth,
      this.position.y + this.height,
      this.position.z + halfWidth,
    );
  }

  /**
   * Called by the manager at the start of each tick, before `onTick`, to
   * snapshot the transform for interpolation. Beta does this inside
   * `onUpdate` (`prevPosX = posX`); centralising it guarantees interpolation
   * stays correct even if a subclass forgets.
   */
  public preTick(): void {
    this.previousPosition.x = this.position.x;
    this.previousPosition.y = this.position.y;
    this.previousPosition.z = this.position.z;
    this.previousYaw = this.yaw;
    this.previousPitch = this.pitch;
  }

  /** Per-tick simulation. Subclasses implement gravity/AI/lifetime here. */
  public abstract onTick(ctx: EntityTickContext): void;

  /** Optional hook run once when the entity joins the world. */
  public onSpawn(_ctx: EntityTickContext): void {
    // Default: nothing. Subclasses override as needed.
  }

  /**
   * Optional hook run once when the entity is removed. Subclasses that own
   * render resources must override `disposeRender` to free them.
   */
  public onRemove(): void {
    this.disposeRender();
    this.detachRenderObject();
  }

  /**
   * Called when the entity's owning chunk unloads. The entity instance is
   * kept (parked) so a persistent entity is never destroyed by streaming, but
   * its render resources are freed and it stops ticking until restored.
   */
  public onPark(): void {
    this.disposeRender();
    this.detachRenderObject();
  }

  /**
   * Called when a parked entity's chunk reloads. Subclasses rebuild their
   * render object here and re-add it to the scene.
   */
  public onRestore(_ctx: EntityWorldContext): void {
    // Default: headless/no render. Subclasses with visuals override.
  }

  /** Subclasses dispose GPU resources (geometry/materials) here. */
  protected disposeRender(): void {
    // Default: nothing owned. Subclasses override.
  }

  /** Removes and clears the render object without disposing geometry. */
  protected detachRenderObject(): void {
    if (this.renderObject !== null) {
      this.renderObject.removeFromParent();
      this.renderObject = null;
    }
  }

  public markRemoved(): void {
    this.removed = true;
  }

  /**
   * Whether other entities can push this one (Beta `canBePushed`). Default
   * false; living entities override to true. Items/falling blocks are not
   * pushed.
   */
  public canBePushed(): boolean {
    return false;
  }

  /**
   * Whether this entity can be targeted/interacted with by a raycast (Beta
   * `canBeCollidedWith`). Default false; living entities override while alive.
   */
  public canBeCollidedWith(): boolean {
    return false;
  }

  /**
   * Beta `applyEntityCollision`: a small, symmetric, horizontal-only push that
   * separates this entity from `other`. No vertical impulse, so entities are
   * never launched; terrain collision on the next physics step keeps pushes
   * from clipping through blocks.
   */
  public applyEntityCollision(other: Entity): void {
    const impulse = entityPushImpulse(this.position, other.position, this.entityCollisionReduction);
    this.velocity.x -= impulse.x;
    this.velocity.z -= impulse.z;
    other.velocity.x += impulse.x;
    other.velocity.z += impulse.z;
  }

  /**
   * Sets the render object's interpolated position between the previous and
   * current tick transforms. Subclasses with extra visual motion (item
   * bobbing/spin, living limb swing, body yaw) override and extend this.
   */
  public updateRenderInterpolation(alpha: number): void {
    const obj = this.renderObject;
    if (obj === null) {
      return;
    }
    const p = this.previousPosition;
    const c = this.position;
    obj.position.set(
      p.x + (c.x - p.x) * alpha,
      p.y + (c.y - p.y) * alpha,
      p.z + (c.z - p.z) * alpha,
    );
  }

  // ---- Serialisation (shared base fields) --------------------------------

  /** Writes the shared base fields into the provided tag map. */
  protected writeBaseNbt(map: Map<string, NbtTag>): void {
    map.set('id', nbt.string(this.typeStringId));
    map.set('UUID', nbt.string(this.uuid));
    map.set('Pos', nbt.list('double', [
      nbt.double(this.position.x),
      nbt.double(this.position.y),
      nbt.double(this.position.z),
    ]));
    map.set('Motion', nbt.list('double', [
      nbt.double(this.velocity.x),
      nbt.double(this.velocity.y),
      nbt.double(this.velocity.z),
    ]));
    map.set('Rotation', nbt.list('float', [
      nbt.float(this.yaw),
      nbt.float(this.pitch),
    ]));
    map.set('FallDistance', nbt.float(this.fallDistance));
    map.set('OnGround', nbt.byte(this.onGround ? 1 : 0));
    map.set('Age', nbt.int(this.age));
  }

  /** Reads the shared base fields. Type data is read by `readEntityNbt`. */
  protected readBaseNbt(data: NbtCompound): void {
    const map = data.value;

    const uuid = map.get('UUID');
    if (uuid?.type === 'string' && uuid.value.length > 0) {
      this.uuid = uuid.value;
    }

    const pos = map.get('Pos');
    if (pos?.type === 'list' && pos.value.length >= 3) {
      const x = pos.value[0];
      const y = pos.value[1];
      const z = pos.value[2];
      if (x?.type === 'double' && y?.type === 'double' && z?.type === 'double') {
        this.setPosition(x.value, y.value, z.value);
      }
    }

    const motion = map.get('Motion');
    if (motion?.type === 'list' && motion.value.length >= 3) {
      const mx = motion.value[0];
      const my = motion.value[1];
      const mz = motion.value[2];
      if (mx?.type === 'double' && my?.type === 'double' && mz?.type === 'double') {
        this.velocity.x = mx.value;
        this.velocity.y = my.value;
        this.velocity.z = mz.value;
      }
    }

    const rotation = map.get('Rotation');
    if (rotation?.type === 'list' && rotation.value.length >= 2) {
      const yaw = rotation.value[0];
      const pitch = rotation.value[1];
      if (yaw?.type === 'float' && pitch?.type === 'float') {
        this.yaw = yaw.value;
        this.pitch = pitch.value;
        this.previousYaw = yaw.value;
        this.previousPitch = pitch.value;
      }
    }

    const fallDistance = map.get('FallDistance');
    if (fallDistance?.type === 'float') {
      this.fallDistance = fallDistance.value;
    }

    const onGround = map.get('OnGround');
    if (onGround?.type === 'byte') {
      this.onGround = onGround.value !== 0;
    }

    const age = map.get('Age');
    if (age?.type === 'int') {
      this.age = age.value;
    } else if (age?.type === 'short') {
      this.age = age.value;
    }
  }

  /** Subclasses write type-specific fields here. */
  protected abstract writeEntityNbt(map: Map<string, NbtTag>): void;

  /** Subclasses read type-specific fields here. */
  protected abstract readEntityNbt(data: NbtCompound): void;

  /** Produces the full save record (base + type-specific). */
  public writeToNbt(): NbtCompound {
    const map = new Map<string, NbtTag>();
    this.writeBaseNbt(map);
    this.writeEntityNbt(map);
    return nbt.compound(map);
  }

  /** Populates the entity from a full save record. */
  public readFromNbt(data: NbtCompound): void {
    this.readBaseNbt(data);
    this.readEntityNbt(data);
  }
}

/**
 * Computes the horizontal push impulse (Beta `applyEntityCollision` math) that
 * separates a body at `from` from a body at `to`. Returns the impulse to apply
 * to the body at `to` (the body at `from` receives the negation). The magnitude
 * scales by `1/√maxAxisDistance` capped at 1, times 0.05, times
 * `(1 - reduction)`. Returns a zero impulse when the bodies are essentially
 * coincident on both axes (Beta guards against a zero divisor).
 */
export function entityPushImpulse(
  from: { x: number; z: number },
  to: { x: number; z: number },
  reduction: number,
): { x: number; z: number } {
  let dx = to.x - from.x;
  let dz = to.z - from.z;
  let maxAxis = Math.max(Math.abs(dx), Math.abs(dz));
  if (maxAxis < 0.01) {
    return { x: 0, z: 0 };
  }
  maxAxis = Math.sqrt(maxAxis);
  dx /= maxAxis;
  dz /= maxAxis;
  let factor = 1.0 / maxAxis;
  if (factor > 1.0) {
    factor = 1.0;
  }
  const scale = factor * 0.05 * (1 - reduction);
  return { x: dx * scale, z: dz * scale };
}
