import * as THREE from 'three';
import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { EntityManager } from '../src/entities/core/EntityManager.ts';
import { createDefaultEntityTypeRegistry } from '../src/entities/core/EntityType.ts';
import { registerEntityTypes } from '../src/entities/registerEntityTypes.ts';
import { NaturalPassiveSpawner, PASSIVE_ATTEMPTS_PER_ROUND, PASSIVE_CREATURE_CAP, PASSIVE_ELIGIBLE_CHUNK_RADIUS, PASSIVE_GROUP_ROUNDS, PASSIVE_MAX_GROUP_SIZE, PASSIVE_MIN_DISTANCE, scaledPassiveCap, selectWeightedPassiveSpawn } from '../src/entities/spawning/NaturalPassiveSpawner.ts';
import { PigEntity } from '../src/entities/living/PigEntity.ts';
import { Player } from '../src/player/Player.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { ClimateSampler } from '../src/world/generation/climate/ClimateSampler.ts';
import { BETA_PASSIVE_SPAWNS, BIOMES } from '../src/world/generation/climate/biomes.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { JavaRandom } from '../src/world/generation/random/JavaRandom.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(PASSIVE_CREATURE_CAP === 15, 'Beta passive cap is 15');
assert(PASSIVE_ELIGIBLE_CHUNK_RADIUS === 8, 'eligible radius is 8');
assert((PASSIVE_ELIGIBLE_CHUNK_RADIUS * 2 + 1) ** 2 === 289, 'single-player eligible set has 289 chunks');
assert(scaledPassiveCap(289) === 16 && scaledPassiveCap(256) === 15, 'cap uses 15*n/256 floor scaling');
assert(PASSIVE_GROUP_ROUNDS === 3 && PASSIVE_ATTEMPTS_PER_ROUND === 4, 'Beta uses three rounds of four attempts');
assert(PASSIVE_MAX_GROUP_SIZE === 4 && PASSIVE_MIN_DISTANCE === 24, 'group and distance limits match Beta');
assert(BETA_PASSIVE_SPAWNS.map(e => `${e.kind}:${e.weight}`).join(',') === 'sheep:12,pig:10,chicken:10,cow:8', 'spawn weights match BiomeGenBase');
for (const biome of Object.values(BIOMES)) assert(biome.passiveSpawns === BETA_PASSIVE_SPAWNS, `${biome.id} uses the authoritative Overworld list`);
assert(selectWeightedPassiveSpawn(BETA_PASSIVE_SPAWNS, () => 0).kind === 'sheep', 'weight lower boundary');
assert(selectWeightedPassiveSpawn(BETA_PASSIVE_SPAWNS, () => 12).kind === 'pig', 'weight second boundary');
assert(selectWeightedPassiveSpawn(BETA_PASSIVE_SPAWNS, () => 39).kind === 'cow', 'weight upper boundary');

const blocks = new BlockRegistry();
registerDefaultBlocks(blocks);
const chunks = new ChunkManager();
const chunk = chunks.getOrCreateChunk(0, 0);
const light = new LightEngine(chunks, blocks);
const world = new BlockUpdateWorld(chunks, blocks, light);
const behaviours = new BlockBehaviourRegistry();
for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
  world.setBlock(x, 10, z, BlockIds.Grass, { notifyNeighbours: false, updateLighting: false });
  chunk.setSkylight(x, 11, z, 15);
}
const scene = new THREE.Scene();
const texture = new THREE.Texture();
const atlas = { texture, getUvRect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) } as never;
const material = new THREE.MeshBasicMaterial();
const types = createDefaultEntityTypeRegistry();
registerEntityTypes(types);
const rng = new JavaRandom(123n);
const entities = new EntityManager({
  blockRegistry: blocks, behaviourRegistry: behaviours, blockUpdateWorld: world,
  chunkManager: chunks, scene, blockAtlas: atlas, itemAtlas: atlas,
  heldBlockMaterial: material, itemHeldMaterial: material, typeRegistry: types, rng,
});
const player = new Player(100, 11, 0);

// Script one valid initial point. Further offset calls return zero, proving
// queued candidates cannot overlap the first accepted entity.
let draw = 0;
const scriptedRng = {
  nextInt(bound: number): number {
    draw += 1;
    if (draw === 1) return 12; // select pig
    if (draw === 2) return 8;
    if (draw === 3) return 11;
    if (draw === 4) return 8;
    return 0 % bound;
  },
  nextFloat(): number { return 0.25; },
} as JavaRandom;
const spawner = new NaturalPassiveSpawner({
  chunkManager: chunks, entityManager: entities, blockRegistry: blocks,
  behaviourRegistry: behaviours, world, climateSampler: new ClimateSampler(123n),
  rng: scriptedRng, player, worldSpawn: { x: -100, y: 11, z: 0 },
  getSkylightSubtracted: () => 0,
});
const spawned = spawner.tick();
assert(spawner.getEligibleChunkCount() === 289, 'eligible count is based on full radius, not loaded intersection');
assert(spawner.getScaledCap() === 16, 'cap scales from full eligible set');
assert(spawned === 1, 'valid terrain spawns once and queued overlap is rejected');
entities.tick();
assert(entities.activePassiveCreatureCount === 1, 'EntityManager maintains active passive count');
const active = entities.getEntitiesInChunk(0, 0);
assert(active.length === 1 && active[0] instanceof PigEntity, 'natural spawn enters normal entity/chunk pipeline');
const saved = entities.serializeChunkEntities(0, 0);
assert(saved.length === 1 && saved[0]!.value.get('id')?.value === 'Pig', 'natural spawn persists with owner chunk');
chunks.removeChunk(0, 0);
assert(entities.activePassiveCreatureCount === 0 && entities.parkedCount === 1, 'unload parks mob and removes it from active cap');
chunks.getOrCreateChunk(0, 0);
assert(entities.activePassiveCreatureCount === 1 && entities.parkedCount === 0, 'reload restores exactly one mob and cap membership');
entities.loadChunkEntities(saved);
entities.tick();
assert(entities.activePassiveCreatureCount === 1, 'saved duplicate UUID is not loaded twice');

// Invalid terrain and unloaded chunks cannot produce a spawn.
chunks.removeChunk(0, 0);
const before = entities.activePassiveCreatureCount;
assert(spawner.tick() === 0 && entities.activePassiveCreatureCount === before, 'no spawn attempt creates or loads an absent chunk');
assert(!chunks.hasChunk(0, 0), 'spawner never generates a missing chunk');

entities.dispose();
material.dispose();
texture.dispose();
console.log('Natural passive spawning validation passed.');
