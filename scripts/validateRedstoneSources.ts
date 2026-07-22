import { FaceDirection } from '../src/blocks/BlockFace.ts';
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
import { RedstoneTorchBehaviour } from '../src/world/behaviours/RedstoneTorchBehaviour.ts';
import { LeverBehaviour } from '../src/world/behaviours/LeverBehaviour.ts';
import { ButtonBehaviour } from '../src/world/behaviours/ButtonBehaviour.ts';
import { PressurePlateBehaviour } from '../src/world/behaviours/PressurePlateBehaviour.ts';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

const WIRE = BlockIds.RedstoneWire;
const SOLID = BlockIds.Stone;
const TORCH_ON = BlockIds.RedstoneTorchOn;
const TORCH_OFF = BlockIds.RedstoneTorchOff;
const LEVER = BlockIds.Lever;
const BUTTON = BlockIds.StoneButton;
const PLATE_STONE = BlockIds.StonePressurePlate;
const PLATE_WOOD = BlockIds.WoodPressurePlate;

interface TestWorld {
  readonly registry: BlockRegistry;
  readonly chunks: ChunkManager;
  readonly world: BlockUpdateWorld;
  readonly behaviours: BlockBehaviourRegistry;
  readonly scheduler: WorldTickScheduler;
  readonly power: RedstonePowerEngine;
  readonly entities: any; 
  tick: number;
  step(count?: number): void;
}

function createTestWorld(): TestWorld {
  const registry = new BlockRegistry();
  const buildDef = (id: number, name: string, solid = false): BlockDefinition => ({
    id, name, displayName: name, solid, transparent: !solid, replaceable: false, textures: { all: 'stone' }, renderType: (solid ? 'opaque' : 'cutout') as BlockRenderType
  });

  registry.register(buildDef(0, 'air'));
  registry.register(buildDef(SOLID, 'stone', true));
  registry.register({ ...buildDef(WIRE, 'redstone_wire'), renderType: 'redstone_wire' as BlockRenderType });
  registry.register(buildDef(TORCH_ON, 'torch_on'));
  registry.register(buildDef(TORCH_OFF, 'torch_off'));
  registry.register(buildDef(LEVER, 'lever'));
  registry.register(buildDef(BUTTON, 'button'));
  registry.register(buildDef(PLATE_STONE, 'plate_stone'));
  registry.register(buildDef(PLATE_WOOD, 'plate_wood'));

  const chunks = new ChunkManager();
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) chunks.getOrCreateChunk(cx, cz);
  
  const behaviours = new BlockBehaviourRegistry();
  behaviours.register(WIRE, new RedstoneWireBehaviour());
  behaviours.register(TORCH_ON, new RedstoneTorchBehaviour(true));
  behaviours.register(TORCH_OFF, new RedstoneTorchBehaviour(false));
  behaviours.register(LEVER, new LeverBehaviour());
  behaviours.register(BUTTON, new ButtonBehaviour());
  behaviours.register(PLATE_STONE, new PressurePlateBehaviour(false));
  behaviours.register(PLATE_WOOD, new PressurePlateBehaviour(true));

  const world = new BlockUpdateWorld(chunks, registry, new LightEngine(chunks, registry));
  world.setBehaviourRegistry(behaviours);
  
  const mockEntities = {
      getEntitiesInAABB: (_box: any, _predicate: any) => []
  };
  world.setEntityManager(mockEntities as any);

  const scheduler = new WorldTickScheduler(chunks, world, behaviours, new RandomTickScheduler(123n));
  world.setScheduleCallback((x, y, z, id, delay) => scheduler.schedule(x, y, z, id, delay));
  world.setGameTickProvider(() => scheduler.getGameTick());
  
  const power = new RedstonePowerEngine(world, registry, behaviours);
  world.setPowerEngine(power);

  const result: TestWorld = {
    registry, chunks, world, behaviours, scheduler, power, entities: mockEntities, tick: 0,
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

function setBlock(test: TestWorld, x: number, y: number, z: number, id: BlockId, metadata = 0): void {
  test.world.setBlock(x, y, z, id, { metadata, notifyNeighbours: true });
}

function testTorchInversion(): void {
    const test = createTestWorld();
    setBlock(test, 0, 9, 0, SOLID);
    setBlock(test, 0, 10, 0, TORCH_ON, 5); 
    
    assert(test.world.getBlock(0, 10, 0) === TORCH_ON, 'Torch starts ON');
    
    setBlock(test, 0, 8, 0, LEVER, 8 | 5); 
    test.step(); 
    test.step();
    
    assert(test.world.getBlock(0, 10, 0) === TORCH_OFF, 'Torch inverted to OFF after 2 ticks');
    
    setBlock(test, 0, 8, 0, 0);
    test.step();
    test.step();
    assert(test.world.getBlock(0, 10, 0) === TORCH_ON, 'Torch restored to ON after 2 ticks');
    console.log('Torch inversion validation passed.');
}

function testLeverAndStrongPower(): void {
    const test = createTestWorld();
    setBlock(test, 0, 10, 0, SOLID);
    setBlock(test, 1, 10, 0, LEVER, 8 | 2); 
    
    assert(test.power.getWeakPowerFrom({ x: 1, y: 10, z: 1 }, FaceDirection.NORTH) === 15, 'Lever provides weak power to neighbors');
    assert(test.power.getStrongPowerFrom({ x: 0, y: 10, z: 0 }, FaceDirection.EAST) === 15, 'Lever provides strong power to attached block');
    assert(test.power.getStrongPowerFrom({ x: 2, y: 10, z: 0 }, FaceDirection.WEST) === 0, 'Lever does NOT provide strong power to other blocks');
    console.log('Lever strong power validation passed.');
}

function testButtonDuration(): void {
    const test = createTestWorld();
    setBlock(test, 0, 10, 0, SOLID);
    setBlock(test, 1, 10, 0, BUTTON, 8 | 2); 
    
    test.step(19);
    assert((test.world.getBlockMetadata(1, 10, 0) & 8) !== 0, 'Button still pressed at 19 ticks');
    test.step(1);
    assert((test.world.getBlockMetadata(1, 10, 0) & 8) === 0, 'Button released at 20 ticks');
    console.log('Button duration validation passed.');
}

function testPressurePlateActivation(): void {
    const test = createTestWorld();
    setBlock(test, 0, 9, 0, SOLID);
    setBlock(test, 0, 10, 0, PLATE_STONE);
    
    test.entities.getEntitiesInAABB = (_box: any, _predicate: any) => {
        return [{}]; 
    };
    
    test.behaviours.get(PLATE_STONE).onEntityCollidedWithBlock?.({ world: test.world, entities: test.entities, gameTick: 0 } as any, 0, 10, 0, {} as any);
    assert(test.world.getBlockMetadata(0, 10, 0) === 1, 'Stone plate activated by mob');
    
    setBlock(test, 2, 10, 0, PLATE_WOOD);
    test.entities.getEntitiesInAABB = (_box: any) => [{}]; 
    test.behaviours.get(PLATE_WOOD).onEntityCollidedWithBlock?.({ world: test.world, entities: test.entities, gameTick: 0 } as any, 2, 10, 0, {} as any);
    assert(test.world.getBlockMetadata(2, 10, 0) === 1, 'Wood plate activated by item/entity');
    console.log('Pressure plate activation validation passed.');
}

function main(): void {
    testTorchInversion();
    testLeverAndStrongPower();
    testButtonDuration();
    testPressurePlateActivation();
    console.log('Stage 10C Redstone Sources validation completed successfully.');
}

main();
