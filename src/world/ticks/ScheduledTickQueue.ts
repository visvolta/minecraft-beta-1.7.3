export interface ScheduledTickEntry {
  readonly localX: number;
  readonly localY: number;
  readonly localZ: number;
  readonly blockId: number;
  readonly dueTick: number;
  readonly sequence: number;
}

function entryKey(localX: number, localY: number, localZ: number, blockId: number): string {
  return `${localX},${localY},${localZ},${blockId}`;
}

/** Chunk-local storage for scheduled block ticks. Ordering semantics are
 * world-global because sequence numbers are assigned by WorldTickScheduler.
 */
export class ScheduledTickQueue {
  private readonly localXs: number[] = [];
  private readonly localYs: number[] = [];
  private readonly localZs: number[] = [];
  private readonly blockIds: number[] = [];
  private readonly dueTicks: number[] = [];
  private readonly sequences: number[] = [];
  private readonly keys = new Set<string>();
  private duplicateSuppressions = 0;
  private readonly onMutate: (() => void) | undefined;

  public constructor(onMutate?: () => void) {
    this.onMutate = onMutate;
  }

  public get size(): number {
    return this.blockIds.length;
  }

  public getDuplicateSuppressions(): number {
    return this.duplicateSuppressions;
  }

  public schedule(
    localX: number,
    localY: number,
    localZ: number,
    blockId: number,
    dueTick: number,
    sequence: number,
  ): boolean {
    const key = entryKey(localX, localY, localZ, blockId);
    if (this.keys.has(key)) {
      this.duplicateSuppressions += 1;
      return false;
    }

    let insertAt = this.dueTicks.length;
    while (insertAt > 0) {
      const prevDue = this.dueTicks[insertAt - 1]!;
      const prevSeq = this.sequences[insertAt - 1]!;
      if (prevDue < dueTick || (prevDue === dueTick && prevSeq < sequence)) {
        break;
      }
      insertAt -= 1;
    }

    this.localXs.splice(insertAt, 0, localX);
    this.localYs.splice(insertAt, 0, localY);
    this.localZs.splice(insertAt, 0, localZ);
    this.blockIds.splice(insertAt, 0, blockId);
    this.dueTicks.splice(insertAt, 0, dueTick);
    this.sequences.splice(insertAt, 0, sequence);
    this.keys.add(key);
    this.onMutate?.();
    return true;
  }

  public peek(): ScheduledTickEntry | undefined {
    if (this.blockIds.length === 0) return undefined;
    return this.entryAt(0);
  }

  public pop(): ScheduledTickEntry | undefined {
    if (this.blockIds.length === 0) return undefined;
    const entry = this.entryAt(0);
    this.keys.delete(entryKey(entry.localX, entry.localY, entry.localZ, entry.blockId));
    this.localXs.shift();
    this.localYs.shift();
    this.localZs.shift();
    this.blockIds.shift();
    this.dueTicks.shift();
    this.sequences.shift();
    this.onMutate?.();
    return entry;
  }

  public countOverdue(currentTick: number): number {
    let count = 0;
    for (const due of this.dueTicks) {
      if (due <= currentTick) count += 1;
      else break;
    }
    return count;
  }

  public oldestAge(currentTick: number): number {
    if (this.dueTicks.length === 0) return 0;
    return Math.max(0, currentTick - this.dueTicks[0]!);
  }

  public getEntries(): readonly ScheduledTickEntry[] {
    const entries: ScheduledTickEntry[] = [];
    for (let i = 0; i < this.blockIds.length; i++) {
      entries.push(this.entryAt(i));
    }
    return entries;
  }

  public drainAll(): ScheduledTickEntry[] {
    const entries: ScheduledTickEntry[] = [];
    while (this.size > 0) {
      entries.push(this.pop()!);
    }
    return entries;
  }

  public load(entries: readonly ScheduledTickEntry[]): void {
    this.clear();
    for (const entry of entries) {
      this.schedule(entry.localX, entry.localY, entry.localZ, entry.blockId, entry.dueTick, entry.sequence);
    }
  }

  public clear(): void {
    this.localXs.length = 0;
    this.localYs.length = 0;
    this.localZs.length = 0;
    this.blockIds.length = 0;
    this.dueTicks.length = 0;
    this.sequences.length = 0;
    this.keys.clear();
    this.onMutate?.();
  }

  private entryAt(index: number): ScheduledTickEntry {
    return {
      localX: this.localXs[index]!,
      localY: this.localYs[index]!,
      localZ: this.localZs[index]!,
      blockId: this.blockIds[index]!,
      dueTick: this.dueTicks[index]!,
      sequence: this.sequences[index]!,
    };
  }
}
