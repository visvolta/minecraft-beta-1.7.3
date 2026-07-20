import * as THREE from 'three';
import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { JavaRandom } from '../src/world/generation/random/JavaRandom.ts';
import { AABB } from '../src/physics/AABB.ts';
import { EntityManager } from '../src/entities/core/EntityManager.ts';
import { EntityPhysics, type PhysicsMovable } from '../src/entities/core/EntityPhysics.ts';
import { createDefaultEntityTypeRegistry } from '../src/entities/core/EntityType.ts';
import { registerEntityTypes } from '../src/entities/registerEntityTypes.ts';
import { DroppedItemEntity } from '../src/entities/items/DroppedItemEntity.ts';
import { FallingBlockEntity } from '../src/entities/FallingBlockEntity.ts';
import { PigEntity } from '../src/entities/living/PigEntity.ts';
import { Pathfinder } from '../src/entities/nav/Pathfinder.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

interface World {
  blocks: BlockRegistry;
  behaviours: BlockBehaviourRegistry;
  world: BlockUpdateWorld;
  chunks: ChunkManager;
  entities: EntityManager;
  physics: EntityPhysics;
  pathfinder: Pathfinder;
}

function buildWorld(chunkRadius = 2): World {
  const blocks = new BlockRegistry();
  registerDefaultBlocks(blocks);
  const chunks = new ChunkManager();
  for (let x = -chunkRadius; x <= chunkRadius; x++) {
    for (let z = -chunkRadius; z <= chunkRadius; z++) {
      chunks.getOrCreateChunk(x, z);
    }
  }
  const light = new LightEngine(chunks, blocks);
  const world = new BlockUpdateWorld(chunks, blocks, light);
  const behaviours = new BlockBehaviourRegistry();

  const scene = new THREE.Scene();
  const mockAtlas = { texture: new THREE.Texture(), getUvRect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) } as never;
  const mockItemAtlas = { texture: new THREE.Texture(), getUvRect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) } as never;
  const material = new THREE.MeshBasicMaterial();
  const registry = createDefaultEntityTypeRegistry();
  registerEntityTypes(registry);
  const entities = new EntityManager({
    blockRegistry: blocks,
    behaviourRegistry: behaviours,
    blockUpdateWorld: world,
    chunkManager: chunks,
    scene,
    blockAtlas: mockAtlas,
    itemAtlas: mockItemAtlas,
    heldBlockMaterial: material,
    itemHeldMaterial: material,
    typeRegistry: registry,
    rng: new JavaRandom(987654321n),
  });

  const physics = new EntityPhysics(blocks, behaviours, world);
  const pathfinder = new Pathfinder(blocks, behaviours, world);
  return { blocks, behaviours, world, chunks, entities, physics, pathfinder };
}

/** Lays a solid stone floor at y=10 across all loaded chunks. */
function layFloor(w: World, y = 10): void {
  for (let x = -32; x <= 32; x++) {
    for (let z = -32; z <= 32; z++) {
      w.world.setBlock(x, y, z, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
    }
  }
}

/** A minimal physics body for collision tests. */
class TestBody implements PhysicsMovable {
  public readonly position = { x: 0, y: 0, z: 0 };
  public readonly velocity = { x: 0, y: 0, z: 0 };
  public stepHeight = 0;
  public onGround = false;
  public isCollidedHorizontally = false;
  public isCollidedVertically = false;
  public constructor(private readonly w: number, private readonly h: number) {}
  public getAABB(): AABB {
    const hw = this.w / 2;
    return new AABB(
      this.position.x - hw, this.position.y, this.position.z - hw,
      this.position.x + hw, this.position.y + this.h, this.position.z + hw,
    );
  }
}

// ============================================================
// Deferred add/remove: no mutation during iteration, cleanup exactly once
// ============================================================
{
  const w = buildWorld();
  layFloor(w);
  const a = new DroppedItemEntity(w.entities.context, { type: 'block', id: BlockIds.Stone, count: 1, metadata: 0 }, 0.5, 12, 0.5, 10);
  const b = new DroppedItemEntity(w.entities.context, { type: 'block', id: BlockIds.Stone, count: 1, metadata: 0 }, 2.5, 12, 0.5, 10);
  w.entities.add(a);
  w.entities.add(b);
  w.entities.tick(); // flush adds
  assert(w.entities.activeCount === 2, 'both entities should be active after flush');

  // Remove one and let the survivor try to remove the other during the same tick.
  w.entities.remove(a);
  w.entities.tick();
  assert(w.entities.activeCount === 1, 'removed entity should be cleaned up exactly once');
  assert(a.removed && a.renderObject === null, 'removed entity disposed its render object');
  // A second remove is a no-op (idempotent).
  w.entities.remove(a);
  w.entities.tick();
  assert(w.entities.activeCount === 1, 'double-remove must not affect other entities');
}

// ============================================================
// Chunk migration: owner chunk updates as the entity crosses a border
// ============================================================
{
  const w = buildWorld();
  layFloor(w);
  const item = new DroppedItemEntity(w.entities.context, { type: 'block', id: BlockIds.Stone, count: 1, metadata: 0 }, 15.5, 12, 0.5, 10);
  w.entities.add(item);
  w.entities.tick();
  assert(item.chunkX === 0 && item.chunkZ === 0, 'item starts in chunk (0,0)');
  assert(w.entities.getEntitiesInChunk(0, 0).length === 1, 'item queryable in chunk (0,0)');

  // Move it across the +X border into chunk (1,0) and tick.
  item.position.x = 16.5;
  w.entities.tick();
  assert(item.chunkX === 1 && item.chunkZ === 0, 'item migrated to chunk (1,0)');
  assert(w.entities.getEntitiesInChunk(0, 0).length === 0, 'item no longer in old chunk bucket');
  assert(w.entities.getEntitiesInChunk(1, 0).length === 1, 'item queryable in new chunk');
}

// ============================================================
// Save/load duplication: an entity serialises with exactly one owner chunk
// ============================================================
{
  const w = buildWorld();
  layFloor(w);
  const item = new DroppedItemEntity(w.entities.context, { type: 'block', id: BlockIds.Stone, count: 1, metadata: 0 }, 15.5, 12, 0.5, 10);
  w.entities.add(item);
  w.entities.tick();

  // Before crossing: serialised only with chunk (0,0).
  assert(w.entities.serializeChunkEntities(0, 0).length === 1, 'entity saved with owner chunk');
  assert(w.entities.serializeChunkEntities(1, 0).length === 0, 'entity not saved with non-owner chunk');

  // Cross into (1,0): now only with (1,0), never both.
  item.position.x = 16.5;
  w.entities.tick();
  const oldCount = w.entities.serializeChunkEntities(0, 0).length;
  const newCount = w.entities.serializeChunkEntities(1, 0).length;
  assert(oldCount === 0 && newCount === 1, 'entity saved with exactly one chunk after migration');

  // Load de-dupe: loading the same record twice yields exactly one entity.
  const tags = w.entities.serializeChunkEntities(1, 0);
  assert(tags.length === 1, 'one record to load');
  // Remove the original so we test the load path in isolation.
  w.entities.remove(item);
  w.entities.tick();
  assert(w.entities.activeCount === 0, 'original removed before load test');
  w.entities.loadChunkEntities(tags);
  w.entities.loadChunkEntities(tags); // duplicate of the same UUID
  w.entities.tick();
  assert(w.entities.activeCount === 1, 'duplicate load of the same UUID yields exactly one entity');
}

// ============================================================
// Collision symmetry: pushing either direction stops at the wall face
// ============================================================
{
  const w = buildWorld();
  // A wall block column at x=10 (occupies 10..11), full height around y=11.
  for (let y = 0; y < 20; y++) {
    w.world.setBlock(10, y, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  }

  // Approach from the left (moving +X).
  const fromLeft = new TestBody(0.5, 0.5);
  fromLeft.position.x = 8.5; fromLeft.position.y = 11; fromLeft.position.z = 0.5;
  for (let i = 0; i < 40; i++) {
    fromLeft.velocity.x = 0.3;
    w.physics.move(fromLeft);
  }
  const leftMax = fromLeft.position.x + 0.25;

  // Approach from the right (moving -X).
  const fromRight = new TestBody(0.5, 0.5);
  fromRight.position.x = 12.5; fromRight.position.y = 11; fromRight.position.z = 0.5;
  for (let i = 0; i < 40; i++) {
    fromRight.velocity.x = -0.3;
    w.physics.move(fromRight);
  }
  const rightMin = fromRight.position.x - 0.25;

  assert(leftMax <= 10.0 + 1e-6 && leftMax >= 10.0 - 0.01, `+X approach must stop at the wall face (got ${leftMax})`);
  assert(rightMin >= 11.0 - 1e-6 && rightMin <= 11.0 + 0.01, `-X approach must stop at the wall face (got ${rightMin})`);
}

// ============================================================
// Unloaded entities stop ticking; restored entities resume
// ============================================================
{
  const w = buildWorld();
  layFloor(w);
  const pig = new PigEntity(w.entities.context, 0.5, 12, 0.5);
  w.entities.add(pig);
  w.entities.tick();
  assert(w.entities.activeCount === 1, 'pig active');

  // Unload its chunk: pig parks (stops ticking).
  const ageBefore = pig.age;
  w.chunks.removeChunk(0, 0);
  assert(w.entities.activeCount === 0 && w.entities.parkedCount >= 1, 'pig parked on chunk unload');
  w.entities.tick();
  w.entities.tick();
  assert(pig.age === ageBefore, 'parked pig must not tick');

  // Reload: pig restores and resumes ticking.
  w.chunks.getOrCreateChunk(0, 0);
  assert(w.entities.activeCount === 1, 'pig restored on chunk reload');
  w.entities.tick();
  assert(pig.age === ageBefore + 1, 'restored pig resumes ticking');
}

// ============================================================
// Renderer disposal: removal frees the render object from the scene
// ============================================================
{
  const w = buildWorld();
  layFloor(w);
  const scene = w.entities.context.scene;
  const pig = new PigEntity(w.entities.context, 0.5, 12, 0.5);
  w.entities.add(pig);
  w.entities.tick();
  const sceneChildrenWithPig = scene.children.length;
  assert(pig.renderObject !== null, 'pig has a render object while active');

  pig.markRemoved();
  w.entities.tick();
  assert(pig.renderObject === null, 'render object cleared after removal');
  assert(scene.children.length < sceneChildrenWithPig, 'render object removed from scene on removal');
}

// ============================================================
// Living-entity damage: health, invulnerability window, death
// ============================================================
{
  const w = buildWorld();
  layFloor(w);
  const pig = new PigEntity(w.entities.context, 0.5, 12, 0.5);
  assert(pig.health === 10 && pig.maxHealth === 10, 'pig starts at full health');

  assert(pig.attackEntityFrom(4) === true, 'first hit lands');
  assert(pig.health === 6, 'health reduced by damage');
  assert(pig.hurtResistantTime > 0, 'invulnerability window active after hit');

  // A second hit during the invulnerability window is ignored.
  assert(pig.attackEntityFrom(4) === false, 'hit during invulnerability is ignored');
  assert(pig.health === 6, 'health unchanged during invulnerability');

  // Damage that drops to zero triggers death handling.
  pig.hurtResistantTime = 0;
  pig.attackEntityFrom(99);
  assert(pig.health === 0, 'lethal damage drops health to zero');
  assert(!pig.isAlive(), 'pig is no longer alive at zero health');
}

// ============================================================
// Pathfinding: walls block, gaps pass, steps climb, budget bounded
// ============================================================
{
  const w = buildWorld();
  layFloor(w, 10);

  // 1) Impassable wall (3 high, spanning z) blocks the path.
  for (let z = -16; z <= 16; z++) {
    for (let y = 11; y <= 13; y++) {
      w.world.setBlock(5, y, z, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
    }
  }
  const blocked = w.pathfinder.createPath({ x: 0.5, y: 11, z: 0.5 }, { x: 10.5, y: 11, z: 0.5 }, { maxDistance: 12, maxNodes: 200 });
  assert(blocked === undefined, 'a tall spanning wall must block the path');

  // 2) A 1-wide gap in the wall lets the path through.
  for (let y = 11; y <= 13; y++) {
    w.world.setBlock(5, y, 0, BlockIds.Air, { notifyNeighbours: false, updateLighting: false });
  }
  const throughGap = w.pathfinder.createPath({ x: 0.5, y: 11, z: 0.5 }, { x: 10.5, y: 11, z: 0.5 }, { maxDistance: 16, maxNodes: 400 });
  assert(throughGap !== undefined, 'a gap in the wall must allow a path');

  // 3) Step-up: a 1-block rise is climbable (stepHeight 1).
  const w2 = buildWorld();
  layFloor(w2, 10);
  for (let x = 3; x <= 8; x++) {
    w2.world.setBlock(x, 11, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  }
  const step = w2.pathfinder.createPath({ x: 0.5, y: 11, z: 0.5 }, { x: 6.5, y: 12, z: 0.5 }, { stepHeight: 1, maxDistance: 16 });
  assert(step !== undefined, 'a 1-block step must be pathable with stepHeight 1');

  // 4) Node budget: a distant target with a tiny budget yields no path and returns promptly.
  const budgeted = w2.pathfinder.createPath({ x: 0.5, y: 11, z: 0.5 }, { x: 60.5, y: 11, z: 0.5 }, { maxNodes: 16, maxDistance: 80 });
  assert(budgeted === undefined, 'an exhausted node budget must not produce a path');
}

// ============================================================
// Pig end-to-end: spawn, wander, survive, save/load round-trip
// ============================================================
{
  const w = buildWorld(3);
  // Grass floor so wander weighting has somewhere to prefer.
  for (let x = -40; x <= 40; x++) {
    for (let z = -40; z <= 40; z++) {
      w.world.setBlock(x, 10, z, BlockIds.Grass, { notifyNeighbours: false, updateLighting: false });
    }
  }

  const pig = new PigEntity(w.entities.context, 0.5, 12, 0.5);
  w.entities.add(pig);
  const startX = pig.position.x;
  const startZ = pig.position.z;

  // Run the simulation; the pig should wander and remain alive.
  for (let i = 0; i < 200; i++) {
    w.entities.tick();
    if (!pig.isAlive()) break;
  }
  assert(pig.isAlive(), 'pig must survive normal wandering');
  const moved = Math.hypot(pig.position.x - startX, pig.position.z - startZ) > 0.05;
  assert(moved, 'pig must move while wandering');
  assert(pig.onGround, 'pig must rest on the ground');

  // Interpolation must not throw and must place the model.
  pig.updateRenderInterpolation(0.5);
  assert(pig.renderObject !== null, 'pig render object present for interpolation');

  // Save/load round-trip preserves identity, health and position.
  const saved = pig.writeToNbt();
  const loaded = PigEntity.deserialize(w.entities.context, saved);
  assert(loaded !== undefined, 'pig deserialises');
  assert(loaded!.uuid === pig.uuid, 'UUID preserved across save/load');
  assert(loaded!.health === pig.health, 'health preserved across save/load');
  assert(Math.abs(loaded!.position.x - pig.position.x) < 1e-9, 'position preserved across save/load');
  assert(loaded!.typeStringId === 'Pig', 'type id preserved');
}

// ============================================================
// Falling block + item still behave under the shared manager
// ============================================================
{
  const w = buildWorld();
  layFloor(w, 10);
  const sand = new FallingBlockEntity(w.entities.context, BlockIds.Sand, 0, 0.5, 20.5, 0.5);
  w.entities.add(sand);
  for (let i = 0; i < 100; i++) {
    w.entities.tick();
    if (w.entities.activeCount === 0) break;
  }
  assert(w.world.getBlock(0, 11, 0) === BlockIds.Sand, 'falling sand lands and places via the shared manager');

  const item = new DroppedItemEntity(w.entities.context, { type: 'block', id: BlockIds.Stone, count: 1, metadata: 0 }, 4.5, 12, 4.5, 10);
  w.entities.add(item);
  w.entities.tick();
  for (let i = 0; i < 30; i++) w.entities.tick();
  assert(item.onGround, 'dropped item settles on the ground via shared physics');
}

console.log('Entity system validation passed.');
