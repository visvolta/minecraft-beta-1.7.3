import type { NeighbourUpdateEvent } from './BlockMutation';

export interface NeighbourQueueMetrics {
  readonly pending: number;
  readonly processed: number;
  readonly duplicateSuppressed: number;
  readonly unloadedDiscarded: number;
  readonly runawayActivations: number;
  readonly runawayDiscarded: number;
  readonly maximumDepth: number;
  readonly lastAbortedGenerationId: number | undefined;
  readonly lastAbortReason: string | undefined;
}

export interface NeighbourUpdateQueueOptions {
  readonly maxEventsPerGeneration?: number;
  readonly maxChainDepth?: number;
  readonly hardPendingLimit?: number;
}

const DEFAULT_MAX_EVENTS_PER_GENERATION = 65_536;
const DEFAULT_MAX_CHAIN_DEPTH = 1_024;
const DEFAULT_HARD_PENDING_LIMIT = 131_072;

/** Non-recursive FIFO with duplicate suppression scoped to one committed mutation. */
export class NeighbourUpdateQueue {
  private events: NeighbourUpdateEvent[] = [];
  private head = 0;
  private readonly mutationKeys = new Set<string>();
  private readonly generationCounts = new Map<number, number>();
  private readonly abortedGenerations = new Set<number>();
  private processed = 0;
  private duplicateSuppressed = 0;
  private unloadedDiscarded = 0;
  private runawayActivations = 0;
  private runawayDiscarded = 0;
  private maximumDepth = 0;
  private lastAbortedGenerationId: number | undefined;
  private lastAbortReason: string | undefined;
  private readonly maxEventsPerGeneration: number;
  private readonly maxChainDepth: number;
  private readonly hardPendingLimit: number;

  public constructor(options: NeighbourUpdateQueueOptions = {}) {
    this.maxEventsPerGeneration = options.maxEventsPerGeneration ?? DEFAULT_MAX_EVENTS_PER_GENERATION;
    this.maxChainDepth = options.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
    this.hardPendingLimit = options.hardPendingLimit ?? DEFAULT_HARD_PENDING_LIMIT;
  }

  public get size(): number {
    return this.events.length - this.head;
  }

  public enqueue(event: NeighbourUpdateEvent): boolean {
    if (this.abortedGenerations.has(event.generationId)) {
      this.runawayDiscarded++;
      return false;
    }
    this.maximumDepth = Math.max(this.maximumDepth, event.depth);
    const generationCount = (this.generationCounts.get(event.generationId) ?? 0) + 1;
    if (generationCount > this.maxEventsPerGeneration) {
      this.abortGeneration(event.generationId, 'generation-event-limit');
      return false;
    }
    if (event.depth > this.maxChainDepth) {
      this.abortGeneration(event.generationId, 'chain-depth-limit');
      return false;
    }
    if (this.size >= this.hardPendingLimit) {
      this.abortGeneration(event.generationId, 'global-pending-limit');
      return false;
    }
    const key = `${event.mutationId}:${event.receiverPosition.x},${event.receiverPosition.y},${event.receiverPosition.z}:${event.sourcePosition.x},${event.sourcePosition.y},${event.sourcePosition.z}`;
    if (this.mutationKeys.has(key)) {
      this.duplicateSuppressed++;
      return false;
    }
    this.mutationKeys.add(key);
    this.generationCounts.set(event.generationId, generationCount);
    this.events.push(event);
    return true;
  }

  public recordUnloadedDiscard(): void {
    this.unloadedDiscarded++;
  }

  /** Completes all ordinary work this tick; only the hard runaway guard aborts work. */
  public drain(dispatch: (event: NeighbourUpdateEvent) => void): number {
    let processedNow = 0;
    while (this.head < this.events.length) {
      const event = this.events[this.head++]!;
      if (this.abortedGenerations.has(event.generationId)) {
        this.runawayDiscarded++;
        continue;
      }
      dispatch(event);
      processedNow++;
      this.processed++;
    }
    this.events.length = 0;
    this.head = 0;
    this.mutationKeys.clear();
    this.generationCounts.clear();
    this.abortedGenerations.clear();
    return processedNow;
  }

  public getMetrics(): NeighbourQueueMetrics {
    return {
      pending: this.size,
      processed: this.processed,
      duplicateSuppressed: this.duplicateSuppressed,
      unloadedDiscarded: this.unloadedDiscarded,
      runawayActivations: this.runawayActivations,
      runawayDiscarded: this.runawayDiscarded,
      maximumDepth: this.maximumDepth,
      lastAbortedGenerationId: this.lastAbortedGenerationId,
      lastAbortReason: this.lastAbortReason,
    };
  }

  private abortGeneration(generationId: number, reason: string): void {
    if (!this.abortedGenerations.has(generationId)) {
      this.abortedGenerations.add(generationId);
      this.runawayActivations++;
      this.lastAbortedGenerationId = generationId;
      this.lastAbortReason = reason;
    }
    this.runawayDiscarded++;
  }
}
