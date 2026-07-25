import type { DebugStats } from './DebugStats';

/**
 * F3-style debug overlay: a single plain-HTML/CSS <div> in the top-left
 * corner, semi-transparent black background, monospace text, one line
 * per stat — no framework, no canvas drawing, no dependency on Three.js.
 * Hidden by default; Engine toggles visibility on F3.
 *
 * Keeps DOM creation/teardown self-contained so Engine only ever calls
 * toggle()/render()/dispose() and never touches the DOM directly.
 */
export class DebugOverlay {
  private readonly element: HTMLDivElement;
  private visible = false;

  public constructor() {
    this.element = document.createElement('div');
    this.applyStyles(this.element);
    this.element.style.display = 'none';
  }

  /** Mounts the overlay element into the document. Call once, e.g. on Engine.start(). */
  public mount(): void {
    document.body.appendChild(this.element);
  }

  /** Removes the overlay element from the document. Call on Engine.stop(). */
  public dispose(): void {
    this.element.remove();
  }

  public toggle(): void {
    this.visible = !this.visible;
    this.element.style.display = this.visible ? 'block' : 'none';
  }

  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * Updates the overlay's text content. Cheap no-op skip when hidden —
   * callers may still call this every frame; the DOM is simply not
   * touched while invisible.
   */
  public render(stats: DebugStats): void {
    if (!this.visible) {
      return;
    }

    this.element.textContent = this.formatLines(stats).join('\n');
  }

  private formatLines(stats: DebugStats): string[] {
    return [
      '-- Performance --',
      `FPS: ${stats.fps.toFixed(0)}  avg: ${stats.averageFps.toFixed(0)}  1% low: ${stats.onePercentLowFps.toFixed(0)}`,
      `Frame: avg ${stats.averageFrameTimeMs.toFixed(2)}  worst ${stats.worstFrameTimeMs.toFixed(2)}  p95 ${stats.p95FrameTimeMs.toFixed(2)}  p99 ${stats.p99FrameTimeMs.toFixed(2)} ms`,
      `Update / render: ${stats.updateTimeMs.toFixed(2)} / ${stats.renderTimeMs.toFixed(2)} ms`,
      `Dirty scan: ${stats.dirtyChunkScanMs.toFixed(2)} ms`,
      `Heap: ${stats.jsHeapUsedMb.toFixed(1)} / ${stats.jsHeapTotalMb.toFixed(1)} MB`,
      '',
      '-- Player --',
      `X: ${stats.playerX.toFixed(3)}`,
      `Y: ${stats.playerY.toFixed(3)}`,
      `Z: ${stats.playerZ.toFixed(3)}`,
      `Chunk X: ${stats.chunkX}`,
      `Chunk Z: ${stats.chunkZ}`,
      `No-clip: ${stats.noClip ? 'ON' : 'off'}`,
      '',
      '-- World --',
      `Biome: ${stats.biomeName}`,
      `Seed: ${stats.worldSeed}`,
      `Time: ${stats.worldTime.toFixed(1)}`,
      `Day: ${stats.dayNumber}`,
      `Celestial angle: ${stats.celestialAngle.toFixed(3)}`,
      `Sky: ${stats.skyPhase}`,
      `Stars: ${stats.starOpacity.toFixed(3)}`,
      `Sun altitude: ${stats.sunAltitude.toFixed(3)}`,
      `Sun brightness: ${stats.sunBrightnessFactor.toFixed(3)}`,
      `Skylight subtracted: ${stats.skylightSubtracted}`,
      `Skylight factor: ${stats.skylightFactor.toFixed(3)}`,
      `Sky color: ${stats.skyColorHex}`,
      `Loaded chunks: ${stats.loadedChunks}`,
      `Visible chunk meshes: ${stats.visibleChunkMeshes}`,
      '',
      '-- Rendering --',
      `Triangles: ${stats.triangleCount}`,
      `Draw calls: ${stats.drawCalls}`,
      `Programs / geoms / textures: ${stats.compiledProgramCount}/${stats.rendererGeometryCount}/${stats.rendererTextureCount}`,
      `Chunk passes T/C/W/L/X/F/D: ${stats.terrainPassMeshes}/${stats.cutoutPassMeshes}/${stats.waterPassMeshes}/${stats.lavaPassMeshes}/${stats.translucentPassMeshes}/${stats.firePassMeshes}/${stats.depthPassMeshes}`,
      `Approx state buckets: ${stats.approximateStateBuckets}`,
      `Transparent order: ${stats.transparentPassOrder}`,
      `Sections loaded/renderable/empty: ${stats.occlusionLoadedSections}/${stats.occlusionRenderableSections}/${stats.occlusionEmptySections}`,
      `Section frustum visible/rejected: ${stats.occlusionFrustumVisibleSections}/${stats.occlusionFrustumRejectedSections}`,
      `Section portal visible/culled: ${stats.occlusionPortalVisibleSections}/${stats.occlusionPortalCulledSections}`,
      `Visible chunks frustum/portal: ${stats.occlusionFrustumVisibleChunks}/${stats.occlusionPortalVisibleChunks}`,
      `Occlusion CPU: ${stats.occlusionCpuMs.toFixed(3)} ms`,
      `Dirty chunk queue: ${stats.dirtyChunkQueueSize}`,
      `Gen queue: ${stats.chunkGenerationQueueSize} (avg ${stats.generationQueueAvg.toFixed(1)} max ${stats.generationQueueMax})`,
      `Oldest critical gen: ${stats.oldestCriticalGenerationAgeMs.toFixed(0)} ms`,
      `Mesh queue: ${stats.chunkMeshingQueueSize} (avg ${stats.meshingQueueAvg.toFixed(1)} max ${stats.meshingQueueMax})`,
      `Light queue: ${stats.lightingQueueCurrent} (avg ${stats.lightingQueueAvg.toFixed(1)} max ${stats.lightingQueueMax})`,
      `Persist queue: ${stats.persistenceQueueCurrent} (avg ${stats.persistenceQueueAvg.toFixed(1)} max ${stats.persistenceQueueMax})`,
      `Workers active/done/stale: ${stats.activeWorkerCount}/${stats.completedWorkerJobs}/${stats.staleWorkerJobs}`,
      `Mesh uploads: ${stats.meshUploadsThisFrame} (gpu ${stats.meshUploadGpuMs.toFixed(2)} scene ${stats.meshUploadSceneInsertMs.toFixed(2)} ms)`,
      `Geometry memory: ${stats.approximateGeometryMemoryMb.toFixed(1)} MB`,
      `Gen time: queue ${stats.generationTimeMs.toFixed(2)} worker ${stats.generationWorkerMs.toFixed(2)} integrate ${stats.generationIntegrationMs.toFixed(2)} ms`,
      `Gen transfer: bytes ${stats.generationBytesReceived} latency ${stats.generationTransferLatencyMs.toFixed(2)} ms`,
      `Mesh time: worker ${stats.meshingWorkerMs.toFixed(2)} build ${stats.meshingJobBuildMs.toFixed(2)} dispatch ${stats.meshingDispatchMs.toFixed(2)} drain ${stats.meshingResultDrainMs.toFixed(2)} ms`,
      `Mesh transfer: copied ${stats.meshingBytesCopied} sent ${stats.meshingBytesTransferred} returned ${stats.meshingBytesReturned} latency ${stats.meshingTransferLatencyMs.toFixed(2)} ms`,
      `Profiler: ${stats.profilerEnabled ? 'on' : 'off'} overhead ${stats.profilerTotalOverheadMs.toFixed(3)} ms (self ${stats.profilerSelfMs.toFixed(3)} collect ${stats.profilerDebugCollectMs.toFixed(3)} render ${stats.profilerDebugRenderMs.toFixed(3)})`,
      `Long frames: ${stats.longFrameCount} over ${stats.longFrameThresholdMs.toFixed(0)} ms`,
      `Fog: ${stats.fogMode}`,
      `Fog near: ${stats.fogNear.toFixed(1)}`,
      `Fog kind: ${stats.fogKind}`,
      `Fog near: ${stats.fogNear.toFixed(1)}`,
      `Fog far: ${stats.fogFar.toFixed(1)}`,
      `Fog density: ${stats.fogDensity.toFixed(4)}`,
      `Fog color: ${stats.fogColorHex}`,
      `Horizon color: ${stats.horizonColorHex}`,
      '',
      '-- Clouds --',
      `Cloud offset X: ${stats.cloudOffsetX.toFixed(2)} blk`,
      `Cloud wind: ${stats.cloudWindSpeed.toFixed(2)} blk/s`,
      `Cloud color: ${stats.cloudColorHex}`,
      `Cloud cells: ${stats.cloudCellCount}`,
      '',
      '-- Weather (F5 auto / F8 clear / F9 rain / F10 thunder) --',
      `Mode: ${stats.weatherMode}  (forced: ${stats.weatherForced})`,
      `Rain: ${stats.rainStrength.toFixed(3)} (prev ${stats.prevRainStrength.toFixed(3)})`,
      `Thunder: ${stats.thunderStrength.toFixed(3)} (prev ${stats.prevThunderStrength.toFixed(3)})`,
      `Rain time: ${stats.rainTime}  Thunder time: ${stats.thunderTime}`,
      `Precip cols: rain ${stats.precipitationRain}  snow ${stats.precipitationSnow}`,
      `Precip build/update: ${stats.precipitationBuildMs.toFixed(2)} / ${stats.precipitationUpdateMs.toFixed(2)} ms`,
      `Precip vertices: ${stats.precipitationVertices}`,
      `Splashes: ${stats.splashActive}  Bolts: ${stats.lightningActive}  Flash: ${stats.lightningFlash.toFixed(3)}`,
      `Skylight penalty: ${stats.weatherSkylightPenalty.toFixed(2)}  ` +
        `→ effective sub: ${stats.effectiveSkylightSubtracted}`,
      `Wind: (${stats.windX.toFixed(2)}, ${stats.windZ.toFixed(2)})`,
      `Weather timings: sim ${stats.weatherSimulationMs.toFixed(2)} splash ${stats.weatherSplashMs.toFixed(2)} heightmap ${stats.weatherHeightmapResampleMs.toFixed(2)} rebuild ${stats.weatherGeometryRebuildMs.toFixed(2)} draw ${stats.weatherDrawMs.toFixed(2)} transparent ${stats.weatherTransparentRenderingMs.toFixed(2)} ms`,
      `Lighting: prop ${stats.lightingPropagationMs.toFixed(2)} ms  init ${stats.lightingInitializationMs.toFixed(2)} border ${stats.lightingBorderReconcileMs.toFixed(2)} local ${stats.lightingLocalRelightMs.toFixed(2)} ms`,
      `Lighting queues: calls ${stats.lightingPropagationCalls} nodes ${stats.lightingNodesProcessed} bfs avg ${stats.lightingAvgBfsQueueSize.toFixed(1)} max ${stats.lightingMaxBfsQueueSize}`,
      '',
      '-- Block updates --',
      `Scheduled: pending ${stats.scheduledTicksPending} overdue ${stats.scheduledTicksOverdue} processed ${stats.scheduledTicksProcessed}`,
      `Neighbours: pending ${stats.neighbourUpdatesPending} processed ${stats.neighbourUpdatesProcessed}`,
      `Random ticks: ${stats.randomTicksProcessed}`,
      `Stale/duplicate ticks: ${stats.skippedStaleTicks}/${stats.duplicateScheduledTicks}`,
      `Tick dispatcher: ${stats.tickDispatcherTimeMs.toFixed(2)} ms`,
      `Oldest scheduled age: ${stats.oldestScheduledTickAge}`,
      `Detached tick queues: ${stats.detachedTickQueues}`,
      '',
      '-- Falling Blocks --',
      `Entities: ${stats.fallingEntityCount}  Persisted: ${stats.fallingPersistedCount}`,
      `Meshes: ${stats.fallingMeshCount}  Sim tick: ${stats.fallingSimulationTick}`,
      `Interpolation: ${stats.fallingInterpolationAlpha.toFixed(3)}`,
      `Pending drops: ${stats.fallingPendingDrops}`,
    ];
  }

  private applyStyles(element: HTMLDivElement): void {
    element.style.position = 'fixed';
    element.style.top = '0';
    element.style.left = '0';
    element.style.margin = '8px';
    element.style.padding = '8px 10px';
    element.style.background = 'rgba(0, 0, 0, 0.5)';
    element.style.color = '#ffffff';
    element.style.fontFamily = 'monospace';
    element.style.fontSize = '13px';
    element.style.lineHeight = '1.4';
    element.style.whiteSpace = 'pre';
    element.style.pointerEvents = 'none';
    element.style.userSelect = 'none';
    element.style.zIndex = '1000';
    element.style.textShadow = '1px 1px 1px rgba(0, 0, 0, 0.8)';
  }
}
