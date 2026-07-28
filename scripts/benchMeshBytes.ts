/**
 * Ad-hoc benchmark: chunk mesh vertex volume and worker transfer size.
 * Not part of validate:all; run manually during performance work.
 */
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { BetaWorldGenerator } from '../src/world/generation/BetaWorldGenerator.ts';
import { ChunkMesher } from '../src/rendering/ChunkMesher.ts';
import { VegetationColorProvider } from '../src/world/generation/climate/VegetationColors.ts';
import { GENERAL_VERTEX_BYTES } from '../src/rendering/meshing/ChunkVertexLayout.ts';
import { buildLightLookupTables, computeInitialChunkLight } from '../src/world/generation/lighting/initialChunkLight.ts';
import type { AtlasUvRect } from '../src/assets/TextureAtlas.ts';

const registry = new BlockRegistry();
registerDefaultBlocks(registry);
const chunks = new ChunkManager();
const gen = new BetaWorldGenerator(1234n);
const tables = buildLightLookupTables(registry);

const R = 2;
for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
  const c = chunks.getOrCreateChunk(cx, cz);
  gen.populate(c);
  c.loadLightData(computeInitialChunkLight(c.copyBlocks(), tables));
}

const rect: AtlasUvRect = { u0: 0, v0: 0, u1: 1, v1: 1 };
const atlas = { getUvRect: (): AtlasUvRect => rect };
const mesher = new ChunkMesher(chunks, registry, atlas as never, new VegetationColorProvider(1234n));

let verts = 0, bytes = 0, t0 = performance.now();
const target = chunks.getChunk(0, 0)!;
const N = 10;
for (let i = 0; i < N; i++) {
  const g = mesher.build(target);
  const pos = g.getAttribute('position');
  verts = pos.count;
  bytes = 0;
  for (const a of Object.values(g.attributes)) bytes += a.array.byteLength;
  const idx = g.getIndex(); if (idx) bytes += idx.array.byteLength;
  g.dispose();
}
const ms = (performance.now() - t0) / N;

console.log(`terrain pass, chunk (0,0):`);
console.log(`  vertices           : ${verts}`);
console.log(`  attribute bytes    : ${(bytes / 1024).toFixed(1)} KiB`);
console.log(`  bytes/vertex (attr): ${(bytes / verts).toFixed(1)}`);
console.log(`  layout stride      : ${GENERAL_VERTEX_BYTES} B/vertex (was 108)`);
console.log(`  old-format estimate: ${(verts * 108 / 1024).toFixed(1)} KiB  -> saving ${(100 * (1 - (verts * GENERAL_VERTEX_BYTES) / (verts * 108))).toFixed(0)}%`);
console.log(`  mesh build ms      : ${ms.toFixed(2)}`);
