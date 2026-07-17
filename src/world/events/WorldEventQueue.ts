import { WorldEventType, type LavaIgnitionAttemptEvent, type TntIgniteAttemptEvent } from './WorldEvent';
import type { BlockDropEvent } from './BlockDropEvent';

const CAPACITY = 256;

export class WorldEventQueue {
  private readonly types = new Uint8Array(CAPACITY);
  private readonly eventIds = new Uint32Array(CAPACITY);
  private readonly worldTicks = new Float64Array(CAPACITY);
  private readonly coords = new Int32Array(CAPACITY * 6);
  private readonly blockIds = new Uint16Array(CAPACITY);
  private readonly metadata = new Uint8Array(CAPACITY);
  private readonly randomValues = new Float64Array(CAPACITY);
  private head = 0;
  private count = 0;
  private nextEventId = 1;
  private totalLavaIgnitionAttempts = 0;
  private totalTntIgniteAttempts = 0;
  private discarded = 0;
  private readonly blockDrops: BlockDropEvent[] = [];
  private readonly tntIgniteAttempts: TntIgniteAttemptEvent[] = [];

  public enqueueLavaIgnitionAttempt(
    worldTick: number,
    lavaX: number,
    lavaY: number,
    lavaZ: number,
    candidateX: number,
    candidateY: number,
    candidateZ: number,
    lavaBlockId: number,
    lavaMetadata: number,
    randomValue: number,
  ): void {
    if (this.count >= CAPACITY) {
      this.discarded += 1;
      return;
    }
    const index = (this.head + this.count) % CAPACITY;
    this.types[index] = WorldEventType.LavaIgnitionAttempt;
    this.eventIds[index] = this.nextEventId++;
    this.worldTicks[index] = worldTick;
    const base = index * 6;
    this.coords[base] = lavaX;
    this.coords[base + 1] = lavaY;
    this.coords[base + 2] = lavaZ;
    this.coords[base + 3] = candidateX;
    this.coords[base + 4] = candidateY;
    this.coords[base + 5] = candidateZ;
    this.blockIds[index] = lavaBlockId;
    this.metadata[index] = lavaMetadata;
    this.randomValues[index] = randomValue;
    this.count += 1;
    this.totalLavaIgnitionAttempts += 1;
  }

  /**
   * Enqueue a TNT ignition event. Exactly one per fire-caused TNT removal.
   * Emits through the mutation gateway (TNT block already removed by caller).
   */
  public enqueueTntIgniteAttempt(gameTick: number, x: number, y: number, z: number): void {
    if (this.count + this.blockDrops.length + this.tntIgniteAttempts.length >= CAPACITY) {
      this.discarded += 1;
      return;
    }
    this.tntIgniteAttempts.push({
      type: WorldEventType.TntIgniteAttempt,
      eventId: this.nextEventId++,
      worldTick: gameTick,
      x, y, z,
    });
    this.totalTntIgniteAttempts += 1;
  }

  public getTntIgniteAttemptCount(): number {
    return this.tntIgniteAttempts.length;
  }

  public getTotalTntIgniteAttempts(): number {
    return this.totalTntIgniteAttempts;
  }

  public drainTntIgniteAttempts(): TntIgniteAttemptEvent[] {
    return this.tntIgniteAttempts.splice(0, this.tntIgniteAttempts.length);
  }

  public enqueueBlockDrop(gameTick: number, sourceEntityId: number, blockId: number, metadata: number, x: number, y: number, z: number, reason: 'placement_failed' | 'lifetime_expired'): void {
    if (this.count + this.blockDrops.length >= CAPACITY) {
      this.discarded += 1;
      return;
    }
    this.blockDrops.push({ eventId: this.nextEventId++, gameTick, sourceEntityId, blockId, metadata, x, y, z, reason });
  }

  public drainBlockDrops(): BlockDropEvent[] {
    return this.blockDrops.splice(0, this.blockDrops.length);
  }

  public getBlockDropCount(): number {
    return this.blockDrops.length;
  }

  public drainNoop(): number {
    const drained = this.count;
    this.head = 0;
    this.count = 0;
    return drained;
  }

  public getQueueDepth(): number {
    return this.count;
  }

  public getTotalLavaIgnitionAttempts(): number {
    return this.totalLavaIgnitionAttempts;
  }

  public getDiscardedCount(): number {
    return this.discarded;
  }

  public peekFirst(): LavaIgnitionAttemptEvent | undefined {
    if (this.count === 0 || this.types[this.head] !== WorldEventType.LavaIgnitionAttempt) return undefined;
    const base = this.head * 6;
    return {
      type: WorldEventType.LavaIgnitionAttempt,
      eventId: this.eventIds[this.head]!,
      worldTick: this.worldTicks[this.head]!,
      lavaX: this.coords[base]!,
      lavaY: this.coords[base + 1]!,
      lavaZ: this.coords[base + 2]!,
      candidateX: this.coords[base + 3]!,
      candidateY: this.coords[base + 4]!,
      candidateZ: this.coords[base + 5]!,
      lavaBlockId: this.blockIds[this.head]!,
      lavaMetadata: this.metadata[this.head]!,
      randomValue: this.randomValues[this.head]!,
    };
  }
}
