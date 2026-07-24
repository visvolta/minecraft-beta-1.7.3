/**
 * Strictly serialized executor with priority and sequence-based write barriers.
 *
 * Used as the single WRITE lane: autosave, unload persistence, forced saves,
 * metadata writes and player-data writes all enter here, so writes to the same
 * chunk can never overlap and there is exactly one owner per write.
 *
 * Acceptance sequence numbers:
 *   - Every accepted operation is assigned a monotonically increasing sequence
 *     number at acceptance (enqueue) time.
 *   - `flushBarrier()` captures the current sequence and waits for EVERY
 *     accepted operation through that sequence to settle, regardless of the
 *     order in which priority caused them to run. Work accepted after the
 *     barrier is not covered.
 *   - If any covered operation rejected, the barrier rejects and exposes the
 *     failure. A barrier NEVER reports a successful flush merely because all
 *     operations settled.
 *
 * Priority:
 *   - Higher `priority` pending operations run before lower ones, but a running
 *     operation is NEVER interrupted (no pre-emption).
 *
 * Failure isolation: a rejected operation propagates to its own caller and does
 * not block subsequent operations or poison the executor.
 */

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Settlement = { ok: true } | { ok: false; error: unknown };

interface QueueEntry {
  seq: number;
  priority: number;
  run: () => Promise<void>;
}

export class PrioritySerialExecutor {
  private nextSeq = 0;
  private readonly queue: QueueEntry[] = [];
  /** seq -> completion record (resolves to a Settlement; never rejects). */
  private readonly completions = new Map<number, Promise<Settlement>>();
  private running = false;
  private closed = false;

  public get activeCount(): number {
    return this.running ? 1 : 0;
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public get acceptedCount(): number {
    return this.nextSeq;
  }

  public get isClosed(): boolean {
    return this.closed;
  }

  public enqueue<T>(task: () => Promise<T>, priority: number): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error('PrioritySerialExecutor is closed; new writes are rejected'));
    }
    const seq = this.nextSeq++;
    const caller = createDeferred<T>();
    let settleCompletion!: (settlement: Settlement) => void;
    const completion = new Promise<Settlement>((resolve) => {
      settleCompletion = resolve;
    });
    this.completions.set(seq, completion);

    const run = async (): Promise<void> => {
      try {
        const value = await task();
        settleCompletion({ ok: true });
        // Successful completions can be dropped immediately: a later barrier
        // does not need them (they succeeded), and a concurrent barrier that
        // already collected this completion holds its own reference.
        this.completions.delete(seq);
        caller.resolve(value);
      } catch (error) {
        // Failed completions are retained until a barrier covers them, so the
        // barrier can surface the failure instead of reporting a false success.
        settleCompletion({ ok: false, error });
        caller.reject(error);
      }
    };

    this.queue.push({ seq, priority, run });
    this.pump();
    return caller.promise;
  }

  /**
   * Resolves once every operation accepted up to (and including) the current
   * acceptance sequence has settled. Rejects if any covered operation rejected.
   */
  public async flushBarrier(): Promise<void> {
    const barrierSeq = this.nextSeq - 1;
    const covered: Promise<Settlement>[] = [];
    for (const [seq, completion] of this.completions) {
      if (seq <= barrierSeq) covered.push(completion);
    }
    const results = await Promise.all(covered);
    // Covered completions have now settled; drop them (clears retained failures).
    for (const seq of [...this.completions.keys()]) {
      if (seq <= barrierSeq) this.completions.delete(seq);
    }
    for (const result of results) {
      if (!result.ok) throw result.error;
    }
  }

  /**
   * Rejects new enqueues and resolves once every accepted operation has settled
   * (failures are not rethrown here — they already propagated to their owners).
   */
  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const pending = [...this.completions.values()];
    await Promise.all(pending);
    this.completions.clear();
    this.queue.length = 0;
  }

  private pickNext(): QueueEntry | undefined {
    if (this.queue.length === 0) return undefined;
    let bestIndex = 0;
    let best = this.queue[0]!;
    for (let i = 1; i < this.queue.length; i++) {
      const entry = this.queue[i]!;
      if (entry.priority > best.priority || (entry.priority === best.priority && entry.seq < best.seq)) {
        best = entry;
        bestIndex = i;
      }
    }
    this.queue.splice(bestIndex, 1);
    return best;
  }

  private pump(): void {
    if (this.running) return;
    const next = this.pickNext();
    if (next === undefined) return;
    this.running = true;
    const finish = (): void => {
      this.running = false;
      this.pump();
    };
    // `run` never rejects (it captures failure into the completion record), but
    // handle both outcomes so the pump always advances and no rejection leaks.
    void next.run().then(finish, finish);
  }
}
