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
import { registerFireBehaviour } from '../src/world/behaviours/FireBehaviour.ts';

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
  registerFallingBlockBehaviours(behaviours, blocks, falling);
  registerFireBehaviour(behaviours, blocks);
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

console.log('Block behaviour validation passed.');
