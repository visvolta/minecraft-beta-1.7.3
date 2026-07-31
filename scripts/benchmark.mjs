/**
 * Real-hardware performance benchmark.
 *
 * Drives a fixed route through a fixed-seed world and prints a report for each
 * leg. Run this against a production build on real GPU hardware — software
 * rendering (SwiftShader) produces frame times that are not representative,
 * though its queue depths still are.
 *
 * Usage:
 *
 *   npm run build
 *   npx vite preview --port 4173
 *   node scripts/benchmark.mjs                    # all legs
 *   node scripts/benchmark.mjs --legs A,B         # selected legs
 *   node scripts/benchmark.mjs --seed 12345       # explicit seed
 *   node scripts/benchmark.mjs --out before.json  # save for comparison
 *   node scripts/benchmark.mjs --compare before.json --out after.json
 *
 * Requires Playwright to be available (`npm i -D playwright` or a global
 * install). It is intentionally NOT a project dependency.
 *
 * The primary metrics are median / P95 / P99 / worst frame time and queue
 * drain behaviour — NOT average FPS. A queue that never drains is a failure
 * even when the frame rate looks acceptable.
 */

import fs from 'node:fs';
import process from 'node:process';

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};

const URL_BASE = argOf('url', 'http://localhost:4173/');
const SEED = argOf('seed', '1337');
const OUT = argOf('out', null);
const COMPARE = argOf('compare', null);
const LEGS = argOf('legs', 'A,B,C,D,E,F').split(',').map((s) => s.trim().toUpperCase());
const HEADED = argv.includes('--headed');

/** Seconds each leg samples. Long enough for stable percentiles. */
const LEG_SECONDS = Number(argOf('seconds', '30'));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is required: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function createWorld() {
  await page.goto(URL_BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.locator('button:has-text("Singleplayer")').first().click();
  await page.waitForTimeout(1800);
  await page.locator('button:has-text("Create New World")').first().click();
  await page.waitForTimeout(1200);
  // Fixed seed so every run generates identical terrain.
  const seedBox = page.locator('input').nth(1);
  if (await seedBox.count()) { await seedBox.fill(SEED); }
  await page.locator('button:has-text("Allow Cheats")').first().click();
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Create New World")').first().click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(2000);
    if (await page.evaluate(() => document.querySelectorAll('canvas').length) > 0) break;
  }
  await page.waitForTimeout(12000);
}

const report = () => page.evaluate(() => window.__mcDebug?.getBenchmarkReport?.() ?? null);
const resetDrain = () => page.evaluate(() => window.__mcDebug?.resetDrainTracking?.());
const cmd = async (text) => {
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(500);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
};

async function leg(id, label, setup, teardown) {
  if (!LEGS.includes(id)) return null;
  process.stdout.write(`\nrunning leg ${id}: ${label} ...\n`);
  if (setup) await setup();
  await resetDrain();
  await page.waitForTimeout(LEG_SECONDS * 1000);
  const r = await report();
  if (teardown) await teardown();
  print(id, label, r);
  return r;
}

function print(id, label, r) {
  if (!r) { console.log(`  [${id}] no data (is the debug hook present?)`); return; }
  const f = r.frame, d = r.drain, g = r.generationStages;
  console.log(`  [${id}] ${label}`);
  console.log(`    frame  median=${f.medianMs.toFixed(2)}ms p95=${f.p95Ms.toFixed(2)}ms p99=${f.p99Ms.toFixed(2)}ms worst=${f.worstMs.toFixed(2)}ms`);
  console.log(`           avgFps=${f.avgFps.toFixed(1)} 1%low=${f.onePercentLowFps.toFixed(1)} update=${f.updateMs.toFixed(2)}ms render=${f.renderMs.toFixed(2)}ms longFrames=${f.longFrames}`);
  console.log(`    queues gen(cur/avg/max)=${r.queues.generation.current}/${r.queues.generation.average.toFixed(1)}/${r.queues.generation.maximum}` +
              ` mesh=${r.queues.meshing.current}/${r.queues.meshing.average.toFixed(1)}/${r.queues.meshing.maximum}` +
              ` lightBfsMax=${r.queues.lightingBfsMax}`);
  console.log(`    drain  gen peak=${d.generation.peakDepth} drainMs=${d.generation.lastDrainMs.toFixed(0)} notDraining=${d.generation.notDraining}` +
              ` | mesh peak=${d.meshing.peakDepth} drainMs=${d.meshing.lastDrainMs.toFixed(0)} notDraining=${d.meshing.notDraining}`);
  console.log(`    genStage terrain=${g.terrainMs.toFixed(2)} surface=${g.surfaceMs.toFixed(2)} caves=${g.cavesMs.toFixed(2)} decor=${g.decorationMs.toFixed(2)} snow=${g.snowIceMs.toFixed(2)} total=${g.totalMs.toFixed(2)}ms`);
  console.log(`    render draws=${r.render?.drawCalls ?? '?'} tris=${r.render?.triangles ?? '?'} loaded=${r.chunks.loaded} visible=${r.chunks.visible} dirty=${r.chunks.dirty}`);
  console.log(`    memory heap=${r.memory.jsHeapUsedMb}/${r.memory.jsHeapTotalMb}MB geometry=${r.memory.geometryMb}MB`);
}

await createWorld();
await page.evaluate(() => document.querySelector('canvas')?.click());

const results = {};
results.A = await leg('A', 'idle at spawn', null, null);

results.B = await leg('B', 'exploration (walk into new terrain)',
  async () => { await page.keyboard.down('KeyW'); },
  async () => { await page.keyboard.up('KeyW'); await page.waitForTimeout(2000); });

// Drain recovery: how long queues take to settle after movement stops.
if (results.B) {
  await page.waitForTimeout(15000);
  const settled = await report();
  console.log(`    POST-B settle: genQ=${settled.queues.generation.current} meshQ=${settled.queues.meshing.current}` +
              ` genDrainMs=${settled.drain.generation.lastDrainMs.toFixed(0)} notDraining=${settled.drain.generation.notDraining}`);
  results.B_settle = settled;
}

results.C = await leg('C', 'fast movement (sprint)',
  async () => { await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); },
  async () => { await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); });

results.D = await leg('D', 'Nether traversal',
  async () => { await cmd('/tp 0 70 0'); await page.keyboard.down('KeyW'); },
  async () => { await page.keyboard.up('KeyW'); });

results.E = await leg('E', 'mob stress',
  async () => { for (let i = 0; i < 20; i++) await cmd('/summon Pig'); },
  null);

results.F = await leg('F', 'weather (thunder)',
  async () => { await cmd('/weather thunder'); },
  async () => { await cmd('/weather clear'); });

console.log(`\nconsole errors: ${errors.length}`);
[...new Set(errors)].slice(0, 10).forEach((e) => console.log('  E:', e.slice(0, 160)));

if (OUT) { fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); console.log(`\nwrote ${OUT}`); }

if (COMPARE && fs.existsSync(COMPARE)) {
  const before = JSON.parse(fs.readFileSync(COMPARE, 'utf8'));
  console.log('\n=== COMPARISON (before -> after) ===');
  for (const k of Object.keys(results)) {
    const a = before[k], b = results[k];
    if (!a?.frame || !b?.frame) continue;
    const dp = (x, y) => `${x.toFixed(1)} -> ${y.toFixed(1)} (${y - x >= 0 ? '+' : ''}${(y - x).toFixed(1)})`;
    console.log(`  ${k}: median ${dp(a.frame.medianMs, b.frame.medianMs)}ms | p95 ${dp(a.frame.p95Ms, b.frame.p95Ms)}ms | p99 ${dp(a.frame.p99Ms, b.frame.p99Ms)}ms`);
  }
}

await browser.close();
