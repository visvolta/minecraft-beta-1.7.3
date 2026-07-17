import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { registerFluidBehaviours } from '../src/world/fluid/FluidBehaviour.ts';
import { isFallingFluid } from '../src/world/fluid/FluidMetadata.ts';
import { computeFluidFlowVector } from '../src/world/fluid/FluidFlowVector.ts';
import { readFileSync } from 'node:fs';
import { RandomTickScheduler } from '../src/world/ticks/RandomTickScheduler.ts';
import { WorldTickScheduler } from '../src/world/ticks/WorldTickScheduler.ts';
import { ChunkMesher } from '../src/rendering/ChunkMesher.ts';
import { getBetaFluidCornerHeight } from '../src/rendering/fluid/FluidSurfaceGeometry.ts';
import { fluidMetadata } from '../src/world/fluid/FluidMetadata.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function pngSize(path: string): { width: number; height: number } {
  const data = readFileSync(path);
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

{
  const waterStill = pngSize('public/textures/blocks/water_still.png');
  const lavaStill = pngSize('public/textures/blocks/lava_still.png');
  const water = pngSize('public/textures/blocks/water_flow.png');
  const lava = pngSize('public/textures/blocks/lava_flow.png');
  assert(waterStill.width === 16 && waterStill.height === 512, `unexpected water_still size ${waterStill.width}x${waterStill.height}`);
  assert(lavaStill.width === 16 && lavaStill.height === 320, `unexpected lava_still size ${lavaStill.width}x${lavaStill.height}`);
  assert(water.width === 32 && water.height === 1024, `unexpected water_flow size ${water.width}x${water.height}`);
  assert(lava.width === 32 && lava.height === 512, `unexpected lava_flow size ${lava.width}x${lava.height}`);
  assert(waterStill.height / 16 === 32, 'water_still should resolve to 32 16x16 frames');
  assert(lavaStill.height / 16 === 20, 'lava_still should resolve to 20 16x16 frames');
  assert(water.height / 32 === 32, 'water_flow should resolve to 32 32x32 frames');
  assert(lava.height / 32 === 16, 'lava_flow should resolve to 16 32x32 frames');
}

function setup(seed = 99n): { chunks: ChunkManager; world: BlockUpdateWorld; scheduler: WorldTickScheduler } {
  const registry = new BlockRegistry();
  registerDefaultBlocks(registry);
  const chunks = new ChunkManager();
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) chunks.getOrCreateChunk(x, z);
  const light = new LightEngine(chunks, registry);
  const world = new BlockUpdateWorld(chunks, registry, light);
  const behaviours = new BlockBehaviourRegistry();
  registerFluidBehaviours(behaviours);
  const scheduler = new WorldTickScheduler(chunks, world, behaviours, new RandomTickScheduler(seed));
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

{
  const access = {
    getBlock: (x: number, _y: number, _z: number) => x === 1 ? BlockIds.WaterFlowing : BlockIds.WaterStill,
    getMetadata: (x: number, _y: number, _z: number) => x === 1 ? 3 : 0,
    isSolid: (id: number) => id !== 0 && id !== BlockIds.WaterFlowing && id !== BlockIds.WaterStill,
  };
  const flow = computeFluidFlowVector(access, 0, 10, 0, BlockIds.WaterStill);
  assert(flow.x > 0, `flow vector should point toward higher decay neighbour in test, got ${flow.x},${flow.z}`);
}

{
  const registry = new BlockRegistry();
  registerDefaultBlocks(registry);
  const chunks = new ChunkManager();
  const chunk = chunks.getOrCreateChunk(0, 0);
  chunk.setBlock(0, 10, 0, BlockIds.WaterFlowing);
  chunk.setBlockMetadata(0, 10, 0, 8);
  chunk.setBlock(0, 11, 0, BlockIds.WaterFlowing);
  chunk.setBlockMetadata(0, 11, 0, 8);
  const atlas = { getUvRect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) } as never;
  const geometry = new ChunkMesher(chunks, registry, atlas).buildFluids(chunk);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const selector = geometry.getAttribute('fluidTextureKind');
  const frameUv = geometry.getAttribute('fluidFrameUv');
  assert(position !== undefined && normal !== undefined && uv !== undefined && selector !== undefined && frameUv !== undefined, 'fluid geometry missing required attributes');
  assert(normal.count === position.count, 'fluid normal count mismatch');
  assert(uv.count === position.count, 'fluid uv count mismatch');
  assert(selector.count === position.count, 'fluid selector count mismatch');
  assert(frameUv.count === position.count, 'fluid frame uv count mismatch');
  for (const attribute of [position, normal, uv, selector, frameUv]) {
    const array = attribute.array as ArrayLike<number>;
    for (let i = 0; i < array.length; i++) assert(Number.isFinite(array[i]), `non-finite fluid attribute at ${i}`);
  }
  let topVertices = 0;
  for (let i = 0; i < normal.count; i++) if (normal.getY(i) === 1) topVertices += 1;
  assert(topVertices === 4, `stacked falling fluids should emit only one exposed top face, got ${topVertices / 4}`);
  geometry.dispose();
}

{
  // Directly exercise Beta's weighted corner sampler, including a source
  // beside a partial flow and a non-solid replaceable neighbour.
  const blocks = new Map<string, number>();
  const metadata = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  blocks.set(key(0, 10, 0), BlockIds.WaterFlowing);
  metadata.set(key(0, 10, 0), fluidMetadata(0));
  blocks.set(key(-1, 10, 0), BlockIds.WaterFlowing);
  metadata.set(key(-1, 10, 0), fluidMetadata(3));
  const corner = getBetaFluidCornerHeight({
    getBlock: (x, y, z) => blocks.get(key(x, y, z)) ?? BlockIds.Air,
    getMetadata: (x, y, z) => metadata.get(key(x, y, z)) ?? 0,
    isSameFluid: (a, b) => (a === BlockIds.WaterFlowing || a === BlockIds.WaterStill) && (b === BlockIds.WaterFlowing || b === BlockIds.WaterStill),
    isSolidForFluidHeight: (id) => id === BlockIds.Stone,
  }, 0, 10, 0, BlockIds.WaterFlowing);
  assert(corner > 1 - (3 + 1) / 9 && corner <= 1, `Beta weighted corner height out of range: ${corner}`);

  blocks.set(key(0, 11, 0), BlockIds.WaterFlowing);
  metadata.set(key(0, 11, 0), fluidMetadata(7, true));
  const aboveCorner = getBetaFluidCornerHeight({
    getBlock: (x, y, z) => blocks.get(key(x, y, z)) ?? BlockIds.Air,
    getMetadata: (x, y, z) => metadata.get(key(x, y, z)) ?? 0,
    isSameFluid: (a, b) => (a === BlockIds.WaterFlowing || a === BlockIds.WaterStill) && (b === BlockIds.WaterFlowing || b === BlockIds.WaterStill),
    isSolidForFluidHeight: (id) => id === BlockIds.Stone,
  }, 0, 10, 0, BlockIds.WaterFlowing);
  assert(aboveCorner === 1, `compatible fluid above corner should be full height, got ${aboveCorner}`);
}

function waterState(seed: bigint): string {
  const { world, scheduler } = setup(seed);
  // A bounded floor forces horizontal water decisions, including the Beta
  // random slowdown path. Repeating the same seed/tick sequence must match.
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) world.setBlock(x, 9, z, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
  world.setBlock(0, 10, 0, BlockIds.WaterFlowing, { metadata: 0, updateLighting: false, notifyNeighbours: true });
  world.scheduleBlockTick(0, 10, 0, BlockIds.WaterFlowing, 1);
  tick(scheduler, 20);
  const values: string[] = [];
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) values.push(`${world.getBlock(x, 10, z)}:${world.getBlockMetadata(x, 10, z)}`);
  return values.join('|');
}

assert(waterState(99n) === waterState(99n), 'water tick sequence is not deterministic for a repeated seed');

console.log('Fluid validation passed.');
