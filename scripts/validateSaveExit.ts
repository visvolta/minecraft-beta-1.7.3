import { SaveExitController, type SaveExitState } from '../src/app/SaveExitController.ts';
import type { Engine } from '../src/engine/Engine.ts';
import type { Chunk } from '../src/world/Chunk.ts';
import type { WorldMetadata } from '../src/world/WorldMetadata.ts';
import { createDefaultMetadata } from '../src/world/WorldMetadata.ts';
import { WRITE_PRIORITY_FORCED } from '../src/persistence2/WorldPersistenceService.ts';
import { assert, assertEqual, runSuite, type TestCase, withTimeout } from './persistence2Harness.ts';

interface FakePersistence {
  saveChunk(chunk: Chunk, priority?: number): Promise<void>;
  saveMetadata(metadata: WorldMetadata, priority?: number): Promise<void>;
  flushBarrier(): Promise<void>;
  close(): Promise<void>;
}

interface FakeEngine {
  setSaveExitActive(active: boolean): void;
  freezeForSave(): void;
  settleAcceptedReads(): Promise<void>;
  settleAcceptedUnloads(): Promise<void>;
  captureMetadataSnapshot(): WorldMetadata;
  dirtyChunkSnapshot(): Chunk[];
  getPersistence(): FakePersistence;
  stop(): void;
  resumeFromFailedSave(): void;
  getPersistenceDiagnostics(): ReturnType<Engine['getPersistenceDiagnostics']>;
}

function diagnostics(): ReturnType<Engine['getPersistenceDiagnostics']> {
  return {
    service: {
      worldId: 'validation',
      opened: true,
      closing: false,
      closed: false,
      writeLane: { accepted: 0, completed: 0, active: 0, pending: 0, queuedByPriority: {}, closed: false },
      readLane: { active: 0, pending: 0, closed: false },
      inFlightChunks: 0,
      pendingBackgroundSaves: 0,
      pendingUnloads: 0,
      metadataWriteInFlight: false,
      lastError: null,
    },
    dirtyChunks: 0,
    pendingReads: 0,
    pendingUnloads: 0,
    quiescing: false,
    saveExitActive: false,
    autosavePaused: false,
    autosaveStats: {
      lastPumpMs: 0,
      lastSelected: 0,
      lastSkippedInFlight: 0,
      lastDirtyCount: 0,
      lastSuccessMs: 0,
      lastFailureMs: 0,
      lastFailure: null,
    },
  };
}

function makeEngine(order: string[], closeError?: Error): FakeEngine {
  const chunk = { marker: 'dirty' } as unknown as Chunk;
  const metadata = { ...createDefaultMetadata(), worldId: 'validation' };
  const persistence: FakePersistence = {
    saveChunk: async (_chunk, priority = 0) => {
      order.push(`saveChunk:${priority}`);
      assertEqual(priority, WRITE_PRIORITY_FORCED, 'dirty chunks are saved at forced priority');
    },
    saveMetadata: async (_metadata, priority = 0) => {
      order.push(`saveMetadata:${priority}`);
      assertEqual(priority, WRITE_PRIORITY_FORCED, 'metadata is saved at forced priority');
    },
    flushBarrier: async () => { order.push('flushBarrier'); },
    close: async () => {
      order.push('close');
      if (closeError !== undefined) throw closeError;
    },
  };
  return {
    setSaveExitActive: (active) => { order.push(`saveExitActive:${active}`); },
    freezeForSave: () => { order.push('freeze'); },
    settleAcceptedReads: async () => { order.push('settleReads'); },
    settleAcceptedUnloads: async () => { order.push('settleUnloads'); },
    captureMetadataSnapshot: () => { order.push('captureMetadata'); return metadata; },
    dirtyChunkSnapshot: () => { order.push('dirtySnapshot'); return [chunk]; },
    getPersistence: () => persistence,
    stop: () => { order.push('stop'); },
    resumeFromFailedSave: () => { order.push('resumeFromFailedSave'); },
    getPersistenceDiagnostics: diagnostics,
  };
}

const tests: TestCase[] = [
  {
    name: 'successful save-and-quit preserves shutdown ordering and completes only after close',
    run: async () => {
      const order: string[] = [];
      let finalState: SaveExitState = 'idle';
      let completed = false;
      const controller = new SaveExitController(makeEngine(order) as unknown as Engine, {
        onStateChange: (state) => { finalState = state; },
        onCompleted: () => { order.push('completedCallback'); completed = true; },
      }, { overall: 5000 });
      controller.start();
      await withTimeout(new Promise<void>((resolve) => {
        const poll = (): void => { if (completed) resolve(); else setTimeout(poll, 0); };
        poll();
      }), 5000, 'save-exit completion');
      assertEqual(finalState, 'completed', 'controller reaches completed state');
      assertEqual(order.join(' > '), [
        'saveExitActive:true',
        'freeze',
        'settleReads',
        'settleUnloads',
        'captureMetadata',
        'dirtySnapshot',
        `saveChunk:${WRITE_PRIORITY_FORCED}`,
        'flushBarrier',
        `saveMetadata:${WRITE_PRIORITY_FORCED}`,
        'flushBarrier',
        'close',
        'stop',
        'saveExitActive:false',
        'completedCallback',
      ].join(' > '), 'save-exit ordering');
    },
  },
  {
    name: 'close failure leaves controller failed and return-to-world resumes gameplay',
    run: async () => {
      const order: string[] = [];
      let lastState: SaveExitState = 'idle';
      const controller = new SaveExitController(makeEngine(order, new Error('close failed')) as unknown as Engine, {
        onStateChange: (state) => { lastState = state; },
        onCompleted: () => { order.push('unexpectedCompleted'); },
      }, { overall: 5000 });
      controller.start();
      await withTimeout(new Promise<void>((resolve) => {
        const poll = (): void => { if (lastState === 'failed') resolve(); else setTimeout(poll, 0); };
        poll();
      }), 5000, 'save-exit failure');
      assertEqual(lastState, 'failed', 'controller reports failed state');
      assert(!order.includes('unexpectedCompleted'), 'completion callback is not called after failure');
      controller.returnToWorld();
      assert(order.includes('resumeFromFailedSave'), 'failed save can resume gameplay');
      assertEqual(controller.currentState, 'idle', 'return-to-world resets controller to idle');
    },
  },
];

await runSuite('validateSaveExit', tests);
