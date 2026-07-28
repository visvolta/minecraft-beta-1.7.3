/**
 * Ad-hoc benchmark: initial lighting cost, main thread vs shared worker module.
 * Not part of validate:all.
 */
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { BetaWorldGenerator } from '../src/world/generation/BetaWorldGenerator.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { buildLightLookupTables, computeInitialChunkLight } from '../src/world/generation/lighting/initialChunkLight.ts';

const registry = new BlockRegistry();
registerDefaultBlocks(registry);
const gen = new BetaWorldGenerator(1234n);
const tables = buildLightLookupTables(registry);

const N = 8;
let engineMs = 0, sharedMs = 0;
for (let i = 0; i < N; i++) {
  const chunks = new ChunkManager();
  const c = chunks.getOrCreateChunk(i, 0);
  gen.populate(c);
  const blocks = c.copyBlocks();

  const engine = new LightEngine(chunks, registry);
  let t = performance.now();
  engine.initializeChunkLighting(c);
  engineMs += performance.now() - t;

  t = performance.now();
  computeInitialChunkLight(blocks, tables);
  sharedMs += performance.now() - t;
}
console.log(`initial lighting per chunk (avg of ${N}):`);
console.log(`  main-thread LightEngine.initializeChunkLighting : ${(engineMs / N).toFixed(2)} ms`);
console.log(`  shared module (runs in generation worker)       : ${(sharedMs / N).toFixed(2)} ms`);
console.log(`  main-thread cost removed per chunk             : ${(engineMs / N).toFixed(2)} ms -> 0 (moved off-thread)`);
