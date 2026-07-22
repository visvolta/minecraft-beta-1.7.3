import { FaceDirection } from '../src/blocks/BlockFace.ts';
import type { BlockDefinition } from '../src/blocks/BlockDefinition.ts';
import type { BlockId } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { ALL_BLOCK_DIRECTIONS, directionOffset, offsetBlockPosition, oppositeDirection, type BlockPosition } from '../src/world/BlockDirections.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { RedstonePowerEngine } from '../src/world/redstone/RedstonePowerEngine.ts';
import { clampRedstonePower } from '../src/world/redstone/RedstonePower.ts';
import { RandomTickScheduler } from '../src/world/ticks/RandomTickScheduler.ts';
import { WorldTickScheduler } from '../src/world/ticks/WorldTickScheduler.ts';
import { NeighbourUpdateQueue } from '../src/world/updates/NeighbourUpdateQueue.ts';
import type { NeighbourUpdateEvent } from '../src/world/updates/BlockMutation.ts';
import { ChunkSerializer } from '../src/persistence/nbt/ChunkSerializer.ts';
import { nbt, type NbtCompound, type NbtTag } from '../src/persistence/nbt/Nbt.ts';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

const SOURCE = 200;
const WEAK_SOURCE = 201;
const SOLID = 202;
const RECEIVER = 203;
const SCHEDULED = 204;
const LOOP = 205;

function definition(id: number, name: string, solid = false): BlockDefinition {
  return {
    id,
    name,
    displayName: name,
    solid,
    transparent: !solid,
    replaceable: false,
    textures: { all: 'stone' },
    renderType: solid ? 'opaque' : 'cutout',
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

function createTestWorld(queueLimits: { maxEventsPerGeneration?: number; maxChainDepth?: number } = {}): TestWorld {
  const registry = new BlockRegistry();
  registry.register(definition(0, 'air'));
  registry.register(definition(SOURCE, 'source'));
  registry.register(definition(WEAK_SOURCE, 'weak_source'));
  registry.register(definition(SOLID, 'solid', true));
  registry.register(definition(RECEIVER, 'receiver'));
  registry.register(definition(SCHEDULED, 'scheduled'));
  registry.register(definition(LOOP, 'loop'));
  const chunks = new ChunkManager();
  for (const [cx, cz] of [[0, 0], [1, 0], [-1, 0], [0, -1]] as const) chunks.getOrCreateChunk(cx, cz);
  const behaviours = new BlockBehaviourRegistry();
  const world = new BlockUpdateWorld(chunks, registry, new LightEngine(chunks, registry), queueLimits);
  world.setBehaviourRegistry(behaviours);
  const scheduler = new WorldTickScheduler(chunks, world, behaviours, new RandomTickScheduler(123n));
  world.setScheduleCallback((x, y, z, id, delay) => scheduler.schedule(x, y, z, id, delay));
  world.setGameTickProvider(() => scheduler.getGameTick());
  const power = new RedstonePowerEngine(world, registry, behaviours);
  world.setPowerEngine(power);
  const result: TestWorld = {
    registry,
    chunks,
    world,
    behaviours,
    scheduler,
    power,
    tick: 0,
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

function setBlock(test: TestWorld, position: BlockPosition, id: BlockId, metadata = 0, notifyNeighbours = false): void {
  test.world.setBlock(position.x, position.y, position.z, id, { metadata, notifyNeighbours, updateLighting: false });
}

function testPowerAndDirections(): void {
  assert(clampRedstonePower(-4) === 0 && clampRedstonePower(7.9) === 7 && clampRedstonePower(99) === 15 && clampRedstonePower(Number.NaN) === 0, 'power clamps to integer 0..15');
  for (const direction of ALL_BLOCK_DIRECTIONS) {
    assert(oppositeDirection(oppositeDirection(direction)) === direction, `${direction} double opposite`);
    const origin = { x: -16, y: 20, z: -16 };
    const moved = offsetBlockPosition(origin, direction);
    const offset = directionOffset(direction);
    assert(moved.x === origin.x + offset.x && moved.y === origin.y + offset.y && moved.z === origin.z + offset.z, `${direction} world offset`);
  }

  const test = createTestWorld();
  const idleMetrics = test.power.getMetrics();
  assert(idleMetrics.weakQueries === 0 && idleMetrics.strongQueries === 0 && idleMetrics.indirectQueries === 0, 'idle power engine performs no block scan or query work');
  test.behaviours.register(SOURCE, {
    canProvidePower: true,
    getWeakPower: (ctx) => ctx.sourceOutputFace === FaceDirection.EAST ? ctx.sourceMetadata : 0,
    getStrongPower: (ctx) => ctx.sourceOutputFace === FaceDirection.EAST ? 15 : 0,
  });
  test.behaviours.register(WEAK_SOURCE, {
    canProvidePower: true,
    getWeakPower: () => 9,
    getStrongPower: () => 0,
  });

  setBlock(test, { x: 0, y: 10, z: 0 }, SOURCE, 12);
  test.world.setBlockMetadata(0, 10, 0, 99);
  assert(test.world.getBlockMetadata(0, 10, 0) === 15, 'authoritative metadata state clamps above four-bit range');
  test.world.setBlockMetadata(0, 10, 0, -5);
  assert(test.world.getBlockMetadata(0, 10, 0) === 0, 'authoritative metadata state clamps below zero');
  test.world.setBlockMetadata(0, 10, 0, 12);
  assert(test.power.getWeakPowerFrom({ x: 1, y: 10, z: 0 }, FaceDirection.WEST) === 12, 'east-emitting source powers receiver east of source');
  assert(test.power.getWeakPowerFrom({ x: -1, y: 10, z: 0 }, FaceDirection.EAST) === 0, 'east-emitting source does not power receiver west of source');
  assert(test.power.getStrongPowerFrom({ x: 1, y: 10, z: 0 }, FaceDirection.WEST) === 15, 'strong directional output sampled through sourceOutputFace');
  assert(test.power.getMaximumNeighbourWeakPower({ x: 1, y: 10, z: 0 }) === 12, 'maximum neighbouring weak power');
  assert(test.power.getMaximumNeighbourStrongPower({ x: 1, y: 10, z: 0 }) === 15, 'maximum neighbouring strong power');
  assert(test.power.isBlockDirectlyPowered({ x: 1, y: 10, z: 0 }), 'direct power uses neighbouring strong output');

  // Exact Beta call graph: source strong -> one normal cube -> receiver succeeds.
  setBlock(test, { x: 1, y: 10, z: 0 }, SOLID);
  assert(test.power.getIndirectPowerFrom({ x: 2, y: 10, z: 0 }, FaceDirection.WEST) === 15, 'one normal cube exposes strong power received from source');
  // A second normal cube has no strong hook, so the relay does not recurse.
  setBlock(test, { x: 2, y: 10, z: 0 }, SOLID);
  assert(test.power.getIndirectPowerFrom({ x: 3, y: 10, z: 0 }, FaceDirection.WEST) === 0, 'ordinary power does not relay through two normal cubes');

  setBlock(test, { x: 0, y: 10, z: 2 }, WEAK_SOURCE);
  setBlock(test, { x: 1, y: 10, z: 2 }, SOLID);
  assert(test.power.getIndirectPowerFrom({ x: 2, y: 10, z: 2 }, FaceDirection.WEST) === 0, 'weak-only input is not promoted to strong through a normal cube');
  assert(test.power.getWeakPowerFrom({ x: 1000, y: 10, z: 0 }, FaceDirection.WEST) === 0, 'unloaded power query returns zero without creating a chunk');
  assert(!test.chunks.hasChunk(62, 0), 'power query never generated unloaded chunk');
  assert(test.power.getMetrics().unloadedQueries > 0, 'unloaded power query diagnostic');

  setBlock(test, { x: -1, y: 10, z: 0 }, SOURCE, 15);
  assert(test.power.getWeakPowerFrom({ x: 0, y: 10, z: 0 }, FaceDirection.WEST) === 15, 'negative-coordinate power crosses chunk boundary');
}

function testNeighbourMutationsAndOrdering(): void {
  const test = createTestWorld();
  const events: NeighbourUpdateEvent[] = [];
  let stateChanges = 0;
  test.behaviours.register(SOURCE, { stateChanged: () => { stateChanges++; } });
  test.behaviours.register(RECEIVER, {
    requiresNeighbourReconciliation: true,
    neighborChanged: (_ctx, _x, _y, _z, _sx, _sy, _sz, event) => { if (event) events.push(event); },
  });

  const center = { x: 8, y: 10, z: 8 };
  const expectedReceivers = ALL_BLOCK_DIRECTIONS.map((direction) => offsetBlockPosition(center, direction));
  for (const receiver of expectedReceivers) setBlock(test, receiver, RECEIVER);
  setBlock(test, center, SOURCE, 0, true);
  test.step();
  assert(events.length === 6, 'placement notifies six loaded orthogonal receivers');
  assert(events.map((event) => `${event.receiverPosition.x},${event.receiverPosition.y},${event.receiverPosition.z}`).join('|') === expectedReceivers.map((position) => `${position.x},${position.y},${position.z}`).join('|'), 'Beta deterministic neighbour direction order');
  assert(events.every((event) => event.previousState.blockId === 0 && event.currentState.blockId === SOURCE), 'placement event reports air -> source transition');
  assert(new Set(events.map((event) => event.mutationId)).size === 1 && new Set(events.map((event) => event.generationId)).size === 1, 'one committed placement owns one mutation and generation id');

  events.length = 0;
  test.world.setBlockMetadata(center.x, center.y, center.z, 7, { notifyNeighbours: true, reason: 'world' });
  test.step();
  assert(events.length === 6 && events.every((event) => event.previousState.metadata === 0 && event.currentState.metadata === 7), 'metadata-only change notifies with old/new state');
  assert(stateChanges === 1, 'changed block receives one stateChanged lifecycle callback');

  events.length = 0;
  test.world.setBlock(center.x, center.y, center.z, 0, { notifyNeighbours: true, updateLighting: false });
  test.step();
  assert(events.length === 6 && events.every((event) => event.previousState.blockId === SOURCE && event.currentState.blockId === 0), 'removal reports previous source identity');

  const queue = new NeighbourUpdateQueue();
  const sample = events[0]!;
  assert(queue.enqueue(sample), 'first event enqueued');
  assert(!queue.enqueue(sample), 'same mutation/receiver/source duplicate suppressed');
  assert(queue.enqueue({ ...sample, mutationId: sample.mutationId + 1 }), 'distinct nested mutation preserved even with identical state transition');
  assert(queue.getMetrics().duplicateSuppressed === 1, 'mutation-scoped duplicate metric');

  // Cross loaded chunk boundary at local 15 -> 0.
  events.length = 0;
  setBlock(test, { x: 16, y: 10, z: 4 }, RECEIVER);
  setBlock(test, { x: 15, y: 10, z: 4 }, SOURCE, 0, true);
  test.step();
  assert(events.some((event) => event.receiverPosition.x === 16 && event.sourcePosition.x === 15), 'neighbour notification crosses loaded chunk boundary');

  // Unloaded target is discarded, then targeted reconciliation restores only sensitive boundary blocks.
  test.chunks.removeChunk(1, 0);
  test.world.setBlockMetadata(15, 10, 4, 1, { notifyNeighbours: true });
  test.step();
  assert(test.world.getNeighbourQueueMetrics().unloadedDiscarded > 0, 'unloaded neighbour notification discarded');
  const reloaded = test.chunks.getOrCreateChunk(1, 0);
  reloaded.setBlock(0, 10, 4, RECEIVER);
  const reconciled = test.scheduler.reconcileChunkBoundaries(reloaded);
  test.step();
  assert(reconciled > 0 && events.some((event) => event.reason === 'chunk-load' && event.receiverPosition.x === 16), 'targeted sensitive boundary reconciliation on load');
}

function testScheduledTicksAndPersistence(): void {
  const test = createTestWorld();
  const order: string[] = [];
  test.behaviours.register(SCHEDULED, {
    scheduledTick: (ctx, x, y, z) => {
      order.push(`${ctx.gameTick}:${x},${y},${z}`);
      if (x === 2) ctx.world.scheduleBlockTick(3, y, z, SCHEDULED, 0);
    },
  });
  for (const x of [1, 2, 3, 5, 6, 17]) setBlock(test, { x, y: 10, z: 1 }, SCHEDULED);

  assert(test.scheduler.schedule(17, 10, 1, SCHEDULED, 1), 'first cross-chunk schedule accepted');
  assert(test.scheduler.schedule(1, 10, 1, SCHEDULED, 1), 'second same-tick schedule accepted');
  assert(!test.scheduler.schedule(1, 10, 1, SCHEDULED, 0), 'duplicate earlier request suppressed; first pending wins');
  assert(!test.scheduler.schedule(1, 10, 1, SCHEDULED, 1), 'duplicate same-time request suppressed');
  assert(!test.scheduler.schedule(1, 10, 1, SCHEDULED, 20), 'duplicate later request suppressed');
  test.step();
  assert(order.slice(0, 2).join('|') === '1:17,10,1|1:1,10,1', 'same-tick entries use stable global insertion order through chunk-head heap');

  order.length = 0;
  test.scheduler.schedule(2, 10, 1, SCHEDULED, 0);
  test.step();
  assert(order.join('|') === '2:2,10,1', 'delay-zero entry present before snapshot runs at next boundary');
  test.step();
  assert(order.join('|') === '2:2,10,1|3:3,10,1', 'delay-zero scheduled inside callback waits for next tick snapshot');

  order.length = 0;
  test.scheduler.schedule(5, 10, 1, SCHEDULED, 2);
  test.scheduler.schedule(6, 10, 1, SCHEDULED, 4);
  test.step();
  assert(order.length === 0, 'future delayed entries do not run early');
  test.step();
  assert(order.join('|') === '5:5,10,1', 'first delayed entry executes at due tick');
  test.step(2);
  assert(order.join('|') === '5:5,10,1|7:6,10,1', 'several delayed entries retain due ordering');

  setBlock(test, { x: 4, y: 10, z: 1 }, SCHEDULED);
  test.scheduler.schedule(4, 10, 1, SCHEDULED, 1);
  setBlock(test, { x: 4, y: 10, z: 1 }, SOURCE);
  test.step();
  assert(!order.some((entry) => entry.endsWith('4,10,1')), 'stale expected block identity skips callback');
  assert(test.scheduler.getMetrics().skippedStaleTicks > 0, 'stale scheduled tick diagnostic');

  assert(!test.scheduler.schedule(1000, 10, 1000, SCHEDULED, 1), 'scheduling directly into unloaded chunk rejected');
  test.step();
  assert(test.scheduler.getMetrics().rejectedUnloadedSchedules > 0, 'unloaded schedule rejection diagnostic');

  // Save a loaded chunk with a remaining delay, unload it, then restore against a new clock.
  const persistence = createTestWorld();
  setBlock(persistence, { x: 1, y: 10, z: 1 }, SCHEDULED);
  persistence.step(5);
  persistence.scheduler.schedule(1, 10, 1, SCHEDULED, 20);
  const chunk = persistence.chunks.getChunk(0, 0)!;
  chunk.markPersistenceClean(chunk.getPersistenceRevision());
  assert(!chunk.isPersistenceDirty(), 'autosaved chunk with still-pending tick may be clean');
  chunk.requireScheduledTickUnloadSnapshot();
  assert(chunk.isPersistenceDirty(), 'streaming unload forces a fresh remaining-delay snapshot');
  const encoded = ChunkSerializer.encodeChunk(chunk, BigInt(persistence.scheduler.getGameTick()));
  persistence.chunks.removeChunk(0, 0);
  assert(chunk.getScheduledTicks().size === 0, 'active scheduled entries removed when chunk unloads after save snapshot');
  const restored = ChunkSerializer.decodeChunk(encoded, 100);
  const restoredEntry = restored.getScheduledTicks().peek();
  assert(restoredEntry?.dueTick === 120, 'remaining delay restored relative to current simulation tick');

  const level = encoded.value.get('Level');
  assert(level?.type === 'compound', 'persistence fixture level compound');
  const levelMap = (level as NbtCompound).value as Map<string, NbtTag>;
  assert(!levelMap.has('NeighbourUpdates'), 'transient neighbour queue is not persisted');
  const legacyEntry = new Map<string, NbtTag>();
  legacyEntry.set('x', nbt.int(1)); legacyEntry.set('y', nbt.int(10)); legacyEntry.set('z', nbt.int(1));
  legacyEntry.set('id', nbt.int(SCHEDULED)); legacyEntry.set('time', nbt.int(25)); legacyEntry.set('seq', nbt.int(7));
  const malformedEntry = new Map<string, NbtTag>();
  malformedEntry.set('x', nbt.int(99)); malformedEntry.set('y', nbt.int(10)); malformedEntry.set('z', nbt.int(1));
  malformedEntry.set('id', nbt.int(999)); malformedEntry.set('delay', nbt.int(-5)); malformedEntry.set('order', nbt.int(8));
  levelMap.set('TileTicks', nbt.list('compound', [nbt.compound(legacyEntry), nbt.compound(malformedEntry)]));
  const legacyRestored = ChunkSerializer.decodeChunk(encoded, 100);
  const legacyTicks = legacyRestored.getScheduledTicks().getEntries();
  assert(legacyTicks.length === 1 && legacyTicks[0]!.dueTick === 120, 'legacy absolute tick normalizes using saved simulation time');
  assert(persistence.scheduler.getMetrics().unloadedDiscardedTicks >= 0, 'unload discard metric remains safe');
}

function testScheduledBudget(): void {
  const test = createTestWorld();
  let processed = 0;
  test.behaviours.register(SCHEDULED, { scheduledTick: () => { processed++; } });
  for (let index = 0; index < 1001; index++) {
    const x = index & 15;
    const z = (index >> 4) & 15;
    const y = 1 + (index >> 8);
    setBlock(test, { x, y, z }, SCHEDULED);
    assert(test.scheduler.schedule(x, y, z, SCHEDULED, 0), `budget fixture schedule ${index}`);
  }
  test.step();
  assert(processed === 1000 && test.scheduler.getMetrics().pendingScheduledTicks === 1, 'Beta 1000 scheduled-callback cap defers deterministic remainder');
  test.step();
  assert(processed === 1001 && test.scheduler.getMetrics().pendingScheduledTicks === 0, 'deferred scheduled entry executes next simulation tick');
}

function testRunawayProtection(): void {
  const test = createTestWorld({ maxEventsPerGeneration: 32, maxChainDepth: 64 });
  test.behaviours.register(LOOP, {
    requiresNeighbourReconciliation: true,
    neighborChanged: (ctx, _x, _y, _z, sx, sy, sz) => {
      const next = ctx.world.getBlockMetadata(sx, sy, sz) === 0 ? 1 : 0;
      ctx.world.setBlockMetadata(sx, sy, sz, next, { notifyNeighbours: true, reason: 'neighbour' });
    },
  });
  setBlock(test, { x: 5, y: 10, z: 5 }, LOOP);
  setBlock(test, { x: 6, y: 10, z: 5 }, LOOP);
  test.world.setBlockMetadata(5, 10, 5, 1, { notifyNeighbours: true });
  test.step();
  const metrics = test.scheduler.getMetrics();
  assert(metrics.runawayLimitActivations > 0 && metrics.runawayDiscardedUpdates > 0, 'two-block oscillator aborted by hard generation limit without recursion');
  assert(metrics.lastAbortedGenerationId !== undefined && metrics.lastAbortReason === 'generation-event-limit', 'runaway diagnostics identify generation and limit reason');
  assert(test.world.getPendingNeighbourUpdateCount() === 0, 'offending generation does not leak queued work into later simulation ticks');
}

function main(): void {
  testPowerAndDirections();
  testNeighbourMutationsAndOrdering();
  testScheduledTicksAndPersistence();
  testScheduledBudget();
  testRunawayProtection();
  console.log('Redstone power engine, neighbour queue, scheduling, chunk boundaries, persistence and runaway validation passed.');
}

main();
