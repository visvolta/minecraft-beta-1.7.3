/**
 * Shared harness for the grouped validation suites.
 *
 * Replaces the previous per-feature harness so all seven validators report in
 * one format. Guarantees that a hang or unresolved promise FAILS the process
 * instead of silently exiting 0:
 *   - `withTimeout` rejects if an individual awaited operation does not settle.
 *   - `runSuite` wraps each check in `withTimeout` (per-check) and an overall
 *     `startHangWatchdog` (suite backstop) that forces a non-zero exit.
 *
 * Checks are grouped into named sections so output stays readable as suites
 * grow, and every failure prints the section, the check name and a stack.
 */

export function fail(message: string): never {
  console.error(`Failed: ${message}`);
  process.exit(1);
}

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}

export function assertClose(actual: number, expected: number, epsilon: number, message: string): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message} (expected ${expected} ±${epsilon}, got ${actual})`);
  }
}

export function assertThrows(run: () => unknown, message: string): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(message);
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

export interface Check {
  name: string;
  run: () => void | Promise<void>;
}

export interface Section {
  name: string;
  checks: Check[];
}

export interface SuiteOptions {
  /** Suite-level hang backstop; default 120s. */
  hangMs?: number;
  /** Per-check timeout; default 30s. */
  perCheckMs?: number;
}

/**
 * Runs every section in order, printing each sub-check name. Exits 1 on the
 * first failure or hang; returns normally on success so stdout fully flushes.
 */
export async function runSuite(suiteName: string, sections: Section[], options: SuiteOptions = {}): Promise<void> {
  const hangMs = options.hangMs ?? 120_000;
  const perCheckMs = options.perCheckMs ?? 30_000;
  const clearWatchdog = startHangWatchdog(hangMs, suiteName);
  const total = sections.reduce((sum, section) => sum + section.checks.length, 0);
  const started = Date.now();

  console.log(`\n${suiteName} — ${total} check(s) in ${sections.length} section(s)\n`);

  let passed = 0;
  for (const section of sections) {
    console.log(`  ${section.name}`);
    for (const check of section.checks) {
      const checkStarted = Date.now();
      try {
        await withTimeout(Promise.resolve().then(check.run), perCheckMs, check.name);
      } catch (error) {
        clearWatchdog();
        console.error(`    [FAIL] ${check.name}`);
        console.error('');
        console.error(`    Suite:   ${suiteName}`);
        console.error(`    Section: ${section.name}`);
        console.error(`    Check:   ${check.name}`);
        console.error('');
        console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
        process.exit(1);
      }
      passed += 1;
      console.log(`    [ok] ${check.name} (${Date.now() - checkStarted}ms)`);
    }
    console.log('');
  }

  clearWatchdog();
  console.log(`${suiteName}: all ${passed} check(s) passed in ${Date.now() - started}ms.\n`);
}
