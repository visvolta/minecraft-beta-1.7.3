/**
 * Stage 1 executor validation:
 *   - PrioritySerialExecutor: strict serialization (writes never overlap),
 *     priority without interrupting an active write, sequence-number write
 *     barriers (cover every accepted op through the captured sequence
 *     regardless of priority order; work accepted after is not covered),
 *     barriers reject on any covered failure (never a false success),
 *     failure isolation, and close semantics.
 *   - BoundedExecutor: concurrency cap respected, failure isolation, close.
 */
import { assert, assertEqual, runSuite, type TestCase } from './persistence2Harness.ts';
import { PrioritySerialExecutor } from '../src/persistence2/exec/PrioritySerialExecutor.ts';
import { BoundedExecutor } from '../src/persistence2/exec/BoundedExecutor.ts';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const BACKGROUND = 0;
const FORCED = 1;

const tests: TestCase[] = [
  {
    name: 'write executor serializes tasks (writes never overlap)',
    run: async () => {
      const exec = new PrioritySerialExecutor();
      let active = 0;
      let maxActive = 0;
      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 8; i++) {
        tasks.push(
          exec.enqueue(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await sleep(5);
            active--;
          }, BACKGROUND),
        );
      }
      await Promise.all(tasks);
      assertEqual(maxActive, 1, 'at most one write runs at a time');
      assertEqual(exec.acceptedCount, 8, 'all 8 writes accepted');
      await exec.close();
    },
  },
  {
    name: 'forced priority runs before queued background without interrupting the active write',
    run: async () => {
      const exec = new PrioritySerialExecutor();
      const order: string[] = [];
      // Blocker holds the lane so the rest queue up behind it.
      const blocker = exec.enqueue(async () => {
        order.push('blocker-start');
        await sleep(40);
        order.push('blocker-end');
      }, BACKGROUND);
      await sleep(10); // ensure the blocker is the active write
      const b1 = exec.enqueue(async () => { order.push('B1'); }, BACKGROUND);
      const b2 = exec.enqueue(async () => { order.push('B2'); }, BACKGROUND);
      const forced = exec.enqueue(async () => { order.push('F'); }, FORCED);
      await Promise.all([blocker, b1, b2, forced]);
      // Forced (F) must run before the queued background (B1,B2)...
      assert(order.indexOf('F') < order.indexOf('B1'), 'forced runs before queued background B1');
      assert(order.indexOf('F') < order.indexOf('B2'), 'forced runs before queued background B2');
      // ...but only AFTER the active blocker completes (no interruption).
      assert(order.indexOf('blocker-end') < order.indexOf('F'), 'active write completes before forced starts (no pre-emption)');
      await exec.close();
    },
  },
  {
    name: 'flush barrier waits for every accepted op through the captured sequence (regardless of priority order)',
    run: async () => {
      const exec = new PrioritySerialExecutor();
      const completed: number[] = [];
      // Three slow background writes and one fast forced write accepted afterwards.
      const writes: Promise<void>[] = [];
      for (let i = 0; i < 3; i++) {
        const id = i;
        writes.push(exec.enqueue(async () => { await sleep(20); completed.push(id); }, BACKGROUND));
      }
      writes.push(exec.enqueue(async () => { await sleep(1); completed.push(99); }, FORCED)); // forced runs first
      const barrier = exec.flushBarrier();
      await barrier; // must wait for ALL FOUR even though the forced one ran first
      assertEqual(completed.length, 4, 'barrier waited for all four accepted writes');
      await Promise.all(writes);
      await exec.close();
    },
  },
  {
    name: 'work accepted after the barrier is not covered by it',
    run: async () => {
      const exec = new PrioritySerialExecutor();
      let earlyDone = false;
      let lateDone = false;
      const early = exec.enqueue(async () => { await sleep(5); earlyDone = true; }, BACKGROUND); // seq 0
      const barrier = exec.flushBarrier(); // captures sequence covering only the early write
      const late = exec.enqueue(async () => { await sleep(60); lateDone = true; }, BACKGROUND); // accepted AFTER the barrier
      await barrier;
      assert(earlyDone, 'barrier waited for the write accepted before it');
      assert(!lateDone, 'barrier did NOT wait for the write accepted after it');
      await late;
      assert(lateDone, 'the late write still completes on its own');
      await early;
      await exec.close();
    },
  },
  {
    name: 'barrier rejects when a covered write rejects (never a false success)',
    run: async () => {
      const exec = new PrioritySerialExecutor();
      const boom = new Error('write failed');
      const failing = exec.enqueue(async () => { throw boom; }, BACKGROUND);
      failing.catch(() => undefined); // owner handles its own rejection
      let barrierRejected = false;
      try {
        await exec.flushBarrier();
      } catch (error) {
        barrierRejected = true;
        assertEqual(error, boom, 'barrier exposes the covered failure');
      }
      assert(barrierRejected, 'barrier rejected because a covered write rejected');
      await exec.close();
    },
  },
  {
    name: 'a failed write does not poison the executor (failure isolation)',
    run: async () => {
      const exec = new PrioritySerialExecutor();
      const failing = exec.enqueue(async () => { throw new Error('first fails'); }, BACKGROUND);
      let rejected = false;
      await failing.catch(() => { rejected = true; });
      assert(rejected, 'the failing write rejected to its owner');
      // Subsequent writes still run.
      const value = await exec.enqueue(async () => 42, BACKGROUND);
      assertEqual(value, 42, 'subsequent write runs after a failure');
      await exec.close();
    },
  },
  {
    name: 'close rejects new writes and waits for accepted writes to settle',
    run: async () => {
      const exec = new PrioritySerialExecutor();
      let done = false;
      const pending = exec.enqueue(async () => { await sleep(20); done = true; }, BACKGROUND);
      const closePromise = exec.close();
      // New writes are rejected once closing begins.
      let newRejected = false;
      await exec.enqueue(async () => undefined, BACKGROUND).catch(() => { newRejected = true; });
      assert(newRejected, 'enqueue after close rejects');
      await closePromise;
      assert(done, 'close waited for the accepted write to settle');
      await pending;
    },
  },
  {
    name: 'bounded read executor respects its concurrency limit and runs in parallel',
    run: async () => {
      const limit = 3;
      const exec = new BoundedExecutor(limit);
      let active = 0;
      let maxActive = 0;
      const tasks: Promise<void>[] = [];
      for (let i = 0; i < 12; i++) {
        tasks.push(
          exec.enqueue(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await sleep(10);
            active--;
          }),
        );
      }
      await Promise.all(tasks);
      assert(maxActive > 1, `reads run in parallel (maxActive=${maxActive})`);
      assert(maxActive <= limit, `reads respect the limit (maxActive=${maxActive} <= ${limit})`);
      await exec.close();
    },
  },
  {
    name: 'bounded read executor isolates failures and close waits for accepted reads',
    run: async () => {
      const exec = new BoundedExecutor(2);
      const failing = exec.enqueue(async () => { throw new Error('read failed'); });
      let rejected = false;
      await failing.catch(() => { rejected = true; });
      assert(rejected, 'failing read rejected to its owner');
      const value = await exec.enqueue(async () => 'ok');
      assertEqual(value, 'ok', 'other reads still run after a failure');
      let lateDone = false;
      const late = exec.enqueue(async () => { await sleep(15); lateDone = true; });
      const closePromise = exec.close();
      let newRejected = false;
      await exec.enqueue(async () => undefined).catch(() => { newRejected = true; });
      assert(newRejected, 'enqueue after close rejects');
      await closePromise;
      assert(lateDone, 'close waited for the accepted read');
      await late;
    },
  },
];

await runSuite('validatePersistence2Executors', tests);
