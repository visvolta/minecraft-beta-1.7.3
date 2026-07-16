import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { RandomTickScheduler } from '../src/world/ticks/RandomTickScheduler.ts';
import { WorldTickScheduler } from '../src/world/ticks/WorldTickScheduler.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const registry = new BlockRegistry();
registerDefaultBlocks(registry);
const chunks = new ChunkManager();
chunks.getOrCreateChunk(0, 0);
chunks.getOrCreateChunk(1, 0);
const light = new LightEngine(chunks, registry);
const world = new BlockUpdateWorld(chunks, registry, light);
const behaviours = new BlockBehaviourRegistry();
const scheduler = new WorldTickScheduler(chunks, world, behaviours, new RandomTickScheduler(1234n));
world.setScheduleCallback((x, y, z, id, delay) => scheduler.schedule(x, y, z, id, delay));

const scheduledOrder: string[] = [];
const neighbourOrder: string[] = [];
let randomCount = 0;

behaviours.register(BlockIds.Stone, {
  randomTicks: true,
  scheduledTick: (_ctx, x, y, z) => scheduledOrder.push(`${x},${y},${z}`),
  randomTick: () => { randomCount += 1; },
  neighborChanged: (_ctx, x, y, z, sx, sy, sz) => neighbourOrder.push(`${sx},${sy},${sz}->${x},${y},${z}`),
});

world.setBlock(1, 10, 1, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
world.setBlock(17, 10, 1, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
world.scheduleBlockTick(17, 10, 1, BlockIds.Stone, 1);
world.scheduleBlockTick(1, 10, 1, BlockIds.Stone, 1);
world.scheduleBlockTick(1, 10, 1, BlockIds.Stone, 1); // duplicate, must suppress
scheduler.update(0.05);
assert(scheduledOrder.join('|') === '17,10,1|1,10,1', `global sequence order/duplicate failed: ${scheduledOrder.join('|')}`);
assert(scheduler.getMetrics().duplicateSuppressedTicks >= 1, 'duplicate suppression metric missing');

world.setBlock(2, 10, 1, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
world.scheduleBlockTick(2, 10, 1, BlockIds.Stone, 1);
world.setBlock(2, 10, 1, BlockIds.Air, { updateLighting: false, notifyNeighbours: false });
scheduler.update(0.05);
assert(!scheduledOrder.includes('2,10,1'), 'stale expected-block scheduled tick executed');
assert(scheduler.getMetrics().skippedStaleTicks >= 1, 'stale tick metric missing');

world.setBlock(4, 10, 4, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
world.setBlock(5, 10, 4, BlockIds.Stone, { updateLighting: false, notifyNeighbours: true });
scheduler.update(0.05);
assert(neighbourOrder.length > 0, 'neighbour update queue did not dispatch');

scheduler.update(0.05);
assert(scheduler.getMetrics().randomTickMetrics.positionsSampled > 0, 'random tick sampler did not run');
console.log('Scheduler validation passed.');
