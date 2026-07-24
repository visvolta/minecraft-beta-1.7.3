/**
 * HANG PROBE — NOT a passing validation.
 *
 * Deliberately awaits a never-resolving promise to prove the hang watchdog fails
 * the process with a non-zero exit code (the behaviour the legacy
 * validate:persistence-integration lacked — it silently exited 0 while suspended).
 *
 * Expected when run: prints the "waiting" line, then the watchdog fires after
 * ~1000ms and the process exits with code 1. The "UNREACHABLE" line must never
 * print. CI/runners should assert a NON-ZERO exit code for this script.
 */
import { startHangWatchdog } from './persistence2Harness.ts';

const WATCHDOG_MS = 1000;
const clearWatchdog = startHangWatchdog(WATCHDOG_MS, 'hang-probe');
console.log(`hang-probe: awaiting a never-resolving promise; watchdog set to ${WATCHDOG_MS}ms (expect exit 1)`);

// eslint-disable-next-line no-constant-condition
await new Promise<void>(() => {
  /* intentionally never resolves */
});

// Never reached if the watchdog works.
clearWatchdog();
console.log('hang-probe: UNREACHABLE — the watchdog did NOT fire (this would be a bug)');
