/**
 * Bounded-concurrency executor used as the READ lane (chunk + metadata reads).
 *
 * Reads may proceed concurrently (up to a fixed limit) and alongside ordinary
 * background writes — they run on this executor, separate from the serialized
 * write lane. A read never observes a partially written chunk because each
 * chunk write is atomic at the backend level.
 *
 * Failure isolation: a rejected read propagates to its caller and does not block
 * other reads. `close()` rejects new reads and resolves once every accepted read
 * has settled (used during world shutdown before closing the backend).
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

export class BoundedExecutor {
  private readonly limit: number;
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly inFlight = new Set<Promise<Settlement>>();
  private closed = false;

  public constructor(limit: number) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  public get activeCount(): number {
    return this.active;
  }

  public get pendingCount(): number {
    return this.waiting.length;
  }

  public get isClosed(): boolean {
    return this.closed;
  }

  public enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error('BoundedExecutor is closed; new reads are rejected'));
    }
    const caller = createDeferred<T>();
    let settle!: (settlement: Settlement) => void;
    const completion = new Promise<Settlement>((resolve) => {
      settle = resolve;
    });
    this.inFlight.add(completion);
    void completion.then(() => {
      this.inFlight.delete(completion);
    });

    const start = (): void => {
      this.active++;
      task().then(
        (value) => {
          settle({ ok: true });
          caller.resolve(value);
          this.onSettled();
        },
        (error) => {
          settle({ ok: false, error });
          caller.reject(error);
          this.onSettled();
        },
      );
    };

    if (this.active < this.limit) start();
    else this.waiting.push(start);
    return caller.promise;
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const pending = [...this.inFlight];
    await Promise.all(pending);
    this.waiting.length = 0;
  }

  private onSettled(): void {
    this.active--;
    const next = this.waiting.shift();
    if (next !== undefined) next();
  }
}
