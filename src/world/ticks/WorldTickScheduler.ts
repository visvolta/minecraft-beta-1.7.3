import type { BlockId } from '../../blocks/BlockId';
import type { Chunk } from '../Chunk';
import type { ChunkManager } from '../ChunkManager';
import type { BlockUpdateWorld, NeighbourNotification } from '../BlockUpdateWorld';
import type { BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../chunkConstants';
import { worldToChunkLocal } from '../worldToChunkCoords';
import { RandomTickScheduler, type RandomTickMetrics } from './RandomTickScheduler';
import type { WorldEventQueue } from '../events/WorldEventQueue';
import { ScheduledTickQueue, type ScheduledTickEntry } from './ScheduledTickQueue';

export interface TickSchedulerMetrics {
  readonly gameTick: number;
  readonly pendingScheduledTicks: number;
  readonly overdueScheduledTicks: number;
  readonly processedScheduledTicks: number;
  readonly skippedStaleTicks: number;
  readonly duplicateSuppressedTicks: number;
  readonly pendingNeighbourUpdates: number;
  readonly processedNeighbourUpdates: number;
  readonly randomTicksProcessed: number;
  readonly oldestPendingScheduledTickAge: number;
  readonly detachedChunkTickQueues: number;
  readonly detachedPendingTicks: number;
  readonly restoredDetachedTicks: number;
  readonly discardedDetachedTicks: number;
  readonly dispatcherTimeMs: number;
  readonly randomTickMetrics: RandomTickMetrics;
}

interface DetachedTickQueue {
  readonly queue: ScheduledTickQueue;
  readonly detachedAtTick: number;
}

const GAME_TICKS_PER_SECOND = 20;
const SCHEDULED_TICK_BUDGET = 256;
const NEIGHBOUR_UPDATE_BUDGET = 512;
const DETACHED_QUEUE_LIMIT = 256;

function key(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

export class WorldTickScheduler {
  private gameTick = 0;
  private sequence = 0;
  private accumulator = 0;
  private readonly detachedQueues = new Map<string, DetachedTickQueue>();
  private metrics: TickSchedulerMetrics;
  private restoredDetachedTicks = 0;
  private discardedDetachedTicks = 0;

  public constructor(
    private readonly chunkManager: ChunkManager,
    private readonly updateWorld: BlockUpdateWorld,
    private readonly behaviours: BlockBehaviourRegistry,
    private readonly randomTicks: RandomTickScheduler,
    private readonly events?: WorldEventQueue,
  ) {
    this.metrics = this.emptyMetrics(randomTicks.getMetrics());
    this.chunkManager.addRemoveListener((chunk) => this.detachChunkTicks(chunk));
    this.chunkManager.addCreateListener((chunk) => this.restoreDetachedTicks(chunk));
  }

  public schedule(worldX: number, worldY: number, worldZ: number, blockId: BlockId, delayTicks: number): boolean {
    const coords = worldToChunkLocal(worldX, worldZ);
    const dueTick = this.gameTick + Math.max(0, Math.trunc(delayTicks));
    const chunk = this.chunkManager.getChunk(coords.chunkX, coords.chunkZ);
    if (chunk !== undefined) {
      return chunk.getScheduledTicks().schedule(coords.localX, worldY, coords.localZ, blockId, dueTick, this.sequence++);
    }

    const detached = this.getOrCreateDetachedQueue(coords.chunkX, coords.chunkZ);
    return detached.queue.schedule(coords.localX, worldY, coords.localZ, blockId, dueTick, this.sequence++);
  }

  public update(deltaSeconds: number): void {
    this.accumulator += deltaSeconds * GAME_TICKS_PER_SECOND;
    while (this.accumulator >= 1) {
      this.gameTick += 1;
      this.tickOnce();
      this.accumulator -= 1;
    }
  }

  public getMetrics(): TickSchedulerMetrics {
    return this.metrics;
  }

  public restoreDetachedTicks(chunk: Chunk): void {
    const detached = this.detachedQueues.get(key(chunk.chunkX, chunk.chunkZ));
    if (detached === undefined) return;
    const entries = detached.queue.drainAll();
    chunk.getScheduledTicks().load(entries);
    this.restoredDetachedTicks += entries.length;
    this.detachedQueues.delete(key(chunk.chunkX, chunk.chunkZ));
  }

  private tickOnce(): void {
    const start = performance.now();
    const ctx: BlockBehaviourContext = this.events === undefined
      ? { world: this.updateWorld, gameTick: this.gameTick, nextInt: (bound) => this.randomTicks.nextInt(bound) }
      : { world: this.updateWorld, gameTick: this.gameTick, nextInt: (bound) => this.randomTicks.nextInt(bound), events: this.events };
    let processedScheduledTicks = 0;
    let skippedStaleTicks = 0;

    const processedNeighbourUpdates = this.updateWorld.drainNeighbourNotifications(
      NEIGHBOUR_UPDATE_BUDGET,
      (notification) => this.dispatchNeighbour(notification, ctx),
    );

    while (processedScheduledTicks < SCHEDULED_TICK_BUDGET) {
      const due = this.takeNextDueScheduledTick();
      if (due === undefined) break;
      const { chunk, entry } = due;
      const currentBlock = chunk.getBlock(entry.localX, entry.localY, entry.localZ);
      if (currentBlock === entry.blockId) {
        this.behaviours.get(entry.blockId).scheduledTick?.(
          ctx,
          chunk.chunkX * CHUNK_SIZE_X + entry.localX,
          entry.localY,
          chunk.chunkZ * CHUNK_SIZE_Z + entry.localZ,
          entry.blockId,
        );
      } else {
        skippedStaleTicks += 1;
      }
      processedScheduledTicks += 1;
    }

    const randomMetrics = this.randomTicks.process(this.chunkManager, this.behaviours, ctx);
    this.metrics = {
      gameTick: this.gameTick,
      pendingScheduledTicks: this.countPendingScheduledTicks(),
      overdueScheduledTicks: this.countOverdueScheduledTicks(),
      processedScheduledTicks,
      skippedStaleTicks,
      duplicateSuppressedTicks: this.countDuplicateSuppressions(),
      pendingNeighbourUpdates: this.updateWorld.getPendingNeighbourUpdateCount(),
      processedNeighbourUpdates,
      randomTicksProcessed: randomMetrics.dispatched,
      oldestPendingScheduledTickAge: this.oldestPendingAge(),
      detachedChunkTickQueues: this.detachedQueues.size,
      detachedPendingTicks: this.countDetachedTicks(),
      restoredDetachedTicks: this.restoredDetachedTicks,
      discardedDetachedTicks: this.discardedDetachedTicks,
      dispatcherTimeMs: performance.now() - start,
      randomTickMetrics: randomMetrics,
    };
  }

  private takeNextDueScheduledTick(): { chunk: Chunk; entry: ScheduledTickEntry } | undefined {
    let bestChunk: Chunk | undefined;
    let bestEntry: ScheduledTickEntry | undefined;
    for (const chunk of this.chunkManager) {
      const entry = chunk.getScheduledTicks().peek();
      if (entry === undefined || entry.dueTick > this.gameTick) continue;
      if (
        bestEntry === undefined ||
        entry.dueTick < bestEntry.dueTick ||
        (entry.dueTick === bestEntry.dueTick && entry.sequence < bestEntry.sequence)
      ) {
        bestEntry = entry;
        bestChunk = chunk;
      }
    }
    if (bestChunk === undefined || bestEntry === undefined) return undefined;
    return { chunk: bestChunk, entry: bestChunk.getScheduledTicks().pop()! };
  }

  private dispatchNeighbour(notification: NeighbourNotification, ctx: BlockBehaviourContext): void {
    const coords = worldToChunkLocal(notification.targetX, notification.targetZ);
    const chunk = this.chunkManager.getChunk(coords.chunkX, coords.chunkZ);
    if (chunk === undefined) return;
    const blockId = chunk.getBlock(coords.localX, notification.targetY, coords.localZ);
    this.behaviours.get(blockId).neighborChanged?.(
      ctx,
      notification.targetX,
      notification.targetY,
      notification.targetZ,
      notification.sourceX,
      notification.sourceY,
      notification.sourceZ,
    );
  }

  private detachChunkTicks(chunk: Chunk): void {
    const queue = chunk.getScheduledTicks();
    if (queue.size === 0) return;
    const detached = new ScheduledTickQueue();
    detached.load(queue.drainAll());
    this.detachedQueues.set(key(chunk.chunkX, chunk.chunkZ), { queue: detached, detachedAtTick: this.gameTick });
    this.enforceDetachedLimit();
  }

  private getOrCreateDetachedQueue(chunkX: number, chunkZ: number): DetachedTickQueue {
    const mapKey = key(chunkX, chunkZ);
    let detached = this.detachedQueues.get(mapKey);
    if (detached === undefined) {
      detached = { queue: new ScheduledTickQueue(), detachedAtTick: this.gameTick };
      this.detachedQueues.set(mapKey, detached);
      this.enforceDetachedLimit();
    }
    return detached;
  }

  private enforceDetachedLimit(): void {
    while (this.detachedQueues.size > DETACHED_QUEUE_LIMIT) {
      let oldestKey: string | undefined;
      let oldestTick = Infinity;
      for (const [mapKey, detached] of this.detachedQueues) {
        if (detached.detachedAtTick < oldestTick) {
          oldestTick = detached.detachedAtTick;
          oldestKey = mapKey;
        }
      }
      if (oldestKey === undefined) break;
      const removed = this.detachedQueues.get(oldestKey)!;
      this.discardedDetachedTicks += removed.queue.size;
      this.detachedQueues.delete(oldestKey);
    }
  }

  private countPendingScheduledTicks(): number {
    let count = 0;
    for (const chunk of this.chunkManager) count += chunk.getScheduledTicks().size;
    return count;
  }

  private countOverdueScheduledTicks(): number {
    let count = 0;
    for (const chunk of this.chunkManager) count += chunk.getScheduledTicks().countOverdue(this.gameTick);
    return count;
  }

  private countDuplicateSuppressions(): number {
    let count = 0;
    for (const chunk of this.chunkManager) count += chunk.getScheduledTicks().getDuplicateSuppressions();
    return count;
  }

  private oldestPendingAge(): number {
    let age = 0;
    for (const chunk of this.chunkManager) age = Math.max(age, chunk.getScheduledTicks().oldestAge(this.gameTick));
    return age;
  }

  private countDetachedTicks(): number {
    let count = 0;
    for (const detached of this.detachedQueues.values()) count += detached.queue.size;
    return count;
  }

  private emptyMetrics(randomTickMetrics: RandomTickMetrics): TickSchedulerMetrics {
    return {
      gameTick: 0,
      pendingScheduledTicks: 0,
      overdueScheduledTicks: 0,
      processedScheduledTicks: 0,
      skippedStaleTicks: 0,
      duplicateSuppressedTicks: 0,
      pendingNeighbourUpdates: 0,
      processedNeighbourUpdates: 0,
      randomTicksProcessed: 0,
      oldestPendingScheduledTickAge: 0,
      detachedChunkTickQueues: 0,
      detachedPendingTicks: 0,
      restoredDetachedTicks: 0,
      discardedDetachedTicks: 0,
      dispatcherTimeMs: 0,
      randomTickMetrics,
    };
  }
}
