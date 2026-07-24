export interface SaveTracePayload {
  readonly [key: string]: unknown;
}

export interface SaveTraceEntry {
  readonly kind: 'span' | 'event' | 'failure';
  readonly name: string;
  readonly startWallMs: number;
  readonly endWallMs: number;
  readonly startPerfMs: number;
  readonly endPerfMs: number;
  readonly elapsedMs: number;
  readonly data: SaveTracePayload | undefined;
  readonly error: string | undefined;
}

export interface SavePipelineTraceSnapshot {
  readonly id: number;
  readonly purpose: string;
  readonly startedWallMs: number;
  readonly endedWallMs: number | null;
  readonly startedPerfMs: number;
  readonly endedPerfMs: number | null;
  readonly elapsedMs: number | null;
  readonly metadata: SaveTracePayload | undefined;
  readonly entries: readonly SaveTraceEntry[];
  readonly lastError: string | undefined;
}

interface MutableSaveTraceEntry {
  kind: 'span' | 'event' | 'failure';
  name: string;
  startWallMs: number;
  endWallMs: number;
  startPerfMs: number;
  endPerfMs: number;
  elapsedMs: number;
  data: SaveTracePayload | undefined;
  error: string | undefined;
}

function clonePayload(payload: SaveTracePayload | undefined): SaveTracePayload | undefined {
  return payload === undefined ? undefined : { ...payload };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let nextTraceId = 1;
const activeTraceStack: SavePipelineTrace[] = [];
const traceHistory: SavePipelineTrace[] = [];
const finishedTraces = new WeakSet<SavePipelineTrace>();
const TRACE_HISTORY_LIMIT = 20;

export class SavePipelineTrace {
  public readonly id = nextTraceId++;
  public readonly startedWallMs = Date.now();
  public readonly startedPerfMs = performance.now();
  private endedWallMs: number | null = null;
  private endedPerfMs: number | null = null;
  private readonly entries: MutableSaveTraceEntry[] = [];
  private lastError: string | undefined;

  public constructor(
    public readonly purpose: string,
    private readonly metadata: SaveTracePayload | undefined,
  ) {}

  public beginSpan(name: string, data?: SaveTracePayload): SaveTraceSpan {
    const startWallMs = Date.now();
    const startPerfMs = performance.now();
    const entry: MutableSaveTraceEntry = {
      kind: 'span',
      name,
      startWallMs,
      endWallMs: startWallMs,
      startPerfMs,
      endPerfMs: startPerfMs,
      elapsedMs: 0,
      data: clonePayload(data),
      error: undefined,
    };
    this.entries.push(entry);
    return new SaveTraceSpan(this, entry);
  }

  public mark(name: string, data?: SaveTracePayload): void {
    const wallMs = Date.now();
    const perfMs = performance.now();
    this.entries.push({
      kind: 'event',
      name,
      startWallMs: wallMs,
      endWallMs: wallMs,
      startPerfMs: perfMs,
      endPerfMs: perfMs,
      elapsedMs: 0,
      data: clonePayload(data),
      error: undefined,
    });
  }

  public fail(name: string, error: unknown, data?: SaveTracePayload): void {
    const wallMs = Date.now();
    const perfMs = performance.now();
    this.lastError = errorMessage(error);
    this.entries.push({
      kind: 'failure',
      name,
      startWallMs: wallMs,
      endWallMs: wallMs,
      startPerfMs: perfMs,
      endPerfMs: perfMs,
      elapsedMs: 0,
      data: clonePayload(data),
      error: this.lastError,
    });
  }

  public measureSync<T>(name: string, data: SaveTracePayload | undefined, work: () => T): T {
    const span = this.beginSpan(name, data);
    try {
      const value = work();
      span.end();
      return value;
    } catch (error) {
      span.fail(error);
      throw error;
    }
  }

  public async measureAsync<T>(name: string, data: SaveTracePayload | undefined, work: () => Promise<T>): Promise<T> {
    const span = this.beginSpan(name, data);
    try {
      const value = await work();
      span.end();
      return value;
    } catch (error) {
      span.fail(error);
      throw error;
    }
  }

  public finish(data?: SaveTracePayload): void {
    if (this.endedWallMs !== null) return;
    this.endedWallMs = Date.now();
    this.endedPerfMs = performance.now();
    if (data !== undefined) this.mark('trace.finish', data);
  }

  public snapshot(): SavePipelineTraceSnapshot {
    const elapsedMs = this.endedPerfMs === null ? null : this.endedPerfMs - this.startedPerfMs;
    return {
      id: this.id,
      purpose: this.purpose,
      startedWallMs: this.startedWallMs,
      endedWallMs: this.endedWallMs,
      startedPerfMs: this.startedPerfMs,
      endedPerfMs: this.endedPerfMs,
      elapsedMs,
      metadata: clonePayload(this.metadata),
      entries: this.entries.map((entry) => ({ ...entry, data: clonePayload(entry.data) })),
      lastError: this.lastError,
    };
  }
}

export class SaveTraceSpan {
  private completed = false;

  public constructor(
    private readonly trace: SavePipelineTrace,
    private readonly entry: MutableSaveTraceEntry,
  ) {}

  public annotate(data: SaveTracePayload): void {
    this.entry.data = {
      ...(this.entry.data ?? {}),
      ...clonePayload(data),
    };
  }

  public end(data?: SaveTracePayload): void {
    if (this.completed) return;
    this.completed = true;
    const endWallMs = Date.now();
    const endPerfMs = performance.now();
    this.entry.endWallMs = endWallMs;
    this.entry.endPerfMs = endPerfMs;
    this.entry.elapsedMs = endPerfMs - this.entry.startPerfMs;
    if (data !== undefined) this.annotate(data);
  }

  public fail(error: unknown, data?: SaveTracePayload): void {
    if (data !== undefined) this.annotate(data);
    this.trace.fail(this.entry.name, error, this.entry.data);
    this.end({ error: errorMessage(error) });
  }
}

export function beginSaveTrace(purpose: string, metadata?: SaveTracePayload): SavePipelineTrace {
  const trace = new SavePipelineTrace(purpose, metadata);
  activeTraceStack.push(trace);
  trace.mark('trace.begin', metadata);
  return trace;
}

export function endSaveTrace(trace: SavePipelineTrace, data?: SaveTracePayload): SavePipelineTraceSnapshot {
  trace.finish(data);
  const index = activeTraceStack.lastIndexOf(trace);
  if (index !== -1) activeTraceStack.splice(index, 1);
  if (!finishedTraces.has(trace)) {
    finishedTraces.add(trace);
    traceHistory.unshift(trace);
    if (traceHistory.length > TRACE_HISTORY_LIMIT) traceHistory.length = TRACE_HISTORY_LIMIT;
  }
  return trace.snapshot();
}

export function getActiveSaveTrace(): SavePipelineTrace | null {
  return activeTraceStack.length > 0 ? activeTraceStack[activeTraceStack.length - 1]! : null;
}

export function getSaveTraceHistory(): readonly SavePipelineTraceSnapshot[] {
  return traceHistory.map((trace) => trace.snapshot());
}

export function clearSaveTraceHistory(): void {
  traceHistory.length = 0;
}

export function recordSaveEvent(name: string, data?: SaveTracePayload): void {
  getActiveSaveTrace()?.mark(name, data);
}

export function recordSaveFailure(name: string, error: unknown, data?: SaveTracePayload): void {
  getActiveSaveTrace()?.fail(name, error, data);
}

export function measureSaveSync<T>(name: string, data: SaveTracePayload | undefined, work: () => T): T {
  const trace = getActiveSaveTrace();
  return trace === null ? work() : trace.measureSync(name, data, work);
}

export function measureSaveAsync<T>(name: string, data: SaveTracePayload | undefined, work: () => Promise<T>): Promise<T> {
  const trace = getActiveSaveTrace();
  return trace === null ? work() : trace.measureAsync(name, data, work);
}
