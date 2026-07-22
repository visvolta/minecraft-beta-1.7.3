export interface ScheduledTickHead {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly dueTick: number;
  readonly sequence: number;
}

function before(a: ScheduledTickHead, b: ScheduledTickHead): boolean {
  return a.dueTick < b.dueTick || (a.dueTick === b.dueTick && a.sequence < b.sequence);
}

/** Binary min-heap of loaded chunk queue heads; stale snapshots are discarded lazily. */
export class ScheduledTickHeadHeap {
  private readonly heap: ScheduledTickHead[] = [];

  public get size(): number {
    return this.heap.length;
  }

  public peek(): ScheduledTickHead | undefined {
    return this.heap[0];
  }

  public push(entry: ScheduledTickHead): void {
    let index = this.heap.length;
    this.heap.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!before(entry, this.heap[parent]!)) break;
      this.heap[index] = this.heap[parent]!;
      index = parent;
    }
    this.heap[index] = entry;
  }

  public pop(): ScheduledTickHead | undefined {
    if (this.heap.length === 0) return undefined;
    const first = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.heap.length) break;
      const right = left + 1;
      let child = left;
      if (right < this.heap.length && before(this.heap[right]!, this.heap[left]!)) child = right;
      if (!before(this.heap[child]!, last)) break;
      this.heap[index] = this.heap[child]!;
      index = child;
    }
    this.heap[index] = last;
    return first;
  }

  public clear(): void {
    this.heap.length = 0;
  }
}
