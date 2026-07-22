import type { BlockDefinition, BlockRenderType } from '../src/blocks/BlockDefinition.ts';
import type { BlockId } from '../src/blocks/BlockId.ts';
import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { RedstonePowerEngine } from '../src/world/redstone/RedstonePowerEngine.ts';
import { RandomTickScheduler } from '../src/world/ticks/RandomTickScheduler.ts';
import { WorldTickScheduler } from '../src/world/ticks/WorldTickScheduler.ts';
import { RedstoneWireBehaviour } from '../src/world/behaviours/RedstoneWireBehaviour.ts';
import { getWireConnections, WireConnection, getRedstoneColor } from '../src/world/redstone/RedstoneWireConnectivity.ts';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

const WIRE = BlockIds.RedstoneWire;
const SOLID = BlockIds.Stone;
const SOURCE = BlockIds.RedstoneTorchOn;

function buildDef(id: number, name: string, solid = false): BlockDefinition {
  return {
    id,
    name,
    displayName: name,
    solid,
    transparent: !solid,
    replaceable: false,
    textures: { all: 'stone' },
    renderType: (solid ? 'opaque' : 'cutout') as BlockRenderType,
  };
}

interface TestWorld {
  readonly registry: BlockRegistry;
  readonly chunks: ChunkManager;
  readonly world: BlockUpdateWorld;
  readonly behaviours: BlockBehaviourRegistry;
  readonly scheduler: WorldTickScheduler;
  readonly power: RedstonePowerEngine;
  tick: number;
  step(count?: number): void;
}

function createTestWorld(): TestWorld {
  const registry = new BlockRegistry();
  registry.register(buildDef(0, 'air'));
  registry.register(buildDef(SOLID, 'stone', true));
  registry.register({ ...buildDef(WIRE, 'redstone_wire'), renderType: 'redstone_wire' as BlockRenderType });
  registry.register(buildDef(SOURCE, 'torch'));

  const chunks = new ChunkManager();
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) chunks.getOrCreateChunk(cx, cz);
  
  const behaviours = new BlockBehaviourRegistry();
  behaviours.register(WIRE, new RedstoneWireBehaviour());
  behaviours.register(SOURCE, { 
    canProvidePower: true, 
    getWeakPower: () => 15,
    getStrongPower: () => 15 
  });

  const world = new BlockUpdateWorld(chunks, registry, new LightEngine(chunks, registry));
  world.setBehaviourRegistry(behaviours);
  const scheduler = new WorldTickScheduler(chunks, world, behaviours, new RandomTickScheduler(123n));
  world.setGameTickProvider(() => scheduler.getGameTick());
  const power = new RedstonePowerEngine(world, registry, behaviours);
  world.setPowerEngine(power);

  const result: TestWorld = {
    registry, chunks, world, behaviours, scheduler, power, tick: 0,
    step(count = 1): void {
      for (let i = 0; i < count; i++) {
        result.tick++;
        scheduler.beginTick(result.tick);
        scheduler.endTick();
      }
    },
  };
  return result;
}

function setBlockAt(test: TestWorld, x: number, y: number, z: number, id: BlockId, metadata = 0): void {
  test.world.setBlock(x, y, z, id, { metadata, notifyNeighbours: true });
}

function testDecay(): void {
  const test = createTestWorld();
  for (let x = 0; x <= 16; x++) setBlockAt(test, x, 9, 0, SOLID);
  for (let x = 1; x <= 16; x++) setBlockAt(test, x, 10, 0, WIRE);
  setBlockAt(test, 0, 10, 0, SOURCE);
  test.step();

  assert(test.world.getBlockMetadata(1, 10, 0) === 15, 'Wire next to source is strength 15');
  assert(test.world.getBlockMetadata(15, 10, 0) === 1, 'Wire at distance 15 is strength 1');
  assert(test.world.getBlockMetadata(16, 10, 0) === 0, 'Wire at distance 16 is strength 0');
  console.log('Decay validation passed.');
}

function testVerticalClimbing(): void {
  const test = createTestWorld();
  setBlockAt(test, 0, 9, 0, SOLID);
  setBlockAt(test, 1, 9, 0, SOLID);
  setBlockAt(test, 1, 10, 0, SOLID);
  
  setBlockAt(test, 0, 10, 0, WIRE);
  setBlockAt(test, 1, 11, 0, WIRE);
  
  setBlockAt(test, -1, 10, 0, SOURCE);
  test.step();

  assert(test.world.getBlockMetadata(0, 10, 0) === 15, 'Base wire powered');
  assert(test.world.getBlockMetadata(1, 11, 0) === 14, 'Climbing wire powered up-step');
  
  setBlockAt(test, 2, 10, 0, WIRE);
  test.step();
  assert(test.world.getBlockMetadata(2, 10, 0) === 13, 'Climbing wire powered down-step');
  console.log('Vertical climbing validation passed.');
}

function testSupportLoss(): void {
  const test = createTestWorld();
  setBlockAt(test, 0, 9, 0, SOLID);
  setBlockAt(test, 0, 10, 0, WIRE);
  test.step();
  
  assert(test.world.getBlock(0, 10, 0) === WIRE, 'Wire supported');
  
  setBlockAt(test, 0, 9, 0, 0);
  test.step();
  
  assert(test.world.getBlock(0, 10, 0) === 0, 'Wire dropped due to support loss');
  console.log('Support loss validation passed.');
}

function testChunkBoundaries(): void {
  const test = createTestWorld();
  for (let x = 0; x <= 16; x++) {
    setBlockAt(test, x, 9, 0, SOLID);
    setBlockAt(test, x, 10, 0, WIRE);
  }
  
  setBlockAt(test, 0, 10, 0, SOURCE);
  test.step();
  
  assert(test.world.getBlockMetadata(15, 10, 0) === 1, 'Power reaches edge of chunk 0');
  assert(test.world.getBlockMetadata(16, 10, 0) === 0, 'Power crosses chunk boundary but decays to 0 at dist 16');
  
  setBlockAt(test, 10, 10, 0, SOURCE);
  test.step();
  assert(test.world.getBlockMetadata(16, 10, 0) === 9, 'Power crosses chunk boundary correctly');
  console.log('Chunk boundary validation passed.');
}

function testShapesAndTints(): void {
  const color0 = getRedstoneColor(0);
  const color15 = getRedstoneColor(15);
  
  assert(color0[0] === 0.3 && color0[1] === 0 && color0[2] === 0, 'Metadata 0 tint is dark red');
  assert(color15[0] > 0.9 && color15[1] > 0.1, 'Metadata 15 tint is bright red');
  
  const mockWorld = {
    getBlock: (x: number, _y: number, _z: number) => x === 1 ? WIRE : 0,
    isNormalCube: () => false
  };
  const connections = getWireConnections(mockWorld, 0, 10, 0, (id) => id === WIRE);
  assert(connections.east === WireConnection.SIDE, 'Horizontal connection detected');
  console.log('Shapes and tints validation passed.');
}

function main(): void {
  testDecay();
  testVerticalClimbing();
  testSupportLoss();
  testChunkBoundaries();
  testShapesAndTints();
  console.log('Stage 10B Redstone Wire validation completed successfully.');
}

main();
