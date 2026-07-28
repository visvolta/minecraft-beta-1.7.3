import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { PerformanceProfiler } from '../debug/PerformanceProfiler';
import type { WorkerValidationHarness } from '../debug/WorkerValidationHarness';
import type { EntityManager } from '../entities/core/EntityManager';
import type { FallingBlockManager } from '../world/entities/FallingBlockManager';
import type { WorldEventQueue } from '../world/events/WorldEventQueue';
import { computeFluidFlowVector } from '../world/fluid/FluidFlowVector';
import { fluidSurfaceHeight, getFluidLevel, isFallingFluid } from '../world/fluid/FluidMetadata';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';
import type { ChunkManager } from '../world/ChunkManager';
import type { RedstonePowerEngine } from '../world/redstone/RedstonePowerEngine';
import type { LightEngine } from '../world/generation/lighting/LightEngine';
import type { WorldTickScheduler } from '../world/ticks/WorldTickScheduler';
import type { PrecipitationSimulator } from '../world/weather/PrecipitationSimulator';
import type { WeatherController } from '../world/weather/WeatherController';
import type { WorldPersistenceService } from '../persistence2/WorldPersistenceService';
import { getActiveSaveTrace, getSaveTraceHistory } from '../persistence2/debug/SavePipelineTrace';
import type { InteractionController } from '../player/InteractionController';

interface DebugWindow {
  __mcDebug?: Record<string, unknown> | undefined;
}

interface RawFrameCaptureSummary {
  readonly label: string;
  readonly durationMs: number;
  readonly frameCount: number;
  readonly averageFps: number;
  readonly onePercentLowFps: number;
  readonly averageFrameTimeMs: number;
  readonly p95FrameTimeMs: number;
  readonly p99FrameTimeMs: number;
  readonly worstFrameTimeMs: number;
}

export interface EngineDebugHookDependencies {
  readonly persistence: WorldPersistenceService;
  readonly validationHarness: WorkerValidationHarness;
  readonly interactionController: InteractionController;
  readonly entityManager: EntityManager;
  readonly worldTickScheduler: WorldTickScheduler;
  readonly redstonePowerEngine: RedstonePowerEngine;
  readonly lightEngine: LightEngine;
  readonly fallingBlockManager: FallingBlockManager;
  readonly worldEventQueue: WorldEventQueue;
  readonly weatherController: WeatherController;
  readonly precipitationSimulator: PrecipitationSimulator;
  readonly blockUpdateWorld: BlockUpdateWorld;
  readonly chunkManager: ChunkManager;
  readonly fluidAnimationSystem: { getDebugInfo(): unknown };
  readonly fireAnimationSystem: { getDebugInfo(): unknown };
  readonly blockRegistry: BlockRegistry;
  readonly performanceProfiler: PerformanceProfiler;
  readonly saveMetadata: (force: boolean) => Promise<void>;
  readonly countDirtyChunks: () => number;
}

/**
 * Installs the browser-only debug hook bag used by manual diagnostics and
 * validation. Extracted from Engine so debug surface construction/lifetime is
 * one independently reviewable responsibility; gameplay update order is not
 * touched.
 */
export function installEngineDebugHooks(deps: EngineDebugHookDependencies): () => void {
  const debugHooks: Record<string, unknown> = {
    saveWorldMetadata: () => deps.saveMetadata(true),
    saveWorld: () => deps.saveMetadata(true),
    getSaveMetrics: () => {
      const stats = deps.persistence.getStats();
      return {
        dirty: deps.countDirtyChunks() > 0,
        saves: stats.write.accepted,
        failures: 0,
        lastError: undefined as string | undefined,
        pendingUnloads: stats.pendingUnloads,
      };
    },
    getActiveSaveTraceId: () => getActiveSaveTrace()?.id ?? null,
    getSaveTraceHistory: () => getSaveTraceHistory(),
    inspectWorldMetadata: () => deps.persistence.getMetadata(),
    isWorldDirty: () => deps.countDirtyChunks() > 0,
    validateGenerationWorkers: () => deps.validationHarness.validateGenerationWorker(),
    validateMeshWorkers: () => deps.validationHarness.validateMeshWorker(),
    getTargetedEntity: () => deps.interactionController.getTargetedEntity(),
    getEntityMetrics: () => ({ active: deps.entityManager.activeCount, parked: deps.entityManager.parkedCount, tick: deps.entityManager.currentTick }),
    getTickMetrics: () => deps.worldTickScheduler.getMetrics(),
    getRedstoneMetrics: () => ({ ...deps.worldTickScheduler.getMetrics(), powerQueries: deps.redstonePowerEngine.getMetrics() }),
    getFallingBlockMetrics: () => ({
      simulationTick: deps.fallingBlockManager.getSimulationTick(),
      interpolationAlpha: deps.fallingBlockManager.getInterpolationAlpha(),
      active: deps.fallingBlockManager.getCount(),
      persisted: deps.fallingBlockManager.getPersistedCount(),
      meshCount: deps.fallingBlockManager.getMeshCount(),
      entities: deps.fallingBlockManager.getDebugEntities(),
      pendingDrops: deps.worldEventQueue.getBlockDropCount(),
    }),
    getFluidMetrics: () => ({
      ...deps.fluidAnimationSystem.getDebugInfo() as Record<string, unknown>,
      lavaIgnitionAttempts: deps.worldEventQueue.getTotalLavaIgnitionAttempts(),
      worldEventQueueDepth: deps.worldEventQueue.getQueueDepth(),
    }),
    getFireMetrics: () => ({
      ...deps.fireAnimationSystem.getDebugInfo() as Record<string, unknown>,
      tntIgniteAttempts: deps.worldEventQueue.getTotalTntIgniteAttempts(),
      pendingTntIgnitions: deps.worldEventQueue.getTntIgniteAttemptCount(),
    }),
    getWeatherMetrics: () => ({
      ...deps.precipitationSimulator.getMetrics(),
      activeSnowfall: deps.weatherController.getState().raining,
      weatherMode: deps.weatherController.getState().getEffectiveMode(deps.weatherController.getState().partialTick),
    }),
    getLeafDecayMetrics: () => ({
      pendingItemDrops: deps.worldEventQueue.getItemDropCount(),
      totalItemDrops: deps.worldEventQueue.getTotalItemDrops(),
      discardedItemDrops: deps.worldEventQueue.getDiscardedItemDropCount(),
      queueDepth: deps.worldEventQueue.getQueueDepth(),
    }),
    drainLeafDecayDrops: () => deps.worldEventQueue.drainItemDrops(),
    resetLeafDecayMetrics: () => {},
    inspectLeafDecayArea: (x: number, y: number, z: number, radius = 4) => inspectLeafDecayArea(deps, x, y, z, radius),
    inspectFluid: (x: number, y: number, z: number) => inspectFluid(deps, x, y, z),
    isProfilerEnabled: () => deps.performanceProfiler.isEnabled(),
    setProfilerEnabled: (enabled: boolean) => {
      try { window.localStorage.setItem('minecraft.profiler.enabled', enabled ? 'true' : 'false'); } catch { /* ignore unavailable storage */ }
      deps.performanceProfiler.setEnabled(enabled);
      deps.lightEngine.setMetricsEnabled(enabled);
      return deps.performanceProfiler.isEnabled();
    },
    getPerformanceSnapshot: () => deps.performanceProfiler.getSnapshot(),
    getLongFrames: (limit?: number) => deps.performanceProfiler.getLongFrames(limit),
    clearLongFrames: () => deps.performanceProfiler.clearLongFrames(),
    beginPerformanceCapture: (label = 'manual') => deps.performanceProfiler.beginCapture(label),
    endPerformanceCapture: () => deps.performanceProfiler.endCapture(),
    getActivePerformanceCapture: () => deps.performanceProfiler.getActiveCaptureSummary(),
    captureRawFrameTimes: (label = 'raw', durationMs = 60000) => captureRawFrameTimes(label, durationMs),
  };

  const target = window as unknown as DebugWindow;
  target.__mcDebug = debugHooks;
  return () => {
    if (target.__mcDebug === debugHooks) target.__mcDebug = undefined;
  };
}


function summarizeFrameTimes(label: string, durationMs: number, frameTimes: readonly number[]): RawFrameCaptureSummary {
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const averageFrameTime = frameTimes.length === 0 ? 0 : frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
  const onePercentCount = Math.max(1, Math.floor(sorted.length * 0.01));
  let worstOnePercentSum = 0;
  for (let i = sorted.length - onePercentCount; i < sorted.length; i++) worstOnePercentSum += sorted[i] ?? 0;
  const worstOnePercentAvg = sorted.length === 0 ? 0 : worstOnePercentSum / onePercentCount;
  return {
    label,
    durationMs,
    frameCount: frameTimes.length,
    averageFps: averageFrameTime > 0 ? 1000 / averageFrameTime : 0,
    onePercentLowFps: worstOnePercentAvg > 0 ? 1000 / worstOnePercentAvg : 0,
    averageFrameTimeMs: averageFrameTime,
    p95FrameTimeMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
    p99FrameTimeMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? 0,
    worstFrameTimeMs: sorted[sorted.length - 1] ?? 0,
  };
}

function captureRawFrameTimes(label: string, durationMs: number): Promise<RawFrameCaptureSummary> {
  const clampedDuration = Math.max(1000, Math.floor(durationMs));
  const frameTimes: number[] = [];
  const startedAt = performance.now();
  let previous: number | null = null;
  return new Promise((resolve) => {
    const step = (now: number): void => {
      if (previous !== null) frameTimes.push(now - previous);
      previous = now;
      if (now - startedAt >= clampedDuration) {
        resolve(summarizeFrameTimes(label, now - startedAt, frameTimes));
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function inspectLeafDecayArea(deps: EngineDebugHookDependencies, x: number, y: number, z: number, radius: number): unknown {
  const results: Array<Record<string, unknown>> = [];
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const cz = Math.floor(z);
  let guardPass = true;
  const minCX = Math.floor((cx - radius - 1) / 16);
  const maxCX = Math.floor((cx + radius + 1) / 16);
  const minCZ = Math.floor((cz - radius - 1) / 16);
  const maxCZ = Math.floor((cz + radius + 1) / 16);
  for (let cxx = minCX; cxx <= maxCX; cxx++) for (let czz = minCZ; czz <= maxCZ; czz++) if (!deps.chunkManager.hasChunk(cxx, czz)) guardPass = false;
  for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) for (let dz = -radius; dz <= radius; dz++) {
    const wx = cx + dx;
    const wy = cy + dy;
    const wz = cz + dz;
    if (wy < 0 || wy >= 128) continue;
    const bid = deps.blockUpdateWorld.getBlock(wx, wy, wz);
    const isLeaf = bid === 18 || bid === 250 || bid === 253;
    const isLog = bid === 17 || bid === 251 || bid === 252;
    if (!isLeaf && !isLog) continue;
    const meta = deps.blockUpdateWorld.getBlockMetadata(wx, wy, wz);
    const hasFlag = (meta & 8) !== 0;
    const species = meta & 3;
    results.push({ x: wx, y: wy, z: wz, blockId: bid, blockName: isLeaf ? 'leaves' : 'log', metadata: meta, hasDecayFlag: hasFlag, species, guardPass });
  }
  return {
    center: { x: cx, y: cy, z: cz },
    radius,
    guardPass,
    leaves: results.filter((r) => r.blockName === 'leaves'),
    logs: results.filter((r) => r.blockName === 'log'),
    all: results,
  };
}

function inspectFluid(deps: EngineDebugHookDependencies, x: number, y: number, z: number): unknown {
  const blockId = deps.blockUpdateWorld.getBlock(x, y, z);
  const metadata = deps.blockUpdateWorld.getBlockMetadata(x, y, z);
  const flow = computeFluidFlowVector({
    getBlock: (wx, wy, wz) => deps.blockUpdateWorld.getBlock(wx, wy, wz),
    getMetadata: (wx, wy, wz) => deps.blockUpdateWorld.getBlockMetadata(wx, wy, wz),
    isSolid: (id) => deps.blockRegistry.getById(id)?.solid ?? false,
  }, x, y, z, blockId);
  const isWater = blockId === 8 || blockId === 9;
  const isLava = blockId === 10 || blockId === 11;
  const moving = Math.hypot(flow.x, flow.z) > 1e-6;
  const textureSelector = isWater
    ? (isFallingFluid(metadata) || moving || blockId === 8 ? 'WaterFlow' : 'WaterStill')
    : isLava
      ? (isFallingFluid(metadata) || moving || blockId === 10 ? 'LavaFlow' : 'LavaStill')
      : 'None';
  return { blockId, metadata, flowLevel: getFluidLevel(metadata), falling: isFallingFluid(metadata), flow, surfaceHeight: fluidSurfaceHeight(metadata), textureSelector, currentFrames: deps.fluidAnimationSystem.getDebugInfo() };
}
