export type LoadPerformanceKind = 'create' | 'load';
export type LoadPerformanceStatus = 'completed' | 'failed' | 'cancelled';

export interface LoadPerformanceMark {
  readonly label: string;
  readonly atMs: number;
  readonly elapsedMs: number;
}

export interface LoadGenerationRecord {
  readonly source: string;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly countForChunk: number;
  readonly elapsedMs: number;
}

export interface LoadPerformanceSummary {
  readonly token: number;
  readonly kind: LoadPerformanceKind;
  readonly label: string;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly durationMs: number;
  readonly status: LoadPerformanceStatus;
  readonly marks: readonly LoadPerformanceMark[];
  readonly generationRequests: readonly LoadGenerationRecord[];
  readonly generatedChunkCount: number;
  readonly uniqueGeneratedChunkCount: number;
  readonly duplicateGeneratedChunkCount: number;
  readonly duplicates: readonly { readonly chunkX: number; readonly chunkZ: number; readonly count: number }[];
}

interface ActiveLoadPerformanceSession {
  readonly token: number;
  readonly kind: LoadPerformanceKind;
  readonly label: string;
  readonly startedAtMs: number;
  readonly marks: LoadPerformanceMark[];
  readonly generationRequests: LoadGenerationRecord[];
  readonly countsByChunk: Map<string, { chunkX: number; chunkZ: number; count: number }>;
}

interface LoadMetricsWindow {
  __mcLoadMetrics?: {
    getActive(): unknown;
    getLast(): LoadPerformanceSummary | null;
    getHistory(): readonly LoadPerformanceSummary[];
    clear(): void;
  };
}

let nextToken = 1;
let active: ActiveLoadPerformanceSession | null = null;
let last: LoadPerformanceSummary | null = null;
const history: LoadPerformanceSummary[] = [];

function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

function toPublicActive(session: ActiveLoadPerformanceSession): unknown {
  return {
    token: session.token,
    kind: session.kind,
    label: session.label,
    startedAtMs: session.startedAtMs,
    elapsedMs: performance.now() - session.startedAtMs,
    marks: [...session.marks],
    generationRequests: [...session.generationRequests],
    generatedChunkCount: session.generationRequests.length,
    uniqueGeneratedChunkCount: session.countsByChunk.size,
  };
}

function installLoadMetricsDebugHooks(): void {
  if (typeof window === 'undefined') return;
  const target = window as unknown as LoadMetricsWindow;
  if (target.__mcLoadMetrics !== undefined) return;
  target.__mcLoadMetrics = {
    getActive: () => active === null ? null : toPublicActive(active),
    getLast: () => last,
    getHistory: () => [...history],
    clear: () => { history.length = 0; last = null; },
  };
}

function summarize(session: ActiveLoadPerformanceSession, status: LoadPerformanceStatus, endedAtMs: number): LoadPerformanceSummary {
  const duplicates = [...session.countsByChunk.values()]
    .filter((entry) => entry.count > 1)
    .map((entry) => ({ chunkX: entry.chunkX, chunkZ: entry.chunkZ, count: entry.count }));
  const duplicateGeneratedChunkCount = duplicates.reduce((sum, entry) => sum + entry.count - 1, 0);
  return {
    token: session.token,
    kind: session.kind,
    label: session.label,
    startedAtMs: session.startedAtMs,
    endedAtMs,
    durationMs: endedAtMs - session.startedAtMs,
    status,
    marks: [...session.marks],
    generationRequests: [...session.generationRequests],
    generatedChunkCount: session.generationRequests.length,
    uniqueGeneratedChunkCount: session.countsByChunk.size,
    duplicateGeneratedChunkCount,
    duplicates,
  };
}

export function beginLoadPerformanceSession(kind: LoadPerformanceKind, label: string): number {
  installLoadMetricsDebugHooks();
  const token = nextToken++;
  active = { token, kind, label, startedAtMs: performance.now(), marks: [], generationRequests: [], countsByChunk: new Map() };
  recordLoadPerformanceMark(token, 'begin');
  return token;
}

export function recordLoadPerformanceMark(token: number | null, label: string): void {
  if (token === null || active === null || active.token !== token) return;
  const atMs = performance.now();
  active.marks.push({ label, atMs, elapsedMs: atMs - active.startedAtMs });
}

export function recordLoadGenerationRequest(token: number | null, source: string, chunkX: number, chunkZ: number): void {
  if (token === null || active === null || active.token !== token) return;
  const key = chunkKey(chunkX, chunkZ);
  const existing = active.countsByChunk.get(key);
  const countForChunk = (existing?.count ?? 0) + 1;
  active.countsByChunk.set(key, { chunkX, chunkZ, count: countForChunk });
  active.generationRequests.push({ source, chunkX, chunkZ, countForChunk, elapsedMs: performance.now() - active.startedAtMs });
}

export function finishLoadPerformanceSession(token: number | null, status: LoadPerformanceStatus): LoadPerformanceSummary | null {
  if (token === null || active === null || active.token !== token) return null;
  const summary = summarize(active, status, performance.now());
  last = summary;
  history.push(summary);
  active = null;
  return summary;
}
