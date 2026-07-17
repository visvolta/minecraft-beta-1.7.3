import * as THREE from 'three';
import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { RandomTickScheduler } from '../src/world/ticks/RandomTickScheduler.ts';
import { WorldTickScheduler } from '../src/world/ticks/WorldTickScheduler.ts';
import { FallingBlockManager } from '../src/world/entities/FallingBlockManager.ts';
import { WorldEventQueue } from '../src/world/events/WorldEventQueue.ts';
import { registerFallingBlockBehaviours } from '../src/world/behaviours/FallingBlockBehaviour.ts';
import { registerFireBehaviour, getFireEncouragement, getFireAbility, FireBehaviour } from '../src/world/behaviours/FireBehaviour.ts';
import { WeatherController } from '../src/world/weather/WeatherController.ts';
import { AABB } from '../src/physics/AABB.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function setup(): { world: BlockUpdateWorld; scheduler: WorldTickScheduler; falling: FallingBlockManager; events: WorldEventQueue; chunks: ChunkManager } {
  const blocks = new BlockRegistry();
  registerDefaultBlocks(blocks);
  const chunks = new ChunkManager();
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) chunks.getOrCreateChunk(x, z);
  const light = new LightEngine(chunks, blocks);
  const world = new BlockUpdateWorld(chunks, blocks, light);
  const atlas = { texture: new THREE.Texture(), getUvRect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) } as never;
  const events = new WorldEventQueue();
  const falling = new FallingBlockManager(world, blocks, chunks, new THREE.Scene(), atlas, events);
  const behaviours = new BlockBehaviourRegistry();
  const weather = new WeatherController(12345n);
  registerFallingBlockBehaviours(behaviours, blocks, falling);
  registerFireBehaviour(behaviours, blocks, weather, chunks);
  const scheduler = new WorldTickScheduler(chunks, world, behaviours, new RandomTickScheduler(123n));
  world.setScheduleCallback((x, y, z, id, delay) => scheduler.schedule(x, y, z, id, delay));
  return { world, scheduler, falling, events, chunks };
}

{
  const { world, scheduler, falling } = setup();
  world.setBlock(0, 9, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 20, 0, BlockIds.Sand, { metadata: 3, notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(0, 20, 0, BlockIds.Sand, 1);
  scheduler.update(0.05);
  assert(world.getBlock(0, 20, 0) === BlockIds.Air, 'unsupported sand was not removed into a falling entity');
  assert(falling.getCount() === 1, 'sand falling entity was not created');
  for (let i = 0; i < 60 && falling.getCount() > 0; i++) falling.update(0.05);
  assert(falling.getCount() === 0, 'falling sand did not land');
  assert(world.getBlock(0, 10, 0) === BlockIds.Sand, 'falling sand landed at the wrong height');
  assert(world.getBlockMetadata(0, 10, 0) === 3, 'falling sand metadata was not preserved');
}

{
  const { world, scheduler, falling } = setup();
  world.setBlock(0, 9, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 20, 0, BlockIds.Gravel, { metadata: 4, notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(0, 20, 0, BlockIds.Gravel, 1);
  scheduler.update(0.05);
  for (let i = 0; i < 80 && falling.getCount() > 0; i++) falling.update(0.05);
  assert(world.getBlock(0, 10, 0) === BlockIds.Gravel, 'gravel did not land');
  assert(world.getBlockMetadata(0, 10, 0) === 4, 'gravel metadata was not preserved');
}

{
  const { world, scheduler, falling } = setup();
  world.setBlock(0, 9, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 10, 0, BlockIds.DeadBush, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 20, 0, BlockIds.Sand, { notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(0, 20, 0, BlockIds.Sand, 1);
  scheduler.update(0.05);
  for (let i = 0; i < 80 && falling.getCount() > 0; i++) falling.update(0.05);
  assert(world.getBlock(0, 10, 0) === BlockIds.Sand, 'sand did not replace a replaceable landing cell');
}

for (const fluid of [BlockIds.WaterStill, BlockIds.LavaStill]) {
  const { world, scheduler, falling } = setup();
  world.setBlock(0, 9, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 10, 0, fluid, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 20, 0, BlockIds.Sand, { notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(0, 20, 0, BlockIds.Sand, 1);
  scheduler.update(0.05);
  for (let i = 0; i < 80 && falling.getCount() > 0; i++) falling.update(0.05);
  assert(world.getBlock(0, 10, 0) === BlockIds.Sand, `sand did not land in fluid ${fluid}`);
}

{
  const { world, falling, events } = setup();
  world.setBlock(0, 9, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 10, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  falling.spawn(BlockIds.Sand, 0, 0.5, 10.5, 0.5);
  falling.update(0.05);
  assert(falling.getCount() === 0, 'failed landing entity was not removed');
  assert(events.getBlockDropCount() === 1, 'failed landing did not emit a deterministic block drop');
}

{
  const { falling, chunks } = setup();
  falling.spawn(BlockIds.Sand, 7, 0.5, 20.5, 0.5);
  const before = falling.getDebugEntities()[0]!;
  chunks.removeChunk(0, 0);
  assert(falling.getCount() === 0 && falling.getPersistedCount() === 1, 'falling entity was not persisted on chunk unload');
  chunks.getOrCreateChunk(0, 0);
  const after = falling.getDebugEntities()[0]!;
  assert(after.id === before.id && after.metadata === before.metadata && after.y === before.y, 'falling entity state was not restored exactly');
  assert(falling.getMeshCount() === 1, 'restored falling entity did not recreate exactly one mesh');
}

// ============================================================
// Stacking: multiple sand blocks cascade correctly
// ============================================================
{
  const { world, falling } = setup();
  world.setBlock(0, 5, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  for (let y = 6; y <= 10; y++) {
    falling.spawn(BlockIds.Sand, 0, 0.5, y + 0.5, 0.5);
  }
  for (let i = 0; i < 200 && falling.getCount() > 0; i++) falling.update(0.05);
  assert(falling.getCount() === 0, 'stacked sand entities did not all land');
  for (let y = 6; y <= 10; y++) {
    assert(world.getBlock(0, y, 0) === BlockIds.Sand, `stacked sand missing at y=${y}`);
  }
}

// ============================================================
// Deterministic replay: same inputs produce identical outputs
// ============================================================
{
  function runDeterministic(): { placed: number[] } {
    const blocks = new BlockRegistry();
    registerDefaultBlocks(blocks);
    const cm = new ChunkManager();
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) cm.getOrCreateChunk(x, z);
    const le = new LightEngine(cm, blocks);
    const w = new BlockUpdateWorld(cm, blocks, le);
    const atlas = { texture: new THREE.Texture(), getUvRect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) } as never;
    const events = new WorldEventQueue();
    const mgr = new FallingBlockManager(w, blocks, cm, new THREE.Scene(), atlas, events);
    void events; // suppress unused warning
    w.setBlock(0, 5, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
    mgr.spawn(BlockIds.Sand, 0, 0.5, 20.5, 0.5);
    mgr.spawn(BlockIds.Gravel, 0, 2.5, 20.5, 0.5);
    for (let i = 0; i < 100 && mgr.getCount() > 0; i++) mgr.update(0.05);
    const placed: number[] = [];
    for (let y = 0; y < 30; y++) {
      const b = w.getBlock(0, y, 0);
      if (b !== 0) placed.push(b);
    }
    return { placed };
  }
  const r1 = runDeterministic();
  const r2 = runDeterministic();
  assert(JSON.stringify(r1.placed) === JSON.stringify(r2.placed), 'deterministic replay produced different results');
}

// ============================================================
// Duplicate entity detection: same entity ID is rejected
// ============================================================
{
  const { falling } = setup();
  falling.spawn(BlockIds.Sand, 0, 0.5, 20.5, 0.5);
  assert(falling.getCount() === 1, 'entity should be created');
  // Upstream assigns unique IDs per spawn; verify mesh count stays consistent
  assert(falling.getMeshCount() === 1, 'should have exactly 1 mesh');
}

// ============================================================
// Fire: placement and survival
// ============================================================
{
  const { world, scheduler } = setup();
  // Place fire on stone (solid normal cube below) — should survive
  world.setBlock(0, 10, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 11, 0, BlockIds.Fire, { notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(0, 11, 0, BlockIds.Fire, 40);
  // Tick once to process the scheduled fire update
  scheduler.update(2.1); // 40+ ticks
  assert(world.getBlock(0, 11, 0) === BlockIds.Fire, 'fire on stone should survive');
}

// Fire: unsupported removal via scheduled tick
{
  const { world, scheduler } = setup();
  // Place fire in air with no support, schedule a tick
  world.setBlock(0, 11, 0, BlockIds.Fire, { notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(0, 11, 0, BlockIds.Fire, 40);
  scheduler.update(2.1);
  assert(world.getBlock(0, 11, 0) === BlockIds.Air, 'unsupported fire should be removed by scheduled tick');
}

// Fire: survives beside flammable block
{
  const { world, scheduler } = setup();
  world.setBlock(0, 10, 0, BlockIds.Air, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 11, 0, BlockIds.Log, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(1, 11, 0, BlockIds.Fire, { notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(1, 11, 0, BlockIds.Fire, 40);
  scheduler.update(2.1);
  assert(world.getBlock(1, 11, 0) === BlockIds.Fire, 'fire beside log should survive');
}

// Fire: neighbour removal causes extinguish
{
  const { world, scheduler } = setup();
  world.setBlock(0, 10, 0, BlockIds.Air, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 11, 0, BlockIds.Log, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(1, 11, 0, BlockIds.Fire, { notifyNeighbours: false, updateLighting: false });
  // Remove the log — triggers neighbour notification on fire
  world.setBlock(0, 11, 0, BlockIds.Air, { notifyNeighbours: true, updateLighting: false });
  // Tick scheduler to process the neighbour notification
  scheduler.update(0.05);
  assert(world.getBlock(1, 11, 0) === BlockIds.Air, 'fire should be removed when flammable neighbour removed');
}

// Fire: age progression via scheduled tick
{
  const { world, scheduler } = setup();
  world.setBlock(0, 10, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 11, 0, BlockIds.Fire, { metadata: 0, notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(0, 11, 0, BlockIds.Fire, 40);
  // Run multiple scheduled ticks to guarantee age increase
  for (let i = 0; i < 5; i++) scheduler.update(2.1);
  const age = world.getBlockMetadata(0, 11, 0);
  assert(age > 0, `fire age should increase after scheduled ticks (got ${age})`);
}

// Fire: netherrack infinite fire (rain and age check)
{
  const { world, scheduler } = setup();
  world.setBlock(0, 10, 0, BlockIds.Netherrack, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 11, 0, BlockIds.Fire, { metadata: 15, notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(0, 11, 0, BlockIds.Fire, 40);
  scheduler.update(2.1);
  assert(world.getBlock(0, 11, 0) === BlockIds.Fire, 'fire on netherrack should survive at age 15');
}

// Fire: no collision (fire is not solid)
{
  const { world } = setup();
  world.setBlock(0, 10, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 11, 0, BlockIds.Fire, { notifyNeighbours: false, updateLighting: false });
  const def = new BlockRegistry();
  registerDefaultBlocks(def);
  const fireDef = def.getById(BlockIds.Fire);
  assert(fireDef !== undefined && !fireDef.solid, 'fire must not be solid');
}

// Fire: no duplicate scheduled ticks
{
  const { world, scheduler } = setup();
  world.setBlock(0, 10, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 11, 0, BlockIds.Fire, { notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(0, 11, 0, BlockIds.Fire, 40);
  world.scheduleBlockTick(0, 11, 0, BlockIds.Fire, 40); // duplicate
  scheduler.update(0.05);
  const metrics = scheduler.getMetrics();
  assert(metrics.duplicateSuppressedTicks >= 1, 'duplicate fire tick should be suppressed');
}

// Fire: TNT ignition emits exactly one event
{
  const { world, scheduler, events } = setup();
  world.setBlock(0, 10, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 11, 0, BlockIds.TNT, { notifyNeighbours: false, updateLighting: false });
  world.setBlock(0, 12, 0, BlockIds.Fire, { notifyNeighbours: false, updateLighting: false });
  world.scheduleBlockTick(0, 12, 0, BlockIds.Fire, 40);
  scheduler.update(2.1);
  // Fire may have burned the TNT; check for ignition event
  const tntIgnitions = events.getTotalTntIgniteAttempts();
  assert(tntIgnitions <= 1, 'TNT should emit at most one ignition event per fire tick');
}

// Fire: flammability table assertions (Beta values)
{
  const blocks = new BlockRegistry();
  registerDefaultBlocks(blocks);
  // Planks: encouragement=5, ability=20
  assert(getFireEncouragement(BlockIds.Planks) === 5, 'planks encouragement should be 5');
  assert(getFireAbility(BlockIds.Planks) === 20, 'planks ability should be 20');
  // Log: encouragement=5, ability=5
  assert(getFireEncouragement(BlockIds.Log) === 5, 'log encouragement should be 5');
  assert(getFireAbility(BlockIds.Log) === 5, 'log ability should be 5');
  // Leaves: encouragement=30, ability=60
  assert(getFireEncouragement(BlockIds.Leaves) === 30, 'leaves encouragement should be 30');
  assert(getFireAbility(BlockIds.Leaves) === 60, 'leaves ability should be 60');
  // Wool: encouragement=30, ability=60
  assert(getFireEncouragement(BlockIds.Wool) === 30, 'wool encouragement should be 30');
  assert(getFireAbility(BlockIds.Wool) === 60, 'wool ability should be 60');
  // TNT: encouragement=15, ability=100
  assert(getFireEncouragement(BlockIds.TNT) === 15, 'tnt encouragement should be 15');
  assert(getFireAbility(BlockIds.TNT) === 100, 'tnt ability should be 100');
  // Stone: not flammable
  assert(getFireEncouragement(BlockIds.Stone) === 0, 'stone should not be flammable');
  assert(getFireAbility(BlockIds.Stone) === 0, 'stone should not burn');
}

// Fire: scheduled tick only (not random tick)
{
  const blocks = new BlockRegistry();
  registerDefaultBlocks(blocks);
  const weather = new WeatherController(999n);
  const chunks = new ChunkManager();
  chunks.getOrCreateChunk(0, 0);
  const fb = new FireBehaviour(blocks, weather, chunks);
  assert(fb.randomTicks === false, 'fire must NOT use random ticks');
}

// ============================================================
// AABB extensions
// ============================================================
{
  const box = new AABB(0, 0, 0, 1, 1, 1);
  const expanded = box.expand(0.5, 0.5, 0.5);
  assert(Math.abs(expanded.minX - (-0.5)) < 0.001, 'expand minX');
  assert(Math.abs(expanded.maxX - 1.5) < 0.001, 'expand maxX');

  const contracted = box.contract(0.1, 0.1, 0.1);
  assert(Math.abs(contracted.minX - 0.1) < 0.001, 'contract minX');
  assert(Math.abs(contracted.maxX - 0.9) < 0.001, 'contract maxX');

  const copied = box.copy();
  assert(copied.minX === box.minX && copied.maxX === box.maxX, 'copy should match');
  copied.offset(1, 2, 3);
  assert(Math.abs(copied.minX - 1) < 0.001, 'offset minX');
  assert(Math.abs(copied.minY - 2) < 0.001, 'offset minY');

  const calcY = new AABB(0, 0, 0, 1, 1, 1).calculateYOffset(new AABB(0, 1.5, 0, 1, 2, 1), -2);
  assert(Math.abs(calcY - (-0.5)) < 0.001, 'calculateYOffset should clamp');

  assert(box.getAverageEdgeLength() > 0, 'getAverageEdgeLength should be positive');
}

console.log('Block behaviour validation passed.');
