import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assert, runSuite, type TestCase, withTimeout } from './persistence2Harness.ts';

const tests: TestCase[] = [
  {
    name: 'hang probe fails non-zero when the watchdog fires',
    run: async () => {
      const probePath = fileURLToPath(new URL('./persistence2HangProbe.js', import.meta.url));
      const result = await withTimeout(new Promise<{ code: number | null; stderr: string; stdout: string }>((resolve, reject) => {
        const child = spawn(process.execPath, [probePath], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => { stdout += chunk; });
        child.stderr.on('data', (chunk: string) => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
      }), 4000, 'hang probe child process');
      assert(result.code !== 0, `hang probe should exit non-zero, got ${String(result.code)}`);
      assert(result.stdout.includes('expect exit 1'), 'hang probe announces expected failure');
      assert(result.stderr.includes('HANG WATCHDOG'), 'hang watchdog fired in child process');
      assert(!result.stdout.includes('UNREACHABLE'), 'hang probe unreachable line was not printed');
    },
  },
];

await runSuite('validatePersistence2HangProbe', tests, { hangMs: 8000, perTestMs: 5000 });
