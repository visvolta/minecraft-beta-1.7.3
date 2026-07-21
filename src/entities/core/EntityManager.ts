import type { AABB } from '../../physics/AABB';
import type { Chunk } from '../../world/Chunk';
import type { NbtCompound } from '../../persistence/nbt/Nbt';
import { EntityIdAllocator, chunkKey, chunkCoordsOf } from './EntityId';
import { EntityPhysics } from './EntityPhysics';
import type { EntityTypeRegistry } from './EntityType';
import { entityPushImpulse, type Entity } from './Entity';
import type { EntityTickContext, EntityWorldContext } from './EntityContext';

/**
 * Everything the manager needs from the world, minus the pieces it builds
 * itself (`manager`, `physics`) and the type registry (manager-internal).
 */
export type EntityManagerOptions = Omit<EntityWorldContext, 'manager' | 'physics'> & {
  readonly typeRegistry: EntityTypeRegistry;
};

/** Beta expands an entity's box by 0.2 to find push candidates. */
const ENTITY_COLLISION_EXPAND = 0.2;

/**
 * The minimal surface the manager needs to push the player. `Player` satisfies
 * this structurally; the manager only reads position/AABB and writes velocity,
 * so the player's own physics still integrates motion and resolves terrain.
 */
export interface PushableBody {
  readonly position: { x: number; y: number; z: number };
  readonly velocity: { x: number; y: number; z: number };
  getAABB(): AABB;
}

/**
 * Central owner of all world entities.
 *
 * Deliberately narrow: it owns entity **storage**, **add/remove queues**,
 * **ticking dispatch**, **runtime ids**, **UUID lookup**, **queries**,
 * **chunk ownership/streaming**, and **persistence dispatch**. It does *not*
 * own AI, navigation, rendering logic, the physics implementation, or sounds
 * — those live in dedicated systems or on the entities themselves.
 *
 * The manager has no clock of its own. The Engine owns the single 20 Hz
 * simulation clock and calls {@link tick} once per simulation tick and
 * {@link render} once per frame with the interpolation alpha.
 */
export class EntityManager {
  private readonly entities = new Map<number, Entity>();
  private readonly byUuid = new Map<string, Entity>();
  /** Active entities bucketed by their owning chunk (chunk-first queries). */
  private readonly byChunk = new Map<string, Set<number>>();
  /** Entities whose chunk unloaded this session; kept alive, not ticked. */
  private readonly parked = new Map<string, Entity[]>();
  private readonly pendingAdd: Entity[] = [];
  private readonly pendingRemove = new Set<number>();
  private readonly idAllocator = new EntityIdAllocator();

  private readonly chunkManager: EntityManagerOptions['chunkManager'];
  private readonly typeRegistry: EntityTypeRegistry;
  private readonly physics: EntityPhysics;
  public readonly context: EntityWorldContext;

  private gameTick = 0;
  /** Active loaded passive creatures only; parked entities deliberately do not count. */
  private passiveCreatureCount = 0;
  private hostileMobCount = 0;

  public constructor(options: EntityManagerOptions) {
    this.chunkManager = options.chunkManager;
    this.typeRegistry = options.typeRegistry;
    this.physics = new EntityPhysics(
      options.blockRegistry,
      options.behaviourRegistry,
      options.blockUpdateWorld,
    );
    this.context = {
      blockRegistry: options.blockRegistry,
      behaviourRegistry: options.behaviourRegistry,
      blockUpdateWorld: options.blockUpdateWorld,
      chunkManager: options.chunkManager,
      scene: options.scene,
      blockAtlas: options.blockAtlas,
      itemAtlas: options.itemAtlas,
      heldBlockMaterial: options.heldBlockMaterial,
      itemHeldMaterial: options.itemHeldMaterial,
      manager: this,
      physics: this.physics,
      rng: options.rng,
      particles: options.particles,
      weather: options.weather,
      playerPosition: options.playerPosition,
      playerHeldItemId: options.playerHeldItemId,
      player: options.player,
      difficulty: options.difficulty,
      isDaytime: options.isDaytime,
      skylightSubtracted: options.skylightSubtracted,
      explode: options.explode,
      sounds: options.sounds,
    };

    this.chunkManager.addRemoveListener((chunk) => this.onChunkRemoved(chunk));
    this.chunkManager.addCreateListener((chunk) => this.onChunkCreated(chunk));
  }

  // ---- Lifecycle ---------------------------------------------------------

  /**
   * Queues an entity for insertion. Safe to call while iterating (during a
   * tick): the entity joins at the start of the next tick. A fresh runtime id
   * is assigned on flush.
   */
  public add(entity: Entity): Entity {
    this.pendingAdd.push(entity);
    return entity;
  }

  /** Queues an entity for removal. Idempotent; cleanup runs exactly once. */
  public remove(entity: Entity): void {
    if (entity.removed) {
      return;
    }
    entity.removed = true;
    this.pendingRemove.add(entity.id);
  }

  /**
   * Runs one authoritative 20 Hz simulation step. Called by the Engine once
   * per elapsed world tick — the manager never accumulates time itself.
   */
  public tick(): void {
    this.gameTick += 1;
    const ctx = this.tickContext();

    this.flushAdds(ctx);

    // The entities Map is stable during this loop: additions go to
    // pendingAdd (flushed next tick) and removals go to pendingRemove
    // (flushed after the loop), so no snapshot allocation is needed.
    for (const entity of this.entities.values()) {
      if (entity.removed) {
        // Already flagged (e.g. markRemoved() outside onTick): ensure cleanup.
        this.pendingRemove.add(entity.id);
        continue;
      }
      this.updateChunkOwnership(entity);
      entity.preTick();
      entity.onTick(ctx);
      if (entity.removed) {
        this.pendingRemove.add(entity.id);
      }
    }

    // Resolve entity↔entity pushing after everyone has moved this tick.
    this.resolveEntityCollisions();

    this.flushRemoves();
  }

  /**
   * Pushes overlapping pushable entities apart (Beta `applyEntityCollision`),
   * using chunk-first queries. Each pair is processed once (by id order).
   */
  private resolveEntityCollisions(): void {
    for (const entity of this.entities.values()) {
      if (entity.removed || !entity.canBePushed()) {
        continue;
      }
      const box = entity.getAABB().expand(ENTITY_COLLISION_EXPAND, 0, ENTITY_COLLISION_EXPAND);
      const nearby = this.getEntitiesInAABB(box);
      for (const other of nearby) {
        if (other === entity || other.id <= entity.id) {
          continue;
        }
        if (other.removed || !other.canBePushed()) {
          continue;
        }
        entity.applyEntityCollision(other);
      }
    }
  }

  /**
   * Pushes pushable entities away from the player and applies the equal and
   * opposite impulse to the player's velocity. The player's own physics (run
   * later by the Engine) integrates that velocity and resolves terrain, so
   * this never repositions the player or bypasses collision.
   */
  public collideWithPlayer(player: PushableBody): void {
    const box = player.getAABB().expand(ENTITY_COLLISION_EXPAND, 0, ENTITY_COLLISION_EXPAND);
    const nearby = this.getEntitiesInAABB(box);
    for (const entity of nearby) {
      if (entity.removed || !entity.canBePushed()) {
        continue;
      }
      const impulse = entityPushImpulse(entity.position, player.position, entity.entityCollisionReduction);
      entity.velocity.x -= impulse.x;
      entity.velocity.z -= impulse.z;
      player.velocity.x += impulse.x;
      player.velocity.z += impulse.z;
    }
  }

  /** Per-frame interpolation path. Delegates to each entity's own visuals. */
  public render(alpha: number): void {
    for (const entity of this.entities.values()) {
      entity.updateRenderInterpolation(alpha);
    }
  }

  private flushAdds(ctx: EntityTickContext): void {
    while (this.pendingAdd.length > 0) {
      const entity = this.pendingAdd.shift()!;
      if (entity.id === 0) {
        entity.id = this.idAllocator.allocate();
      } else {
        this.idAllocator.reserve(entity.id);
      }
      // Guard against duplicate runtime ids and duplicate UUIDs (e.g. a stale
      // load racing an in-memory entity).
      if (this.entities.has(entity.id) || this.byUuid.has(entity.uuid)) {
        continue;
      }
      this.entities.set(entity.id, entity);
      this.byUuid.set(entity.uuid, entity);
      if (entity.isPassiveCreature) this.passiveCreatureCount += 1;
      if (entity.isHostileMob) this.hostileMobCount += 1;
      this.addToChunkBucket(entity);
      this.markChunkDirty(entity.chunkX, entity.chunkZ);
      entity.onSpawn(ctx);
    }
  }

  private flushRemoves(): void {
    if (this.pendingRemove.size === 0) {
      return;
    }
    for (const id of this.pendingRemove) {
      const entity = this.entities.get(id);
      if (entity === undefined) {
        continue;
      }
      this.entities.delete(id);
      this.byUuid.delete(entity.uuid);
      if (entity.isPassiveCreature) this.passiveCreatureCount -= 1;
      if (entity.isHostileMob) this.hostileMobCount -= 1;
      this.removeFromChunkBucket(entity);
      entity.onRemove();
      this.markChunkDirty(entity.chunkX, entity.chunkZ);
    }
    this.pendingRemove.clear();
  }

  // ---- Chunk ownership & streaming --------------------------------------

  private updateChunkOwnership(entity: Entity): void {
    const { chunkX, chunkZ } = chunkCoordsOf(entity.position.x, entity.position.z);
    if (chunkX === entity.chunkX && chunkZ === entity.chunkZ) {
      return;
    }
    const oldX = entity.chunkX;
    const oldZ = entity.chunkZ;
    this.removeFromChunkBucket(entity);
    entity.chunkX = chunkX;
    entity.chunkZ = chunkZ;
    this.addToChunkBucket(entity);
    // Re-save both chunks so the entity is stored only with its new owner and
    // dropped from the old owner's record — preventing duplicate saves.
    this.markChunkDirty(oldX, oldZ);
    this.markChunkDirty(chunkX, chunkZ);
  }

  private addToChunkBucket(entity: Entity): void {
    const key = chunkKey(entity.chunkX, entity.chunkZ);
    let bucket = this.byChunk.get(key);
    if (bucket === undefined) {
      bucket = new Set<number>();
      this.byChunk.set(key, bucket);
    }
    bucket.add(entity.id);
  }

  private removeFromChunkBucket(entity: Entity): void {
    const key = chunkKey(entity.chunkX, entity.chunkZ);
    const bucket = this.byChunk.get(key);
    if (bucket === undefined) {
      return;
    }
    bucket.delete(entity.id);
    if (bucket.size === 0) {
      this.byChunk.delete(key);
    }
  }

  /** Chunk unloaded: park its entities (keep instances, free render, stop ticking). */
  private onChunkRemoved(chunk: Chunk): void {
    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    const bucket = this.byChunk.get(key);
    if (bucket === undefined || bucket.size === 0) {
      this.byChunk.delete(key);
      return;
    }
    const parkedList: Entity[] = [];
    for (const id of bucket) {
      const entity = this.entities.get(id);
      if (entity === undefined) {
        continue;
      }
      this.entities.delete(id);
      this.byUuid.delete(entity.uuid);
      if (entity.isPassiveCreature) this.passiveCreatureCount -= 1;
      if (entity.isHostileMob) this.hostileMobCount -= 1;
      entity.onPark();
      parkedList.push(entity);
    }
    this.byChunk.delete(key);
    if (parkedList.length > 0) {
      const existing = this.parked.get(key);
      if (existing === undefined) {
        this.parked.set(key, parkedList);
      } else {
        existing.push(...parkedList);
      }
    }
  }

  /** Chunk (re)loaded: restore any parked entities for it. */
  private onChunkCreated(chunk: Chunk): void {
    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    const parkedList = this.parked.get(key);
    if (parkedList === undefined || parkedList.length === 0) {
      return;
    }
    this.parked.delete(key);
    for (const entity of parkedList) {
      if (this.byUuid.has(entity.uuid)) {
        continue; // already present (de-dupe)
      }
      this.entities.set(entity.id, entity);
      this.byUuid.set(entity.uuid, entity);
      if (entity.isPassiveCreature) this.passiveCreatureCount += 1;
      if (entity.isHostileMob) this.hostileMobCount += 1;
      entity.onRestore(this.context);
      this.addToChunkBucket(entity);
    }
  }

  // ---- Queries (chunk-first) --------------------------------------------

  public getById(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  public getByUuid(uuid: string): Entity | undefined {
    return this.byUuid.get(uuid);
  }

  public getEntitiesInChunk(chunkX: number, chunkZ: number): Entity[] {
    const bucket = this.byChunk.get(chunkKey(chunkX, chunkZ));
    if (bucket === undefined) {
      return [];
    }
    const out: Entity[] = [];
    for (const id of bucket) {
      const entity = this.entities.get(id);
      if (entity !== undefined) {
        out.push(entity);
      }
    }
    return out;
  }

  /**
   * Returns active entities whose AABB intersects `box`. Begins from the chunk
   * buckets overlapping the box (never scans the whole world), then filters
   * locally. Scales to hundreds/thousands of entities.
   */
  public getEntitiesInAABB<T extends Entity>(box: AABB, predicate: (entity: Entity) => entity is T): T[];
  public getEntitiesInAABB(box: AABB, predicate?: (entity: Entity) => boolean): Entity[];
  public getEntitiesInAABB(box: AABB, predicate?: (entity: Entity) => boolean): Entity[] {
    const minCX = Math.floor(box.minX / 16);
    const maxCX = Math.floor(box.maxX / 16);
    const minCZ = Math.floor(box.minZ / 16);
    const maxCZ = Math.floor(box.maxZ / 16);
    const out: Entity[] = [];
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const bucket = this.byChunk.get(chunkKey(cx, cz));
        if (bucket === undefined) {
          continue;
        }
        for (const id of bucket) {
          const entity = this.entities.get(id);
          if (entity === undefined) {
            continue;
          }
          if (!box.intersects(entity.getAABB())) {
            continue;
          }
          if (predicate !== undefined && !predicate(entity)) {
            continue;
          }
          out.push(entity);
        }
      }
    }
    return out;
  }

  public forEachActive(fn: (entity: Entity) => void): void {
    for (const entity of this.entities.values()) {
      fn(entity);
    }
  }

  public get activeCount(): number {
    return this.entities.size;
  }

  public get activePassiveCreatureCount(): number {
    return this.passiveCreatureCount;
  }

  public get activeHostileMobCount(): number {
    let pendingHostileRemovals = 0;
    for (const id of this.pendingRemove) if (this.entities.get(id)?.isHostileMob) pendingHostileRemovals++;
    return this.hostileMobCount - pendingHostileRemovals;
  }

  public get parkedCount(): number {
    let count = 0;
    for (const list of this.parked.values()) {
      count += list.length;
    }
    return count;
  }

  public get currentTick(): number {
    return this.gameTick;
  }

  // ---- Persistence dispatch ---------------------------------------------

  /**
   * Serialises every entity that belongs to chunk `(chunkX, chunkZ)` — active
   * or parked — exactly once. An entity lives in precisely one of the two
   * buckets for a chunk, so it can never be double-saved.
   */
  public serializeChunkEntities(chunkX: number, chunkZ: number): NbtCompound[] {
    const key = chunkKey(chunkX, chunkZ);
    const out: NbtCompound[] = [];
    const bucket = this.byChunk.get(key);
    if (bucket !== undefined) {
      for (const id of bucket) {
        const entity = this.entities.get(id);
        if (entity !== undefined) {
          out.push(entity.writeToNbt());
        }
      }
    }
    const parkedList = this.parked.get(key);
    if (parkedList !== undefined) {
      for (const entity of parkedList) {
        out.push(entity.writeToNbt());
      }
    }
    return out;
  }

  /** True if parked (in-memory) entities exist for a chunk — authoritative
   * over a cold disk load within the same session. */
  public hasParkedEntities(chunkX: number, chunkZ: number): boolean {
    const list = this.parked.get(chunkKey(chunkX, chunkZ));
    return list !== undefined && list.length > 0;
  }

  /**
   * Recreates entities from a chunk's saved `Entities` records. Unknown type
   * ids are skipped safely; records whose UUID already exists are skipped to
   * avoid duplicate loads.
   */
  public loadChunkEntities(tags: readonly NbtCompound[]): void {
    for (const data of tags) {
      const idTag = data.value.get('id');
      if (idTag?.type !== 'string') {
        continue;
      }
      const entity = this.typeRegistry.create(idTag.value, this.context, data);
      if (entity === undefined) {
        continue;
      }
      if (this.byUuid.has(entity.uuid)) {
        continue;
      }
      this.add(entity);
    }
  }

  public dispose(): void {
    for (const entity of this.entities.values()) {
      entity.onRemove();
    }
    for (const list of this.parked.values()) {
      for (const entity of list) {
        entity.onRemove();
      }
    }
    this.entities.clear();
    this.byUuid.clear();
    this.byChunk.clear();
    this.parked.clear();
    this.pendingAdd.length = 0;
    this.pendingRemove.clear();
    this.passiveCreatureCount = 0;
    this.hostileMobCount = 0;
  }

  private tickContext(): EntityTickContext {
    return { world: this.context, gameTick: this.gameTick };
  }

  private markChunkDirty(chunkX: number, chunkZ: number): void {
    this.chunkManager.getChunk(chunkX, chunkZ)?.markEntitiesDirty();
  }
}
