/**
 * Shared harness for persistence2 validation scripts.
 *
 * Guarantees that a hang or unresolved promise FAILS the process instead of
 * silently exiting 0 (the trap that made the legacy validate:persistence-integration
 * false-pass):
 *   - `withTimeout` rejects if an individual awaited operation does not settle.
 *   - `runSuite` wraps each test in `withTimeout` (per-test) and an overall
 *     `startHangWatchdog` (suite backstop) that forces a non-zero exit.
 *   - On success the suite returns normally and the script exits naturally (full
 *     stdout flush); on any failure the process exits 1.
 */

export function fail(message: string): never {
  console.error(`Failed: ${message}`);
  process.exit(1);
}

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    fail(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

/** Rejects with a timeout error if `promise` does not settle within `ms`. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Forces a non-zero exit if not cleared within `ms`. Returns a clear function.
 * Used as the suite-level backstop against hangs.
 */
export function startHangWatchdog(ms: number, label: string): () => void {
  const timer = setTimeout(() => {
    console.error(`HANG WATCHDOG: ${label} did not complete within ${ms}ms — forcing failure (exit 1)`);
    process.exit(1);
  }, ms);
  return () => clearTimeout(timer);
}

export interface TestCase {
  name: string;
  run: () => Promise<void>;
}

export interface SuiteOptions {
  /** Suite-level hang backstop; default 60s. */
  hangMs?: number;
  /** Per-test timeout; default 15s. */
  perTestMs?: number;
}

/** Runs tests in order; exits 1 on the first failure or hang; returns on success. */
export async function runSuite(suiteName: string, tests: TestCase[], options: SuiteOptions = {}): Promise<void> {
  const hangMs = options.hangMs ?? 60000;
  const perTestMs = options.perTestMs ?? 15000;
  const clearWatchdog = startHangWatchdog(hangMs, suiteName);
  console.log(`${suiteName}: running ${tests.length} test(s)`);
  for (const test of tests) {
    try {
      await withTimeout(test.run(), perTestMs, test.name);
      console.log(`  [ok] ${test.name}`);
    } catch (error) {
      clearWatchdog();
      console.error(`  [FAIL] ${test.name}`);
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exit(1);
    }
  }
  clearWatchdog();
  console.log(`${suiteName}: all ${tests.length} test(s) passed.`);
}
