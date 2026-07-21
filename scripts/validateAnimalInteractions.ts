import * as THREE from 'three';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { JavaRandom } from '../src/world/generation/random/JavaRandom.ts';
import { EntityManager } from '../src/entities/core/EntityManager.ts';
import { createDefaultEntityTypeRegistry } from '../src/entities/core/EntityType.ts';
import { registerEntityTypes } from '../src/entities/registerEntityTypes.ts';
import { Inventory } from '../src/inventory/Inventory.ts';
import { ItemStack } from '../src/inventory/ItemStack.ts';
import { ItemEntityManager } from '../src/entities/items/ItemEntityManager.ts';
import { AnimalInteractionService } from '../src/entities/interactions/AnimalInteractionService.ts';
import { PigEntity } from '../src/entities/living/PigEntity.ts';
import { CowEntity } from '../src/entities/living/CowEntity.ts';
import { SheepEntity } from '../src/entities/living/SheepEntity.ts';
import { ChickenEntity } from '../src/entities/living/ChickenEntity.ts';
import { ANIMAL_BREEDING_COOLDOWN_TICKS, ANIMAL_CHILD_GROWTH_TICKS, ANIMAL_LOVE_TICKS, BABY_SCALE } from '../src/entities/living/AnimalEntity.ts';
import { TemptTask } from '../src/entities/ai/tasks/TemptTask.ts';
import { MateTask } from '../src/entities/ai/tasks/MateTask.ts';
import { PanicTask } from '../src/entities/ai/tasks/PanicTask.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const blocks = new BlockRegistry(); registerDefaultBlocks(blocks);
const chunks = new ChunkManager();
for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) chunks.getOrCreateChunk(x, z);
const behaviours = new BlockBehaviourRegistry();
const world = new BlockUpdateWorld(chunks, blocks, new LightEngine(chunks, blocks));
const scene = new THREE.Scene();
const texture = new THREE.Texture();
const atlas = { texture, getUvRect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) } as never;
const material = new THREE.MeshBasicMaterial();
const registry = createDefaultEntityTypeRegistry(); registerEntityTypes(registry);
const inventory = new Inventory();
let heldId: number | string | undefined;
const entities = new EntityManager({
  blockRegistry: blocks, behaviourRegistry: behaviours, blockUpdateWorld: world,
  chunkManager: chunks, scene, blockAtlas: atlas, itemAtlas: atlas,
  heldBlockMaterial: material, itemHeldMaterial: material, typeRegistry: registry,
  rng: new JavaRandom(7n), playerPosition: { x: 2, y: 11, z: 2 },
  playerHeldItemId: () => heldId,
});
const itemManager = new ItemEntityManager(entities, inventory, blocks);
const interactions = new AnimalInteractionService(inventory, itemManager);

assert(new PigEntity(entities.context, 0, 11, 0).breedingItemId === 'carrot', 'pig uses Release 1.4.2 carrot');
assert(new CowEntity(entities.context, 0, 11, 0).breedingItemId === 'wheat', 'cow uses wheat');
assert(new SheepEntity(entities.context, 0, 11, 0).breedingItemId === 'wheat', 'sheep uses wheat');
assert(new ChickenEntity(entities.context, 0, 11, 0).breedingItemId === 'seeds', 'chicken uses seeds');
assert(ANIMAL_LOVE_TICKS === 600 && ANIMAL_BREEDING_COOLDOWN_TICKS === 6000 && ANIMAL_CHILD_GROWTH_TICKS === 24000, '1.4.2 age/love constants');
assert(BABY_SCALE === 0.5, 'baby scale is one half');

// Feeding, exact consumption, rejected cooldown and baby growth acceleration.
const pigA = new PigEntity(entities.context, 0, 11, 0);
const pigB = new PigEntity(entities.context, 1, 11, 0);
inventory.setStack(0, new ItemStack('carrot', 'item', 3));
assert(interactions.interact(pigA, 0) === 'consumed-success' && inventory.getStack(0)?.count === 2, 'adult feeding consumes one and enters love');
assert(pigA.loveTicks === 600, 'love timer starts at 600');
assert(interactions.interact(pigA, 0) === 'consumed-rejected' && inventory.getStack(0)?.count === 2, 'love/cooldown rejection consumes event but not item');
assert(interactions.interact(pigB, 0) === 'consumed-success', 'second parent enters love');
assert(pigA.breedWith(pigB), 'compatible in-love parents breed once');
assert(!pigB.breedWith(pigA), 'parent state prevents duplicate offspring');
entities.add(pigA); entities.add(pigB); entities.tick();
const pigs = entities.getEntitiesInChunk(0, 0).filter((e): e is PigEntity => e instanceof PigEntity);
assert(pigs.length === 3 && pigs.filter(p => p.isChild()).length === 1, 'exactly one child enters EntityManager');
assert(pigA.growingAge === 5999 && pigB.growingAge === 5999, 'parents enter and tick breeding cooldown');
const baby = pigs.find(p => p.isChild())!;
assert(baby.width === 0.45 && baby.height === 0.45, 'baby collision dimensions are half-size');
inventory.setStack(0, new ItemStack('carrot', 'item', 1));
const ageBeforeFeed = baby.growingAge;
assert(interactions.interact(baby, 0) === 'consumed-success' && baby.growingAge > ageBeforeFeed, 'baby feeding accelerates growth');
const babyTag = baby.writeToNbt();
const loadedBaby = PigEntity.deserialize(entities.context, babyTag)!;
assert(loadedBaby.growingAge === baby.growingAge && loadedBaby.isChild(), 'baby age persists exactly');
loadedBaby.setGrowingAge(-1); loadedBaby.onTick({ world: entities.context, gameTick: 1 });
assert(!loadedBaby.isChild() && loadedBaby.width === 0.9, 'loaded baby continues aging to adult dimensions');

// Attraction acquisition/loss and priority ordering.
const tempt = new TemptTask();
heldId = 'carrot';
assert(tempt.shouldStart(pigA), 'tempt task acquires player holding species food');
heldId = undefined;
assert(!tempt.shouldContinue(pigA), 'tempt task stops immediately when food is removed');
assert(new PanicTask().priority > new MateTask().priority && new MateTask().priority > tempt.priority, 'panic > mating > attraction priority');

// Beta shearing: 2-4 coloured wool, durability, persistent sheared state, no repeat.
const sheep = new SheepEntity(entities.context, 3, 11, 0); sheep.fleeceColor = 12;
inventory.setStack(1, new ItemStack('shears', 'item', 1, 0));
const beforeItems = entities.activeCount;
assert(interactions.interact(sheep, 1) === 'consumed-success' && sheep.sheared, 'shearing succeeds once');
assert(inventory.getStack(1)?.damage===1&&inventory.getStack(1)?.metadata===0,'shears use unified damage field and preserve variant metadata');
entities.tick();
const woolCount = entities.activeCount - beforeItems;
assert(woolCount >= 2 && woolCount <= 4, 'shearing drops 2-4 wool entities');
assert(interactions.interact(sheep, 1) === 'consumed-rejected', 'already-sheared attempt is consumed without duplicate drops');
const sheepLoaded = SheepEntity.deserialize(entities.context, sheep.writeToNbt())!;
assert(sheepLoaded.sheared && sheepLoaded.fleeceColor === 12, 'sheared state and colour persist');
sheepLoaded.regrowWool();
assert(!sheepLoaded.sheared, 'existing grazing-compatible regrowth restores fleece');

// Beta cow milking, atomic bucket replacement, and adult-only rejection.
const cow = new CowEntity(entities.context, 5, 11, 0);
inventory.setStack(2, new ItemStack('bucket_empty', 'item', 1));
assert(interactions.interact(cow, 2) === 'consumed-success', 'adult cow milking succeeds');
assert(inventory.getStack(2)?.identity.id === 'bucket_milk' && inventory.getStack(2)?.count === 1, 'empty bucket atomically becomes one milk bucket');
const calf = new CowEntity(entities.context, 6, 11, 0); calf.setGrowingAge(-100);
inventory.setStack(2, new ItemStack('bucket_empty', 'item', 1));
assert(interactions.interact(calf, 2) === 'consumed-rejected' && inventory.getStack(2)?.identity.id === 'bucket_empty', 'baby cow cannot be milked or consume bucket');
inventory.setStack(3, new ItemStack('stick', 'item', 1));
assert(interactions.interact(cow, 3) === 'not-applicable', 'unsupported item returns to normal pipeline');

// Chicken retains its persisted egg timer alongside animal state.
const chicken = new ChickenEntity(entities.context, 7, 11, 0); chicken.setGrowingAge(-20); chicken.timeUntilNextEgg = 7000;
const loadedChicken = ChickenEntity.deserialize(entities.context, chicken.writeToNbt())!;
assert(loadedChicken.growingAge === -20 && loadedChicken.timeUntilNextEgg === 7000, 'chicken baby age and egg timer coexist in persistence');

entities.dispose();
material.dispose(); texture.dispose();
console.log('Passive animal interaction validation passed.');
