import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { registerFluidBehaviours } from '../src/world/fluid/FluidBehaviour.ts';
import { isFallingFluid } from '../src/world/fluid/FluidMetadata.ts';
import { RandomTickScheduler } from '../src/world/ticks/RandomTickScheduler.ts';
import { WorldTickScheduler } from '../src/world/ticks/WorldTickScheduler.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function setup(): { chunks: ChunkManager; world: BlockUpdateWorld; scheduler: WorldTickScheduler } {
  const registry = new BlockRegistry();
  registerDefaultBlocks(registry);
  const chunks = new ChunkManager();
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) chunks.getOrCreateChunk(x, z);
  const light = new LightEngine(chunks, registry);
  const world = new BlockUpdateWorld(chunks, registry, light);
  const behaviours = new BlockBehaviourRegistry();
  registerFluidBehaviours(behaviours);
  const scheduler = new WorldTickScheduler(chunks, world, behaviours, new RandomTickScheduler(99n));
  world.setScheduleCallback((x, y, z, id, delay) => scheduler.schedule(x, y, z, id, delay));
  return { chunks, world, scheduler };
}

function tick(scheduler: WorldTickScheduler, count: number): void {
  for (let i = 0; i < count; i++) scheduler.update(0.05);
}

{
  const { world, scheduler } = setup();
  world.setBlock(0, 20, 0, BlockIds.WaterFlowing, { metadata: 0, updateLighting: false, notifyNeighbours: true });
  world.scheduleBlockTick(0, 20, 0, BlockIds.WaterFlowing, 1);
  tick(scheduler, 8);
  assert(world.getBlock(0, 19, 0) === BlockIds.WaterFlowing, 'water did not flow downward');
  assert(isFallingFluid(world.getBlockMetadata(0, 19, 0)), 'downward water missing falling metadata');
}

{
  const { world, scheduler } = setup();
  // floor blocks under source force horizontal spreading
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) world.setBlock(x, 9, z, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
  world.setBlock(0, 10, 0, BlockIds.WaterFlowing, { metadata: 0, updateLighting: false, notifyNeighbours: true });
  world.scheduleBlockTick(0, 10, 0, BlockIds.WaterFlowing, 1);
  tick(scheduler, 8);
  assert(world.getBlock(1, 10, 0) === BlockIds.WaterFlowing, 'water did not spread horizontally');
  assert(world.getBlockMetadata(1, 10, 0) === 1, 'water horizontal decay metadata incorrect');
}

{
  const { world, scheduler } = setup();
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) world.setBlock(x, 9, z, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
  world.setBlock(-1, 10, 0, BlockIds.WaterStill, { metadata: 0, updateLighting: false, notifyNeighbours: false });
  world.setBlock(1, 10, 0, BlockIds.WaterStill, { metadata: 0, updateLighting: false, notifyNeighbours: false });
  world.setBlock(0, 10, 0, BlockIds.WaterFlowing, { metadata: 1, updateLighting: false, notifyNeighbours: true });
  world.scheduleBlockTick(0, 10, 0, BlockIds.WaterFlowing, 1);
  tick(scheduler, 8);
  assert(world.getBlockMetadata(0, 10, 0) === 0, 'infinite water source did not form');
}

{
  const { world, scheduler } = setup();
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) world.setBlock(x, 9, z, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
  world.setBlock(0, 10, 0, BlockIds.LavaFlowing, { metadata: 0, updateLighting: false, notifyNeighbours: true });
  world.scheduleBlockTick(0, 10, 0, BlockIds.LavaFlowing, 1);
  tick(scheduler, 35);
  assert(world.getBlock(1, 10, 0) === BlockIds.LavaFlowing, 'lava did not spread after slow tick');
  assert(world.getBlockMetadata(1, 10, 0) === 2, 'lava decay metadata should advance by 2 in overworld');
}

{
  const { world, scheduler } = setup();
  world.setBlock(0, 10, 0, BlockIds.LavaFlowing, { metadata: 0, updateLighting: false, notifyNeighbours: false });
  world.setBlock(1, 10, 0, BlockIds.WaterStill, { metadata: 0, updateLighting: false, notifyNeighbours: false });
  world.scheduleBlockTick(0, 10, 0, BlockIds.LavaFlowing, 1);
  tick(scheduler, 35);
  assert(world.getBlock(0, 10, 0) === BlockIds.Obsidian, 'source lava touching water did not become obsidian');
}

{
  const { world, scheduler } = setup();
  world.setBlock(0, 10, 0, BlockIds.LavaFlowing, { metadata: 2, updateLighting: false, notifyNeighbours: false });
  world.setBlock(1, 10, 0, BlockIds.WaterStill, { metadata: 0, updateLighting: false, notifyNeighbours: false });
  world.scheduleBlockTick(0, 10, 0, BlockIds.LavaFlowing, 1);
  tick(scheduler, 35);
  assert(world.getBlock(0, 10, 0) === BlockIds.Cobblestone, 'flowing lava touching water did not become cobblestone');
}

console.log('Fluid validation passed.');
