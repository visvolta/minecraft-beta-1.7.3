/**
 * Ad-hoc benchmark: random-tick sampling volume on realistic generated terrain.
 * Not part of validate:all; run manually during performance work.
 */
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { BetaWorldGenerator } from '../src/world/generation/BetaWorldGenerator.ts';
import { RandomTickScheduler } from '../src/world/ticks/RandomTickScheduler.ts';
import { registerPlantBehaviours } from '../src/world/behaviours/PlantBehaviours.ts';
import { registerGrassBehaviour } from '../src/world/behaviours/GrassBehaviour.ts';
import { registerLeafBehaviour } from '../src/world/behaviours/LeafBehaviour.ts';

const registry = new BlockRegistry();
registerDefaultBlocks(registry);
const chunks = new ChunkManager();
const gen = new BetaWorldGenerator(1234n);

const R = 3; // 7x7 = 49 chunks (radius 6 would be 169 but slow to generate here)
for (let cz = -R; cz <= R; cz++) {
  for (let cx = -R; cx <= R; cx++) {
    const chunk = chunks.getOrCreateChunk(cx, cz);
    gen.populate(chunk);
  }
}

const behaviours = new BlockBehaviourRegistry();
registerPlantBehaviours(behaviours, registry);
registerGrassBehaviour(behaviours, registry);
registerLeafBehaviour(behaviours);
const light = new LightEngine(chunks, registry);
const world = new BlockUpdateWorld(chunks, registry, light);
const scheduler = new RandomTickScheduler(42n);
const ctx = { world } as never;

// warm the section cache
scheduler.process(chunks, behaviours, ctx);

let sampled = 0, ms = 0, skipEmpty = 0, skipNoTick = 0, considered = 0;
const N = 20;
for (let i = 0; i < N; i++) {
  const m = scheduler.process(chunks, behaviours, ctx);
  sampled += m.positionsSampled; ms += m.durationMs;
  skipEmpty += m.sectionsSkippedEmpty; skipNoTick += m.sectionsSkippedNoTickable;
  considered += m.sectionsConsidered;
}
const chunkCount = (2 * R + 1) ** 2;
console.log(`chunks=${chunkCount}  sections/tick total=${chunkCount * 8}`);
console.log(`  sections sampled     : ${(considered / N).toFixed(0)}`);
console.log(`  skipped (empty)      : ${(skipEmpty / N).toFixed(0)}`);
console.log(`  skipped (no tickable): ${(skipNoTick / N).toFixed(0)}`);
console.log(`  positions sampled    : ${(sampled / N).toFixed(0)}  (old behaviour = ${chunkCount * 8 * 3})`);
console.log(`  reduction            : ${(100 * (1 - sampled / N / (chunkCount * 8 * 3))).toFixed(1)}%`);
console.log(`  ms/tick              : ${(ms / N).toFixed(3)}`);
