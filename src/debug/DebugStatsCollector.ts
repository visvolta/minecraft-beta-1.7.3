import type { Renderer } from '../rendering/Renderer';
import type * as THREE from 'three';
import type { Player } from '../player/Player';
import type { ChunkManager } from '../world/ChunkManager';
import type { ChunkRenderer } from '../rendering/ChunkRenderer';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { ClimateSampler } from '../world/generation/climate/ClimateSampler';
import { selectBiome } from '../world/generation/climate/BiomeSelector';
import { FrameTimeTracker } from './DebugStats';
import type { DebugStats } from './DebugStats';
import type { WorldTime } from '../world/WorldTime';
import type { SkyRenderer } from '../rendering/sky/SkyRenderer';
import type { CloudRenderer } from '../rendering/sky/CloudRenderer';
import type { WeatherController } from '../world/weather/WeatherController';
import type { PrecipitationRenderer } from '../rendering/weather/PrecipitationRenderer';
import type { RainSplashRenderer } from '../rendering/weather/RainSplashRenderer';
import type { LightningRenderer } from '../rendering/weather/LightningRenderer';
import type { PerformanceProfiler } from './PerformanceProfiler';
import type { WorldTickScheduler } from '../world/ticks/WorldTickScheduler';
import type { FallingBlockManager } from '../world/entities/FallingBlockManager';
import type { WorldEventQueue } from '../world/events/WorldEventQueue';
import { SectionVisibilityAnalyzer } from '../world/visibility/SectionVisibility';

function formatHexColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0').toUpperCase()}`;
}

export class DebugStatsCollector {
  private readonly player: Player;
  private readonly chunkManager: ChunkManager;
  private readonly chunkRenderer: ChunkRenderer;
  private readonly sceneRenderer: Renderer;
  private readonly skyRenderer: SkyRenderer;
  private readonly cloudRenderer: CloudRenderer;
  private readonly weatherController: WeatherController;
  private readonly precipitationRenderer: PrecipitationRenderer;
  private readonly rainSplashRenderer: RainSplashRenderer;
  private readonly lightningRenderer: LightningRenderer;
  private readonly threeRenderer: THREE.WebGLRenderer;
  private readonly worldSeed: bigint;
  private readonly climateSampler: ClimateSampler;
  private readonly worldTime: WorldTime;
  private readonly performanceProfiler: PerformanceProfiler;
  private readonly worldTickScheduler: WorldTickScheduler;
  private readonly fallingBlockManager: FallingBlockManager;
  private readonly events: WorldEventQueue | undefined;
  private readonly visibilityAnalyzer: SectionVisibilityAnalyzer;
  private readonly frameTimeTracker = new FrameTimeTracker();

  public constructor(
    player: Player,
    chunkManager: ChunkManager,
    chunkRenderer: ChunkRenderer,
    sceneRenderer: Renderer,
    skyRenderer: SkyRenderer,
    cloudRenderer: CloudRenderer,
    weatherController: WeatherController,
    precipitationRenderer: PrecipitationRenderer,
    rainSplashRenderer: RainSplashRenderer,
    lightningRenderer: LightningRenderer,
    threeRenderer: THREE.WebGLRenderer,
    worldSeed: bigint,
    worldTime: WorldTime,
    performanceProfiler: PerformanceProfiler,
    worldTickScheduler: WorldTickScheduler,
    fallingBlockManager: FallingBlockManager,
    events: WorldEventQueue | undefined,
  ) {
    this.player = player;
    this.chunkManager = chunkManager;
    this.chunkRenderer = chunkRenderer;
    this.sceneRenderer = sceneRenderer;
    this.skyRenderer = skyRenderer;
    this.cloudRenderer = cloudRenderer;
    this.weatherController = weatherController;
    this.precipitationRenderer = precipitationRenderer;
    this.rainSplashRenderer = rainSplashRenderer;
    this.lightningRenderer = lightningRenderer;
    this.threeRenderer = threeRenderer;
    this.worldSeed = worldSeed;
    this.worldTime = worldTime;
    this.performanceProfiler = performanceProfiler;
    this.worldTickScheduler = worldTickScheduler;
    this.fallingBlockManager = fallingBlockManager;
    this.events = events;
    this.climateSampler = new ClimateSampler(worldSeed);
    this.visibilityAnalyzer = new SectionVisibilityAnalyzer(chunkManager, chunkRenderer.getBlockRegistry());
  }

  public recordFrame(deltaSeconds: number): void {
    this.frameTimeTracker.record(deltaSeconds);
  }

  /**
   * Stage 18B: called once per frame by Engine so the F3 overlay can
   * show the computed weather-skylight penalty, final effective
   * subtraction (after flash), and the shared wind vector. Kept as a
   * setter to avoid coupling DebugStatsCollector to AtmosphericState's
   * concrete shape.
   */
  public setStormReadout(readout: {
    weatherSkylightPenalty: number;
    effectiveSkylightSubtracted: number;
    windX: number;
    windZ: number;
  }): void {
    this.stormReadout = readout;
  }
  private stormReadout: {
    weatherSkylightPenalty: number;
    effectiveSkylightSubtracted: number;
    windX: number;
    windZ: number;
  } = { weatherSkylightPenalty: 0, effectiveSkylightSubtracted: 0, windX: 0, windZ: 0 };

  public collect(noClip: boolean): DebugStats {
    const chunkX = Math.floor(this.player.position.x / CHUNK_SIZE_X);
    const chunkZ = Math.floor(this.player.position.z / CHUNK_SIZE_Z);

    const [climate] = this.climateSampler.sampleRegion(
      Math.floor(this.player.position.x),
      Math.floor(this.player.position.z),
      1,
      1,
    );
    const biome = selectBiome(climate!);

    const info = this.threeRenderer.info;
    const fog = this.sceneRenderer.getCurrentFogState();
    const sky = this.skyRenderer.getCurrentState();
    const cloudInfo = this.cloudRenderer.getDebugInfo();
    const perf = this.performanceProfiler.getSnapshot();
    const tickMetrics = this.worldTickScheduler.getMetrics();
    const passCounts = this.chunkRenderer.getPassMeshCounts();
    const compiledProgramCount = ((this.threeRenderer.info as unknown as { programs?: unknown[] }).programs?.length) ?? 0;

    // Stage 18: weather stats.
    const w = this.weatherController.getState();
    const forcedMode = this.weatherController.getForcedMode();
    const weatherStats = {
      mode: w.getEffectiveMode(w.partialTick),
      forced: forcedMode === null ? 'auto' : forcedMode,
      rainStrength: w.rainingStrength,
      prevRainStrength: w.prevRainingStrength,
      thunderStrength: w.thunderingStrength,
      prevThunderStrength: w.prevThunderingStrength,
      rainTime: w.rainTime,
      thunderTime: w.thunderTime,
    };
    const precipStats = this.precipitationRenderer.getStats();
    const occlusionStats = this.visibilityAnalyzer.analyze(this.sceneRenderer.camera);

    return {
      fps: this.frameTimeTracker.getFps(),
      frameTimeMs: this.frameTimeTracker.getAverageFrameTimeMs(),
      worstFrameTimeMs: perf.worstFrameTimeMs,
      updateTimeMs: perf.updateTimeMs,
      renderTimeMs: perf.renderTimeMs,

      playerX: this.player.position.x,
      playerY: this.player.position.y,
      playerZ: this.player.position.z,
      chunkX,
      chunkZ,

      biomeName: biome.displayName,
      worldSeed: this.worldSeed.toString(),
      worldTime: this.worldTime.getTimeOfDayTicks(),
      dayNumber: this.worldTime.getDayNumber(),
      celestialAngle: this.worldTime.getCelestialAngle(),
      skyPhase: sky.skyPhase,
      loadedChunks: this.chunkManager.size,
      visibleChunkMeshes: this.chunkRenderer.getVisibleMeshCount(),

      triangleCount: info.render.triangles,
      drawCalls: info.render.calls,
      compiledProgramCount,
      rendererGeometryCount: info.memory.geometries,
      rendererTextureCount: info.memory.textures,
      terrainPassMeshes: passCounts.terrain,
      cutoutPassMeshes: passCounts.cutout,
      waterPassMeshes: passCounts.water,
      lavaPassMeshes: passCounts.lava,
      translucentPassMeshes: passCounts.translucent,
      firePassMeshes: passCounts.fire,
      depthPassMeshes: passCounts.depth,
      approximateStateBuckets: passCounts.stateBuckets,
      transparentPassOrder: '19 depth -> 20 translucent -> 21 water -> 22 lava -> 25 fire -> 30 weather',
      occlusionLoadedSections: occlusionStats.loadedSections,
      occlusionRenderableSections: occlusionStats.renderableSections,
      occlusionEmptySections: occlusionStats.emptySections,
      occlusionFrustumVisibleSections: occlusionStats.frustumVisibleSections,
      occlusionFrustumRejectedSections: occlusionStats.frustumRejectedSections,
      occlusionReachableSections: occlusionStats.reachableSections,
      occlusionPortalVisibleSections: occlusionStats.portalVisibleSections,
      occlusionPortalCulledSections: occlusionStats.portalCulledSections,
      occlusionFrustumVisibleChunks: occlusionStats.frustumVisibleChunks,
      occlusionPortalVisibleChunks: occlusionStats.portalVisibleChunks,
      occlusionCpuMs: occlusionStats.occlusionCpuMs,
      dirtyChunkQueueSize: this.chunkManager.countDirtyChunks(),
      chunkGenerationQueueSize: perf.generationQueueSize,
      oldestCriticalGenerationAgeMs: perf.oldestCriticalGenerationAgeMs,
      chunkMeshingQueueSize: perf.meshingQueueSize,
      activeWorkerCount: perf.activeWorkerCount,
      completedWorkerJobs: perf.completedWorkerJobs,
      staleWorkerJobs: perf.staleWorkerJobs,
      meshUploadsThisFrame: perf.meshUploadsThisFrame,
      approximateGeometryMemoryMb: perf.approximateGeometryMemoryMb,

      fogMode: fog.mode,
      fogKind: fog.kind,
      fogNear: fog.near,
      fogFar: fog.far,
      fogDensity: fog.density,
      starOpacity: sky.starOpacity,
      sunAltitude: sky.sunAltitude,
      skyColorHex: formatHexColor(sky.skyColorHex),
      horizonColorHex: formatHexColor(sky.horizonColorHex),
      fogColorHex: formatHexColor(fog.colorHex),

      // "Overall daylight reaching an open outdoor block" — max(0..15
      // effective sky) × sun-brightness, normalised. 1.0 = full noon,
      // ~0 = midnight enclosed.
      skylightFactor: Math.max(0, (15 - sky.skylightSubtracted) / 15) * sky.sunBrightnessFactor,
      skylightSubtracted: sky.skylightSubtracted,
      sunBrightnessFactor: sky.sunBrightnessFactor,

      // Stage 17: cloud debug snapshot.
      cloudOffsetX: cloudInfo.cloudOffsetX,
      cloudWindSpeed: cloudInfo.windSpeedBlocksPerSecond,
      cloudColorHex: formatHexColor(cloudInfo.colorHex),
      cloudCellCount: cloudInfo.cellCountVisible,

      // Stage 18 weather snapshot.
      weatherMode: weatherStats.mode,
      weatherForced: weatherStats.forced,
      rainStrength: weatherStats.rainStrength,
      prevRainStrength: weatherStats.prevRainStrength,
      thunderStrength: weatherStats.thunderStrength,
      prevThunderStrength: weatherStats.prevThunderStrength,
      rainTime: weatherStats.rainTime,
      thunderTime: weatherStats.thunderTime,
      precipitationRain: precipStats.rain,
      precipitationSnow: precipStats.snow,
      precipitationBuildMs: precipStats.buildMs,
      precipitationUpdateMs: precipStats.updateMs,
      precipitationVertices: precipStats.vertices,
      splashActive: this.rainSplashRenderer.getActiveCount(),
      lightningActive: this.lightningRenderer.getActiveBoltCount(),
      lightningFlash: this.lightningRenderer.getFlashStrength(),

      weatherSkylightPenalty: this.stormReadout.weatherSkylightPenalty,
      effectiveSkylightSubtracted: this.stormReadout.effectiveSkylightSubtracted,
      windX: this.stormReadout.windX,
      windZ: this.stormReadout.windZ,

      scheduledTicksPending: tickMetrics.pendingScheduledTicks,
      scheduledTicksOverdue: tickMetrics.overdueScheduledTicks,
      scheduledTicksProcessed: tickMetrics.processedScheduledTicks,
      neighbourUpdatesPending: tickMetrics.pendingNeighbourUpdates,
      neighbourUpdatesProcessed: tickMetrics.processedNeighbourUpdates,
      randomTicksProcessed: tickMetrics.randomTicksProcessed,
      skippedStaleTicks: tickMetrics.skippedStaleTicks,
      duplicateScheduledTicks: tickMetrics.duplicateSuppressedTicks,
      tickDispatcherTimeMs: tickMetrics.dispatcherTimeMs,
      oldestScheduledTickAge: tickMetrics.oldestPendingScheduledTickAge,
      detachedTickQueues: tickMetrics.detachedChunkTickQueues,

      fallingEntityCount: this.fallingBlockManager.getCount(),
      fallingPersistedCount: this.fallingBlockManager.getPersistedCount(),
      fallingMeshCount: this.fallingBlockManager.getMeshCount(),
      fallingSimulationTick: this.fallingBlockManager.getSimulationTick(),
      fallingInterpolationAlpha: this.fallingBlockManager.getInterpolationAlpha(),
      fallingPendingDrops: this.events?.getBlockDropCount() ?? 0,

      noClip,
    };
  }
}
