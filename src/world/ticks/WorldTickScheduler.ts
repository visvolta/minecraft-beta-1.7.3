import type { BlockId } from '../../blocks/BlockId';
import { FaceDirection } from '../../blocks/BlockFace';
import type { BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { HORIZONTAL_BLOCK_DIRECTIONS, directionOffset, oppositeDirection, type BlockPosition } from '../BlockDirections';
import type { BlockUpdateWorld } from '../BlockUpdateWorld';
import type { Chunk } from '../Chunk';
import type { ChunkManager } from '../ChunkManager';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';
import type { WorldEventQueue } from '../events/WorldEventQueue';
import type { NeighbourUpdateEvent } from '../updates/BlockMutation';
import { worldToChunkLocal } from '../worldToChunkCoords';
import { RandomTickScheduler, type RandomTickMetrics } from './RandomTickScheduler';
import { ScheduledTickHeadHeap } from './ScheduledTickHeadHeap';
import type { ScheduledTickEntry } from './ScheduledTickQueue';

export interface TickSchedulerMetrics {
  readonly gameTick: number;
  readonly pendingScheduledTicks: number;
  readonly overdueScheduledTicks: number;
  readonly processedScheduledTicks: number;
  readonly skippedStaleTicks: number;
  readonly duplicateSuppressedTicks: number;
  readonly rejectedUnloadedSchedules: number;
  readonly unloadedDiscardedTicks: number;
  readonly pendingNeighbourUpdates: number;
  readonly processedNeighbourUpdates: number;
  readonly duplicateNeighbourUpdates: number;
  readonly discardedUnloadedNeighbourUpdates: number;
  readonly runawayLimitActivations: number;
  readonly runawayDiscardedUpdates: number;
  readonly maximumUpdateDepth: number;
  readonly lastAbortedGenerationId: number | undefined;
  readonly lastAbortReason: string | undefined;
  readonly boundaryReconciliationNotifications: number;
  readonly randomTicksProcessed: number;
  readonly oldestPendingScheduledTickAge: number;
  /** Compatibility fields retained for existing diagnostics; detached queues no longer exist. */
  readonly detachedChunkTickQueues: number;
  readonly detachedPendingTicks: number;
  readonly restoredDetachedTicks: number;
  readonly discardedDetachedTicks: number;
  readonly dispatcherTimeMs: number;
  readonly randomTickMetrics: RandomTickMetrics;
}

const GAME_TICKS_PER_SECOND = 20;
const SCHEDULED_TICK_BUDGET = 1_000;

interface BoundaryInterestCache {
  readonly blockRevision: number;
  readonly sides: Map<FaceDirection, Uint8Array>;
}

/** One authoritative world-block tick dispatcher driven by Engine's fixed-step event. */
export class WorldTickScheduler {
  private gameTick = 0;
  private sequence = 0;
  private compatibilityAccumulator = 0;
  private readonly headHeap = new ScheduledTickHeadHeap();
  private readonly gameTickCallbacks: Array<() => void> = [];
  private readonly reconciliationCapabilityCache = new Map<BlockId, boolean>();
  private readonly boundaryInterestCache = new WeakMap<Chunk, BoundaryInterestCache>();
  private metrics: TickSchedulerMetrics;
  private rejectedUnloadedSchedules = 0;
  private unloadedDiscardedTicks = 0;
  private historicalDuplicateSuppressions = 0;
  private boundaryReconciliationNotifications = 0;
  private tickStartTime = 0;
  private processedScheduledThisTick = 0;
  private skippedStaleThisTick = 0;
  private processedNeighboursThisTick = 0;
  private randomMetrics: RandomTickMetrics;
  private metricsDirty = true;
  private lastDispatcherTimeMs = 0;

  public constructor(
    private readonly chunkManager: ChunkManager,
    private readonly updateWorld: BlockUpdateWorld,
    private readonly behaviours: BlockBehaviourRegistry,
    private readonly randomTicks: RandomTickScheduler,
    private readonly events?: WorldEventQueue,
  ) {
    this.randomMetrics = randomTicks.getMetrics();
    this.metrics = this.emptyMetrics(this.randomMetrics);
    this.chunkManager.addRemoveListener((chunk) => this.discardUnloadedChunkTicks(chunk));
  }

  public schedule(worldX: number, worldY: number, worldZ: number, blockId: BlockId, delayTicks: number): boolean {
    this.metricsDirty = true;
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return false;
    const coords = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(coords.chunkX, coords.chunkZ);
    if (chunk === undefined) {
      this.rejectedUnloadedSchedules++;
      return false;
    }
    const dueTick = this.gameTick + Math.max(0, Math.trunc(delayTicks));
    const scheduled = chunk.getScheduledTicks().schedule(
      coords.localX,
      worldY,
      coords.localZ,
      blockId,
      dueTick,
      this.sequence++,
    );
    if (scheduled) this.indexChunkHead(chunk);
    return scheduled;
  }

  /** First half of one Engine-owned fixed simulation tick. */
  public beginTick(gameTick: number): void {
    this.metricsDirty = true;
    this.gameTick = Math.max(this.gameTick + 1, Math.trunc(gameTick));
    this.tickStartTime = performance.now();
    this.processedScheduledThisTick = 0;
    this.skippedStaleThisTick = 0;
    this.processedNeighboursThisTick = 0;

    const due = this.snapshotDueTicks();
    const ctx = this.createContext();
    for (const scheduled of due) {
      const currentBlock = this.updateWorld.getBlock(scheduled.x, scheduled.entry.localY, scheduled.z);
      if (currentBlock === scheduled.entry.blockId) {
        this.behaviours.get(scheduled.entry.blockId).scheduledTick?.(
          ctx,
          scheduled.x,
          scheduled.entry.localY,
          scheduled.z,
          scheduled.entry.blockId,
        );
      } else {
        this.skippedStaleThisTick++;
      }
      this.processedScheduledThisTick++;
    }

    this.processedNeighboursThisTick += this.flushNeighbourUpdates();
    this.randomMetrics = this.randomTicks.process(this.chunkManager, this.behaviours, ctx);
    this.processedNeighboursThisTick += this.flushNeighbourUpdates();
    for (const callback of this.gameTickCallbacks) callback();
    this.processedNeighboursThisTick += this.flushNeighbourUpdates();
  }

  /** Final flush after Engine runs its existing Player/entity fixed-step branch. */
  public endTick(): void {
    this.processedNeighboursThisTick += this.flushNeighbourUpdates();
    this.lastDispatcherTimeMs = performance.now() - this.tickStartTime;
    this.metricsDirty = true;
  }

  /** Compatibility helper for validators; production is driven by Engine.beginTick/endTick. */
  public update(deltaSeconds: number): void {
    this.compatibilityAccumulator += Math.max(0, deltaSeconds) * GAME_TICKS_PER_SECOND;
    while (this.compatibilityAccumulator >= 1) {
      this.beginTick(this.gameTick + 1);
      this.endTick();
      this.compatibilityAccumulator -= 1;
    }
  }

  public addGameTickCallback(callback: () => void): void {
    this.gameTickCallbacks.push(callback);
  }

  public getMetrics(): TickSchedulerMetrics {
    if (this.metricsDirty) {
      this.metrics = this.buildMetrics();
      this.metricsDirty = false;
    }
    return this.metrics;
  }

  public getGameTick(): number {
    return this.gameTick;
  }

  /** Rebase persisted relative ordering into this session and index the loaded queue head. */
  public indexLoadedChunkTicks(chunk: Chunk): void {
    this.metricsDirty = true;
    const entries = chunk.getScheduledTicks().drainAll();
    entries.sort((a, b) => a.dueTick - b.dueTick || a.sequence - b.sequence);
    for (const entry of entries) {
      chunk.getScheduledTicks().schedule(
        entry.localX,
        entry.localY,
        entry.localZ,
        entry.blockId,
        entry.dueTick,
        this.sequence++,
      );
    }
    this.indexChunkHead(chunk);
  }

  /** Targeted, capability-filtered reconciliation for newly loaded horizontal boundaries. */
  public reconcileChunkBoundaries(chunk: Chunk): number {
    this.metricsDirty = true;
    const generationId = this.updateWorld.createUpdateGeneration();
    let enqueued = 0;
    const baseX = chunk.chunkX * CHUNK_SIZE_X;
    const baseZ = chunk.chunkZ * CHUNK_SIZE_Z;
    for (const direction of HORIZONTAL_BLOCK_DIRECTIONS) {
      const offset = directionOffset(direction);
      const neighbour = this.chunkManager.getChunk(chunk.chunkX + offset.x, chunk.chunkZ + offset.z);
      if (neighbour === undefined) continue;
      const insideInterest = this.getBoundaryInterest(chunk, direction);
      const outsideInterest = this.getBoundaryInterest(neighbour, oppositeDirection(direction));
      for (let along = 0; along < CHUNK_SIZE_X; along++) {
        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const interestIndex = along * CHUNK_SIZE_Y + y;
          if (insideInterest[interestIndex] === 0 && outsideInterest[interestIndex] === 0) continue;
          let inside: BlockPosition;
          if (direction === FaceDirection.WEST) inside = { x: baseX, y, z: baseZ + along };
          else if (direction === FaceDirection.EAST) inside = { x: baseX + CHUNK_SIZE_X - 1, y, z: baseZ + along };
          else if (direction === FaceDirection.NORTH) inside = { x: baseX + along, y, z: baseZ };
          else inside = { x: baseX + along, y, z: baseZ + CHUNK_SIZE_Z - 1 };
          const outside = { x: inside.x + offset.x, y, z: inside.z + offset.z };
          if (insideInterest[interestIndex] !== 0 && this.updateWorld.enqueueBoundaryReconciliation(inside, outside, generationId)) enqueued++;
          if (outsideInterest[interestIndex] !== 0 && this.updateWorld.enqueueBoundaryReconciliation(outside, inside, generationId)) enqueued++;
        }
      }
    }
    this.boundaryReconciliationNotifications += enqueued;
    return enqueued;
  }

  private snapshotDueTicks(): Array<{ readonly x: number; readonly z: number; readonly entry: ScheduledTickEntry }> {
    const due: Array<{ x: number; z: number; entry: ScheduledTickEntry }> = [];
    while (due.length < SCHEDULED_TICK_BUDGET) {
      const head = this.peekValidHead();
      if (head === undefined || head.dueTick > this.gameTick) break;
      this.headHeap.pop();
      const chunk = this.chunkManager.getChunk(head.chunkX, head.chunkZ)!;
      const entry = chunk.getScheduledTicks().pop()!;
      due.push({
        x: chunk.chunkX * CHUNK_SIZE_X + entry.localX,
        z: chunk.chunkZ * CHUNK_SIZE_Z + entry.localZ,
        entry,
      });
      this.indexChunkHead(chunk);
    }
    return due;
  }

  private peekValidHead() {
    while (true) {
      const head = this.headHeap.peek();
      if (head === undefined) return undefined;
      const chunk = this.chunkManager.getChunk(head.chunkX, head.chunkZ);
      const current = chunk?.getScheduledTicks().peek();
      if (current !== undefined && current.dueTick === head.dueTick && current.sequence === head.sequence) return head;
      this.headHeap.pop();
    }
  }

  private indexChunkHead(chunk: Chunk): void {
    const entry = chunk.getScheduledTicks().peek();
    if (entry === undefined) return;
    this.headHeap.push({
      chunkX: chunk.chunkX,
      chunkZ: chunk.chunkZ,
      dueTick: entry.dueTick,
      sequence: entry.sequence,
    });
  }

  private flushNeighbourUpdates(): number {
    return this.updateWorld.drainNeighbourNotifications((notification, ctx) => this.dispatchNeighbour(notification, ctx));
  }

  private dispatchNeighbour(notification: NeighbourUpdateEvent, ctx: BlockBehaviourContext): void {
    const receiver = notification.receiverPosition;
    const blockId = this.updateWorld.getBlock(receiver.x, receiver.y, receiver.z);
    this.behaviours.get(blockId).neighborChanged?.(
      ctx,
      receiver.x,
      receiver.y,
      receiver.z,
      notification.sourcePosition.x,
      notification.sourcePosition.y,
      notification.sourcePosition.z,
      notification,
    );
  }

  private discardUnloadedChunkTicks(chunk: Chunk): void {
    this.metricsDirty = true;
    this.historicalDuplicateSuppressions += chunk.getScheduledTicks().getDuplicateSuppressions();
    this.unloadedDiscardedTicks += chunk.getScheduledTicks().drainAll().length;
  }

  private getBoundaryInterest(chunk: Chunk, direction: FaceDirection): Uint8Array {
    let cached = this.boundaryInterestCache.get(chunk);
    if (cached === undefined || cached.blockRevision !== chunk.getBlockRevision()) {
      cached = { blockRevision: chunk.getBlockRevision(), sides: new Map() };
      this.boundaryInterestCache.set(chunk, cached);
    }
    const existing = cached.sides.get(direction);
    if (existing !== undefined) return existing;
    const flags = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y);
    for (let along = 0; along < CHUNK_SIZE_X; along++) {
      for (let y = 0; y < CHUNK_SIZE_Y; y++) {
        let localX: number;
        let localZ: number;
        if (direction === FaceDirection.WEST) { localX = 0; localZ = along; }
        else if (direction === FaceDirection.EAST) { localX = CHUNK_SIZE_X - 1; localZ = along; }
        else if (direction === FaceDirection.NORTH) { localX = along; localZ = 0; }
        else { localX = along; localZ = CHUNK_SIZE_Z - 1; }
        const blockId = chunk.getBlock(localX, y, localZ);
        if (blockId !== 0 && this.needsBoundaryReconciliation(blockId)) flags[along * CHUNK_SIZE_Y + y] = 1;
      }
    }
    cached.sides.set(direction, flags);
    return flags;
  }

  private needsBoundaryReconciliation(blockId: BlockId): boolean {
    let cached = this.reconciliationCapabilityCache.get(blockId);
    if (cached === undefined) {
      cached = this.behaviours.requiresNeighbourReconciliation(blockId);
      this.reconciliationCapabilityCache.set(blockId, cached);
    }
    return cached;
  }

  private createContext(): BlockBehaviourContext {
    return this.updateWorld.createTickBehaviourContext(
      this.gameTick,
      (bound) => this.randomTicks.nextInt(bound),
      () => this.randomTicks.nextLong(),
      this.events,
    );
  }

  private buildMetrics(): TickSchedulerMetrics {
    const neighbourMetrics = this.updateWorld.getNeighbourQueueMetrics();
    return {
      gameTick: this.gameTick,
      pendingScheduledTicks: this.countPendingScheduledTicks(),
      overdueScheduledTicks: this.countOverdueScheduledTicks(),
      processedScheduledTicks: this.processedScheduledThisTick,
      skippedStaleTicks: this.skippedStaleThisTick,
      duplicateSuppressedTicks: this.countDuplicateSuppressions(),
      rejectedUnloadedSchedules: this.rejectedUnloadedSchedules,
      unloadedDiscardedTicks: this.unloadedDiscardedTicks,
      pendingNeighbourUpdates: this.updateWorld.getPendingNeighbourUpdateCount(),
      processedNeighbourUpdates: this.processedNeighboursThisTick,
      duplicateNeighbourUpdates: neighbourMetrics.duplicateSuppressed,
      discardedUnloadedNeighbourUpdates: neighbourMetrics.unloadedDiscarded,
      runawayLimitActivations: neighbourMetrics.runawayActivations,
      runawayDiscardedUpdates: neighbourMetrics.runawayDiscarded,
      maximumUpdateDepth: neighbourMetrics.maximumDepth,
      lastAbortedGenerationId: neighbourMetrics.lastAbortedGenerationId,
      lastAbortReason: neighbourMetrics.lastAbortReason,
      boundaryReconciliationNotifications: this.boundaryReconciliationNotifications,
      randomTicksProcessed: this.randomMetrics.dispatched,
      oldestPendingScheduledTickAge: this.oldestPendingAge(),
      detachedChunkTickQueues: 0,
      detachedPendingTicks: 0,
      restoredDetachedTicks: 0,
      discardedDetachedTicks: this.unloadedDiscardedTicks,
      dispatcherTimeMs: this.lastDispatcherTimeMs,
      randomTickMetrics: this.randomMetrics,
    };
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
    let count = this.historicalDuplicateSuppressions;
    for (const chunk of this.chunkManager) count += chunk.getScheduledTicks().getDuplicateSuppressions();
    return count;
  }

  private oldestPendingAge(): number {
    let age = 0;
    for (const chunk of this.chunkManager) age = Math.max(age, chunk.getScheduledTicks().oldestAge(this.gameTick));
    return age;
  }

  private emptyMetrics(randomTickMetrics: RandomTickMetrics): TickSchedulerMetrics {
    return {
      gameTick: 0,
      pendingScheduledTicks: 0,
      overdueScheduledTicks: 0,
      processedScheduledTicks: 0,
      skippedStaleTicks: 0,
      duplicateSuppressedTicks: 0,
      rejectedUnloadedSchedules: 0,
      unloadedDiscardedTicks: 0,
      pendingNeighbourUpdates: 0,
      processedNeighbourUpdates: 0,
      duplicateNeighbourUpdates: 0,
      discardedUnloadedNeighbourUpdates: 0,
      runawayLimitActivations: 0,
      runawayDiscardedUpdates: 0,
      maximumUpdateDepth: 0,
      lastAbortedGenerationId: undefined,
      lastAbortReason: undefined,
      boundaryReconciliationNotifications: 0,
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
