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
import { DamageSource } from '../src/entities/damage/DamageSource.ts';
import { CountingParticleSink } from '../src/entities/particles/EntityParticleSink.ts';
import { selectMeleeTarget } from '../src/player/MeleeTargeting.ts';
import { MELEE_REACH } from '../src/player/PlayerConstants.ts';
import { PigModel } from '../src/entities/living/PigModel.ts';

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
  particles: CountingParticleSink;
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
  const particles = new CountingParticleSink();
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
    particles,
  });

  const physics = new EntityPhysics(blocks, behaviours, world);
  const pathfinder = new Pathfinder(blocks, behaviours, world);
  return { blocks, behaviours, world, chunks, entities, physics, pathfinder, particles };
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

  assert(pig.attackEntityFrom(DamageSource.generic(), 4) === true, 'first hit lands');
  assert(pig.health === 6, 'health reduced by damage');
  assert(pig.hurtResistantTime > 0, 'invulnerability window active after hit');

  // A second, equal hit during the invulnerability window is rejected.
  assert(pig.attackEntityFrom(DamageSource.generic(), 4) === false, 'equal hit during invulnerability is ignored');
  assert(pig.health === 6, 'health unchanged during invulnerability');

  // A stronger hit during the window applies only the excess (Beta repeated-hit protection).
  assert(pig.attackEntityFrom(DamageSource.generic(), 7) === true, 'stronger hit during invulnerability applies excess');
  assert(pig.health === 3, 'only the excess damage (7-4=3) was applied');

  // Damage that drops to zero triggers death handling.
  pig.hurtResistantTime = 0;
  pig.attackEntityFrom(DamageSource.generic(), 99);
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

// ============================================================
// Stage 7B helpers
// ============================================================
function layGrassFloor(w: World, y = 10): void {
  for (let x = -40; x <= 40; x++) {
    for (let z = -40; z <= 40; z++) {
      w.world.setBlock(x, y, z, BlockIds.Grass, { notifyNeighbours: false, updateLighting: false });
    }
  }
}

function countPork(entities: EntityManager): number {
  let count = 0;
  entities.forEachActive((entity) => {
    if (entity instanceof DroppedItemEntity && entity.drop.id === 'porkchop_raw') {
      count += entity.drop.count;
    }
  });
  return count;
}

// ============================================================
// 7B: Beta-like gradual movement and terminal walk speed
// ============================================================
{
  const w = buildWorld(3);
  layGrassFloor(w, 10);
  const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  w.entities.add(pig);
  w.entities.tick(); // settle onto the ground

  pig.navigation.moveTo(pig, { x: 15.5, y: 11, z: 0.5 });
  w.entities.tick(); // first movement tick from rest
  const speedAfterOne = Math.hypot(pig.velocity.x, pig.velocity.z);
  assert(speedAfterOne < 0.05, `movement accelerates gradually, not instantly (got ${speedAfterOne})`);

  for (let i = 0; i < 60; i++) w.entities.tick();
  const terminal = Math.hypot(pig.velocity.x, pig.velocity.z);
  assert(terminal > 0.04 && terminal < 0.13, `Beta-like terminal walk speed (got ${terminal})`);
}

// ============================================================
// 7B: smooth (clamped) body turn + head independent of body
// ============================================================
{
  const w = buildWorld(3);
  layGrassFloor(w, 10);
  const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  w.entities.add(pig);
  w.entities.tick();

  // Moving toward +X: heading jumps to ~-90°, but the body must turn only a
  // clamped amount per tick (smooth), never snapping to the heading.
  pig.yaw = 0;
  pig.renderYawOffset = 0;
  pig.navigation.moveTo(pig, { x: 15.5, y: 11, z: 0.5 });
  w.entities.tick();
  assert(Math.abs(pig.renderYawOffset) <= 10.001, `body turn is clamped per tick (got ${pig.renderYawOffset})`);
  assert(Math.abs(pig.renderYawOffset) < Math.abs(pig.yaw), 'body lags behind the heading (does not snap)');
}
{
  const w = buildWorld(3);
  layGrassFloor(w, 10);
  const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  w.entities.add(pig);
  w.entities.tick();

  // Idle: turn the head far from the heading; the body must NOT chase the head
  // (it eases toward the heading, which is unchanged), proving independence.
  pig.yaw = 0;
  pig.renderYawOffset = 0;
  pig.headYaw = 80;
  w.entities.tick();
  assert(Math.abs(pig.renderYawOffset) < 5, 'body does not snap to an independently-turned head');
}

// ============================================================
// 7B: entity↔entity pushing (Beta applyEntityCollision)
// ============================================================
{
  const w = buildWorld();
  layGrassFloor(w, 10);
  const a = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  const b = new PigEntity(w.entities.context, 0.9, 11, 0.5);
  a.applyEntityCollision(b);
  assert(a.velocity.x < 0 && b.velocity.x > 0, 'applyEntityCollision pushes overlapping entities apart');
  assert(Math.abs(a.velocity.x + b.velocity.x) < 1e-9, 'push impulse is equal and opposite (symmetric)');
  assert(a.velocity.y === 0 && b.velocity.y === 0, 'push is horizontal-only (no launching)');
}
{
  // Manager-level: overlapping pigs separate over time.
  const w = buildWorld(2);
  layGrassFloor(w, 10);
  const a = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  const b = new PigEntity(w.entities.context, 0.8, 11, 0.5);
  w.entities.add(a);
  w.entities.add(b);
  const initial = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
  for (let i = 0; i < 12; i++) w.entities.tick();
  const after = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
  assert(after > initial, 'overlapping pigs separate via mob↔mob pushing');
}

// ============================================================
// 7B: player pushes a pig (impulse applied via player.velocity)
// ============================================================
{
  const w = buildWorld();
  layGrassFloor(w, 10);
  const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  w.entities.add(pig);
  w.entities.tick();

  const player = {
    position: { x: 0.95, y: 11, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    getAABB: () => new AABB(0.95 - 0.3, 11, 0.5 - 0.3, 0.95 + 0.3, 11 + 1.8, 0.5 + 0.3),
  };
  const pigVxBefore = pig.velocity.x;
  w.entities.collideWithPlayer(player);
  assert(pig.velocity.x < pigVxBefore, 'player pushes the pig away (pig velocity nudged -X)');
  assert(player.velocity.x > 0, 'player receives the opposite impulse through its velocity');
  assert(player.position.x === 0.95, 'player is not repositioned directly (only velocity changed)');
}

// ============================================================
// 7B: no clipping through terrain when pushed into a wall
// ============================================================
{
  const w = buildWorld(2);
  layGrassFloor(w, 10);
  // A wide wall at x=3 the pig cannot go around within the test window.
  for (let y = 11; y < 20; y++) {
    for (let z = -8; z <= 8; z++) {
      w.world.setBlock(3, y, z, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
    }
  }
  const pig = new PigEntity(w.entities.context, 2.5, 11, 0.5);
  w.entities.add(pig);
  w.entities.tick();
  for (let i = 0; i < 60; i++) {
    pig.velocity.x = 0.5; // keep shoving toward the wall
    w.entities.tick();
  }
  assert(pig.position.x < 3.0, `pushed pig must not clip through the wall (x=${pig.position.x})`);
}

// ============================================================
// 7B: pork drop hook yields a valid 1–3 stack on death
// ============================================================
{
  const w = buildWorld(2);
  layGrassFloor(w, 10);
  let totalDropped = 0;
  let trials = 0;
  for (let t = 0; t < 20; t++) {
    const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
    w.entities.add(pig);
    w.entities.tick();
    pig.hurtResistantTime = 0;
    pig.attackEntityFrom(DamageSource.generic(), 99); // lethal
    for (let i = 0; i < 40; i++) w.entities.tick(); // run out the death linger + drop
    const dropped = countPork(w.entities);
    if (dropped > 0) {
      totalDropped += dropped;
      trials += 1;
      assert(dropped >= 1 && dropped <= 3, `pork drop count must be 1–3 (got ${dropped})`);
    }
    // Clean up dropped items for the next trial.
    w.entities.forEachActive((e) => { if (e instanceof DroppedItemEntity) e.markRemoved(); });
    w.entities.tick();
  }
  assert(trials > 0 && totalDropped > 0, 'death produced pork drops');
}

// ============================================================
// 7B: navigation still routes up a 1-block step (stepHeight reduced to 0.5,
// pathfinder max step-up decoupled to 1)
// ============================================================
{
  const w = buildWorld(3);
  // Lower floor (top y=11) for x<3, raised floor (top y=12) for x>=3.
  for (let x = -16; x < 3; x++) {
    for (let z = -3; z <= 3; z++) {
      w.world.setBlock(x, 10, z, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
    }
  }
  for (let x = 3; x <= 16; x++) {
    for (let z = -3; z <= 3; z++) {
      w.world.setBlock(x, 10, z, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
      w.world.setBlock(x, 11, z, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
    }
  }
  const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  assert(pig.stepHeight === 0.5, 'pig step height reduced to Beta 0.5');
  const found = pig.navigation.moveTo(pig, { x: 8.5, y: 12, z: 0.5 });
  assert(found, 'navigation routes a path up a 1-block step despite physics stepHeight 0.5');

  // End-to-end: the pig actually climbs onto the upper floor.
  w.entities.add(pig);
  w.entities.tick();
  pig.navigation.moveTo(pig, { x: 8.5, y: 12, z: 0.5 });
  for (let i = 0; i < 240; i++) w.entities.tick();
  assert(pig.position.y >= 11.5, `pig climbs the 1-block step (feet y=${pig.position.y})`);
}

// ============================================================
// 7C: melee target selection — nearest valid entity within reach
// ============================================================
{
  const w = buildWorld(2);
  layGrassFloor(w, 10);
  const near = new PigEntity(w.entities.context, 1.5, 11, 0.5);
  const far = new PigEntity(w.entities.context, 2.5, 11, 0.5);
  w.entities.add(near);
  w.entities.add(far);
  w.entities.tick();

  const eye = { x: 0, y: 11.45, z: 0.5 };
  const look = { x: 1, y: 0, z: 0 };
  const candidates = [near, far];
  const hit = selectMeleeTarget(eye, look, MELEE_REACH, candidates);
  assert(hit !== undefined && hit.entity === near, 'nearest pig is selected');
}

// ============================================================
// 7C: attack blocked by terrain (reach capped at block-hit distance)
// ============================================================
{
  const w = buildWorld(2);
  layGrassFloor(w, 10);
  const behind = new PigEntity(w.entities.context, 4.0, 11, 0.5);
  w.entities.add(behind);
  w.entities.tick();

  const eye = { x: 0, y: 11.45, z: 0.5 };
  const look = { x: 1, y: 0, z: 0 };
  // A wall at x=2 means the block-hit distance is ~2.0, so melee reach is
  // capped to 2.0 and the pig at x=4 (beyond it) cannot be targeted.
  const cappedReach = Math.min(MELEE_REACH, 2.0);
  const hit = selectMeleeTarget(eye, look, cappedReach, [behind]);
  assert(hit === undefined, 'pig behind a wall (beyond capped reach) is not targetable');
  // Sanity: a dead pig is never a valid target.
  behind.attackEntityFrom(DamageSource.generic(), 99);
  const alive = [behind].filter((e) => e.canBeCollidedWith());
  assert(alive.length === 0, 'dead pig is not collidable/targetable');
}

// ============================================================
// 7C: directional knockback + zero-distance safety
// ============================================================
{
  const w = buildWorld(2);
  layGrassFloor(w, 10);
  const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  w.entities.add(pig);
  w.entities.tick();

  // Attacker to the -X side → pig knocked toward +X (away), with a vertical pop.
  const attacker = { position: { x: -2, y: 11, z: 0.5 } };
  pig.attackEntityFrom(DamageSource.player(attacker), 1);
  assert(pig.velocity.x > 0, 'knockback pushes the pig away from the attacker (+X)');
  assert(pig.velocity.y > 0 && pig.velocity.y <= 0.4 + 1e-6, 'knockback adds a capped vertical pop');

  // Zero-distance knockback: no NaN, no horizontal launch, still safe.
  const pig2 = new PigEntity(w.entities.context, 5.5, 11, 0.5);
  pig2.knockBack(pig2.position.x, pig2.position.z);
  assert(Number.isFinite(pig2.velocity.x) && Number.isFinite(pig2.velocity.z), 'zero-distance knockback is finite');
  assert(Math.abs(pig2.velocity.x) < 1e-6 && Math.abs(pig2.velocity.z) < 1e-6, 'zero-distance knockback has no horizontal launch');
}

// ============================================================
// 7C: hurt timer + red flash reset (no permanent tint, no new material)
// ============================================================
{
  const w = buildWorld(2);
  layGrassFloor(w, 10);
  const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  w.entities.add(pig);
  w.entities.tick();
  pig.attackEntityFrom(DamageSource.generic(), 1);
  assert(pig.hurtTime === 10 && pig.maxHurtTime === 10, 'hurt timer set on a full hit');
  w.entities.tick();
  assert(pig.hurtTime === 9, 'hurt timer decrements each tick');

  // Red flash lerps existing material colour and fully resets at amount 0.
  const fresh = new PigModel();
  const flashed = new PigModel();
  flashed.setHurtFlash(1);
  flashed.setHurtFlash(0);
  assert(flashed.bodyMaterial.color.equals(fresh.bodyMaterial.color), 'hurt flash resets to base colour (no permanent tint)');
  fresh.dispose();
  flashed.dispose();
}

// ============================================================
// 7C: panic — priority override, flee, and clean expiry
// ============================================================
{
  const w = buildWorld(3);
  layGrassFloor(w, 10);
  const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  w.entities.add(pig);
  w.entities.tick();

  const attacker = { position: { x: -3, y: 11, z: 0.5 } };
  pig.attackEntityFrom(DamageSource.player(attacker), 1);
  assert(pig.recentlyHurt === true, 'a full hit sets the panic trigger');

  w.entities.tick(); // PanicTask starts, consuming the trigger
  assert(pig.recentlyHurt === false, 'panic consumes the trigger');
  assert(pig.moveSpeed > 0.7, 'panic boosts movement speed');

  for (let i = 0; i < 80; i++) w.entities.tick(); // run out the panic duration
  assert(Math.abs(pig.moveSpeed - 0.7) < 1e-6, 'movement speed restored after panic expires');
  assert(pig.isAlive(), 'pig survives a single non-lethal hit and recovers');
}

// ============================================================
// 7C: exactly-once drops, death particles, and cleanup
// ============================================================
{
  const w = buildWorld(2);
  layGrassFloor(w, 10);
  const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  w.entities.add(pig);
  w.entities.tick();
  const deathParticlesBefore = w.particles.deathCount;

  pig.hurtResistantTime = 0;
  pig.attackEntityFrom(DamageSource.generic(), 99); // lethal
  w.entities.tick();

  const dropsOnce = countPork(w.entities);
  const activeAfterKill = w.entities.activeCount; // dead pig (lingering) + its drop entity
  assert(dropsOnce >= 1 && dropsOnce <= 3, 'lethal hit drops 1–3 pork exactly once');
  assert(w.particles.deathCount === deathParticlesBefore + 1, 'death particles fired exactly once');

  for (let i = 0; i < 40; i++) w.entities.tick(); // death linger + beyond
  assert(countPork(w.entities) === dropsOnce, 'no duplicate drops after death');
  assert(w.particles.deathCount === deathParticlesBefore + 1, 'death particles not re-fired');
  assert(pig.removed, 'pig removed after the death linger');
  assert(w.entities.activeCount === activeAfterKill - 1, 'pig removed exactly once; its drop entity remains');
}

// ============================================================
// 7C: repeated rapid hits respect invulnerability (no over-damage)
// ============================================================
{
  const w = buildWorld(2);
  layGrassFloor(w, 10);
  const pig = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  w.entities.add(pig);
  w.entities.tick();

  // Ten immediate fist hits (damage 1): only the first lands during the window.
  let hits = 0;
  for (let i = 0; i < 10; i++) {
    if (pig.attackEntityFrom(DamageSource.generic(), 1)) hits += 1;
  }
  assert(hits === 1, 'rapid equal hits are gated by invulnerability frames');
  assert(pig.health === 9, 'only one point of damage taken from rapid equal hits');
}

// ============================================================
// 7C: fall-damage death drops loot once
// ============================================================
{
  const w = buildWorld(2);
  layGrassFloor(w, 10);
  const pig = new PigEntity(w.entities.context, 0.5, 40, 0.5); // high above the floor
  w.entities.add(pig);
  for (let i = 0; i < 120; i++) w.entities.tick();
  assert(pig.health <= 0, 'a long fall kills the pig via fall damage');
  const drops = countPork(w.entities);
  assert(drops >= 1 && drops <= 3, 'fall death dropped loot once');
}

// ============================================================
// 7C: save/load + chunk-streaming safety (transient state cleared, no double loot)
// ============================================================
{
  const w = buildWorld(2);
  layGrassFloor(w, 10);

  // Live pig: health persists; transient combat state is cleared on load.
  const live = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  live.health = 7;
  live.hurtTime = 5;
  live.recentlyHurt = true;
  live.lastDamageSource = DamageSource.generic();
  const loadedLive = PigEntity.deserialize(w.entities.context, live.writeToNbt());
  assert(loadedLive !== undefined, 'live pig deserialises');
  assert(loadedLive!.health === 7, 'health persists across save/load');
  assert(loadedLive!.hurtTime === 0, 'hurt timer is transient (cleared on load)');
  assert(loadedLive!.recentlyHurt === false, 'panic trigger is transient (cleared on load)');
  assert(loadedLive!.lastDamageSource === undefined, 'attacker/damage source is transient (cleared on load)');

  // Dead pig saved mid-death: on load it resumes dying WITHOUT re-dropping loot.
  const dying = new PigEntity(w.entities.context, 0.5, 11, 0.5);
  w.entities.add(dying);
  w.entities.tick();
  dying.hurtResistantTime = 0;
  dying.attackEntityFrom(DamageSource.generic(), 99); // drops loot now
  w.entities.tick(); // mid-death (deathTime advances)
  const savedDead = dying.writeToNbt();

  // Isolate: clear the world of the original pig and its drops.
  w.entities.forEachActive((e) => e.markRemoved());
  w.entities.tick();
  assert(countPork(w.entities) === 0, 'world cleared before reload test');

  const loadedDead = PigEntity.deserialize(w.entities.context, savedDead);
  assert(loadedDead !== undefined && loadedDead.health === 0, 'dead pig reloads dead');
  w.entities.add(loadedDead!);
  for (let i = 0; i < 40; i++) w.entities.tick(); // continues death → removal
  assert(countPork(w.entities) === 0, 'a pig loaded mid-death does not drop loot twice');
  assert(loadedDead!.removed, 'a loaded dead pig is removed after its linger');
}

console.log('Entity system validation passed.');
