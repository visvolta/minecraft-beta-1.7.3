import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { CameraController } from '../camera/CameraController';
import { Input } from '../input/Input';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { InteractionController } from '../player/InteractionController';
import { PlayerPhysics } from '../physics/PlayerPhysics';
import { BlockHighlight } from '../rendering/BlockHighlight';
import { ChunkRenderer } from '../rendering/ChunkRenderer';
import { FogController } from '../rendering/FogController';
import { Renderer } from '../rendering/Renderer';
import { SkyRenderer } from '../rendering/sky/SkyRenderer';
import { CloudRenderer } from '../rendering/sky/CloudRenderer';
import { WorldTime } from '../world/WorldTime';
import { ChunkManager } from '../world/ChunkManager';
import { BlockUpdateWorld } from '../world/BlockUpdateWorld';
import { BlockBehaviourRegistry } from '../world/BlockBehaviour';
import { RandomTickScheduler } from '../world/ticks/RandomTickScheduler';
import { WorldTickScheduler } from '../world/ticks/WorldTickScheduler';
import { registerFluidBehaviours } from '../world/fluid/FluidBehaviour';
import { registerPlantBehaviours } from '../world/behaviours/PlantBehaviours';
import { registerSupportBehaviours } from '../world/behaviours/SupportBehaviours';
import { registerFireBehaviour } from '../world/behaviours/FireBehaviour';
import { registerSnowIceBehaviours } from '../world/behaviours/registerSnowIceBehaviours';
import { PrecipitationSimulator } from '../world/weather/PrecipitationSimulator';
import { registerFallingBlockBehaviours } from '../world/behaviours/FallingBlockBehaviour';
import { registerLeafBehaviour } from '../world/behaviours/LeafBehaviour';
import { registerLogBehaviour } from '../world/behaviours/LogBehaviour';
import { FallingBlockManager } from '../world/entities/FallingBlockManager';
import { FluidAnimationSystem } from '../rendering/fluid/FluidAnimationSystem';
import { FireAnimationSystem } from '../rendering/fire/FireAnimationSystem';
import { WorldEventQueue } from '../world/events/WorldEventQueue';
import { computeFluidFlowVector } from '../world/fluid/FluidFlowVector';
import { fluidSurfaceHeight, getFluidLevel, isFallingFluid } from '../world/fluid/FluidMetadata';
import { ChunkStreamer } from '../world/ChunkStreamer';
import { BetaWorldGenerator } from '../world/generation/BetaWorldGenerator';
import { LightEngine } from '../world/generation/lighting/LightEngine';
import { ClimateSampler } from '../world/generation/climate/ClimateSampler';
import { WeatherController } from '../world/weather/WeatherController';
import { PrecipitationRenderer } from '../rendering/weather/PrecipitationRenderer';
import { RainSplashRenderer } from '../rendering/weather/RainSplashRenderer';
import { LightningRenderer } from '../rendering/weather/LightningRenderer';
import { LightningManager } from '../world/weather/LightningManager';
import { buildAtmosphericState, previewWeatherFade } from '../rendering/AtmosphericState';
import { DebugController } from '../debug/DebugController';
import { DebugOverlay } from '../debug/DebugOverlay';
import { DebugStatsCollector } from '../debug/DebugStatsCollector';
import { PerformanceProfiler } from '../debug/PerformanceProfiler';
import { WorkerValidationHarness } from '../debug/WorkerValidationHarness';
import { BlockTestGrid } from '../debug/BlockTestGrid';
import type { IUpdatable } from './IUpdatable';

/** Maximum delta (seconds) applied in one frame after tab focus / hitch. */
const MAX_DELTA_SECONDS = 0.1;

/**
 * Hardcoded world seed for this stage (no seed-selection UI or save
 * system yet). BigInt because Beta's terrain noise depends on Java's
 * full 64-bit long seed semantics, which a plain JS number can't
 * represent exactly.
 *
 * Keep this in sync with scripts/verifyDefaultSeedHealth.ts.
 */
const WORLD_SEED = -47n;

/**
 * Player spawn (feet position). Fixed X/Z with a generously high Y so the
 * player always starts above generated terrain (which varies in height,
 * unlike the old flat world) and falls onto it under gravity + collision.
 * No spawn search or saved spawn data yet — fixed for this stage.
 */
const SPAWN_X = 8;
const SPAWN_Y = 140;
const SPAWN_Z = 8;

/**
 * Application lifecycle and game loop.
 * Coordinates systems; contains no gameplay rules.
 *
 * The block registry and texture atlas are built before the Engine exists
 * (asset loading is asynchronous) and are handed in already populated.
 */
export class Engine {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly cameraController: CameraController;
  private readonly player: Player;
  private readonly playerController: PlayerController;
  private readonly playerPhysics: PlayerPhysics;
  private readonly interactionController: InteractionController;
  private readonly blockHighlight: BlockHighlight;
  private readonly atlas: TextureAtlas;
  private readonly chunkManager: ChunkManager;
  private readonly worldGenerator: BetaWorldGenerator;
  private readonly chunkRenderer: ChunkRenderer;
  private readonly fluidAnimationSystem: FluidAnimationSystem;
  private readonly fireAnimationSystem: FireAnimationSystem;
  private readonly worldEventQueue: WorldEventQueue;
  private readonly chunkStreamer: ChunkStreamer;
  private readonly lightEngine: LightEngine;
  private readonly blockUpdateWorld: BlockUpdateWorld;
  private readonly blockBehaviourRegistry: BlockBehaviourRegistry;
  private readonly fallingBlockManager: FallingBlockManager;
  private readonly worldTickScheduler: WorldTickScheduler;
  private readonly worldTime: WorldTime;
  private readonly fogController: FogController;
  private readonly skyRenderer: SkyRenderer;
  private readonly cloudRenderer: CloudRenderer;
  private readonly weatherController: WeatherController;
  private readonly precipitationSimulator: PrecipitationSimulator;
  private readonly climateSampler: ClimateSampler;
  private readonly precipitationRenderer: PrecipitationRenderer;
  private readonly rainSplashRenderer: RainSplashRenderer;
  private readonly lightningManager: LightningManager;
  private readonly lightningRenderer: LightningRenderer;
  private readonly updatables: IUpdatable[] = [];

  // Stage 12D debug systems. Kept isolated from gameplay: DebugController
  // only ever moves the player directly while no-clip is on (Engine picks
  // whether PlayerPhysics or DebugController runs each frame); DebugOverlay
  // only ever reads a DebugStats snapshot and never touches game state.
  private readonly debugOverlay: DebugOverlay;
  private readonly debugController: DebugController;
  private readonly debugStatsCollector: DebugStatsCollector;
  private readonly blockTestGrid: BlockTestGrid;
  private readonly performanceProfiler = new PerformanceProfiler();
  private noClipEnabled = false;
  private rawLightDebugMode = false;
  private ambientOcclusionDebugMode = false;

  private running = false;
  private animationFrameId: number | null = null;
  private lastFrameTimeMs: number | null = null;

  public constructor(blockRegistry: BlockRegistry, atlas: TextureAtlas) {
    this.atlas = atlas;
    this.chunkManager = new ChunkManager();
    this.worldGenerator = new BetaWorldGenerator(WORLD_SEED);
    this.worldTime = new WorldTime();

    this.renderer = new Renderer();

    this.input = new Input(this.renderer.domElement);
    this.cameraController = new CameraController(
      this.renderer.camera,
      this.input,
    );

    this.player = new Player(SPAWN_X, SPAWN_Y, SPAWN_Z);
    this.playerController = new PlayerController(
      this.input,
      this.cameraController,
      this.player,
    );
    this.playerPhysics = new PlayerPhysics(this.chunkManager, blockRegistry);

    this.lightEngine = new LightEngine(this.chunkManager, blockRegistry);
    this.blockUpdateWorld = new BlockUpdateWorld(this.chunkManager, blockRegistry, this.lightEngine);
    this.blockBehaviourRegistry = new BlockBehaviourRegistry();
    this.worldEventQueue = new WorldEventQueue();
    this.fallingBlockManager = new FallingBlockManager(this.blockUpdateWorld, blockRegistry, this.chunkManager, this.renderer.scene, atlas, this.worldEventQueue);
    registerFluidBehaviours(this.blockBehaviourRegistry);
    registerPlantBehaviours(this.blockBehaviourRegistry, blockRegistry);
    registerSupportBehaviours(this.blockBehaviourRegistry, blockRegistry);
    // Fire needs WeatherController + ChunkManager for rain/sky-exposure checks.
    const sessionSeed = BigInt(Date.now()) & 0xffffffffffffffffn;
    this.weatherController = new WeatherController(sessionSeed);
    this.precipitationSimulator = new PrecipitationSimulator(sessionSeed);
    registerFireBehaviour(this.blockBehaviourRegistry, blockRegistry, this.weatherController, this.chunkManager);
    registerSnowIceBehaviours(this.blockBehaviourRegistry);
    registerFallingBlockBehaviours(this.blockBehaviourRegistry, blockRegistry, this.fallingBlockManager);
    // Stage 5 leaf decay
    const leafBehaviour = registerLeafBehaviour(this.blockBehaviourRegistry);
    const logBehaviour = registerLogBehaviour(this.blockBehaviourRegistry);
    (this as any)._leafBehaviour = leafBehaviour;
    (this as any)._logBehaviour = logBehaviour;

    const randomTickScheduler = new RandomTickScheduler(WORLD_SEED);
    this.worldTickScheduler = new WorldTickScheduler(
      this.chunkManager,
      this.blockUpdateWorld,
      this.blockBehaviourRegistry,
      randomTickScheduler,
      this.worldEventQueue,
    );
    this.blockUpdateWorld.setScheduleCallback((x, y, z, id, delay) =>
      this.worldTickScheduler.schedule(x, y, z, id, delay),
    );
    this.blockUpdateWorld.setBehaviourRegistry(this.blockBehaviourRegistry);
    this.blockUpdateWorld.setEventQueue(this.worldEventQueue);
    this.blockUpdateWorld.setGameTickProvider(() => this.worldTickScheduler.getGameTick());
    this.blockUpdateWorld.setNextIntProvider((bound: number) => randomTickScheduler.nextInt(bound));

    // Register precipitation tick as a game tick callback (runs at 20 TPS)
    this.worldTickScheduler.addGameTickCallback(() => {
      const weatherState = this.weatherController.getState();
      if (weatherState.raining) {
        this.precipitationSimulator.tick(
          this.chunkManager,
          this.blockUpdateWorld,
          blockRegistry,
          this.climateSampler,
          weatherState,
          this.worldTickScheduler.getGameTick(),
        );
      }
    });
    this.fogController = new FogController(this.lightEngine);
    this.skyRenderer = new SkyRenderer(this.renderer.scene);
    this.cloudRenderer = new CloudRenderer(this.renderer.scene);

    // Stage 18: weather. WeatherController already created above for fire.
    this.climateSampler = new ClimateSampler(WORLD_SEED);
    this.precipitationRenderer = new PrecipitationRenderer(
      this.renderer.scene,
      this.chunkManager,
      this.climateSampler,
      blockRegistry,
      () => this.renderer.isFancyGraphicsEnabled(),
    );
    this.rainSplashRenderer = new RainSplashRenderer(this.renderer.scene);
    this.lightningManager = new LightningManager(
      this.chunkManager,
      blockRegistry,
      sessionSeed,
    );
    this.lightningRenderer = new LightningRenderer(this.renderer.scene);

    this.interactionController = new InteractionController(
      this.input,
      this.renderer.camera,
      this.player,
      this.chunkManager,
      blockRegistry,
      this.blockUpdateWorld,
    );
    this.blockHighlight = new BlockHighlight(this.renderer.scene);
    this.fluidAnimationSystem = new FluidAnimationSystem();
    this.fireAnimationSystem = new FireAnimationSystem();

    this.chunkRenderer = new ChunkRenderer(
      this.renderer.scene,
      this.chunkManager,
      blockRegistry,
      this.atlas,
      this.fluidAnimationSystem,
      this.fireAnimationSystem,
    );
    this.chunkStreamer = new ChunkStreamer(
      this.chunkManager,
      this.worldGenerator,
      this.chunkRenderer,
      this.lightEngine,
      WORLD_SEED,
    );

    this.blockTestGrid = new BlockTestGrid(blockRegistry, this.blockUpdateWorld);

    this.debugOverlay = new DebugOverlay();
    this.debugController = new DebugController(
      this.input,
      this.cameraController,
      this.player,
    );
    this.debugStatsCollector = new DebugStatsCollector(
      this.player,
      this.chunkManager,
      this.chunkRenderer,
      this.renderer,
      this.skyRenderer,
      this.cloudRenderer,
      this.weatherController,
      this.precipitationRenderer,
      this.rainSplashRenderer,
      this.lightningRenderer,
      this.renderer.renderer,
      WORLD_SEED,
      this.worldTime,
      this.performanceProfiler,
      this.worldTickScheduler,
      this.fallingBlockManager,
      this.worldEventQueue,
    );

    const validationHarness = new WorkerValidationHarness(WORLD_SEED, this.atlas);
    (window as unknown as { __mcDebug?: Record<string, unknown> }).__mcDebug = {
      validateGenerationWorkers: () => validationHarness.validateGenerationWorker(),
      validateMeshWorkers: () => validationHarness.validateMeshWorker(),
      getTickMetrics: () => this.worldTickScheduler.getMetrics(),
      getFallingBlockMetrics: () => ({
        simulationTick: this.fallingBlockManager.getSimulationTick(),
        interpolationAlpha: this.fallingBlockManager.getInterpolationAlpha(),
        active: this.fallingBlockManager.getCount(),
        persisted: this.fallingBlockManager.getPersistedCount(),
        meshCount: this.fallingBlockManager.getMeshCount(),
        entities: this.fallingBlockManager.getDebugEntities(),
        pendingDrops: this.worldEventQueue.getBlockDropCount(),
      }),
      getFluidMetrics: () => ({
        ...this.fluidAnimationSystem.getDebugInfo(),
        lavaIgnitionAttempts: this.worldEventQueue.getTotalLavaIgnitionAttempts(),
        worldEventQueueDepth: this.worldEventQueue.getQueueDepth(),
      }),
      getFireMetrics: () => ({
        ...this.fireAnimationSystem.getDebugInfo(),
        tntIgniteAttempts: this.worldEventQueue.getTotalTntIgniteAttempts(),
        pendingTntIgnitions: this.worldEventQueue.getTntIgniteAttemptCount(),
      }),
      getBlockTestGrid: () => ({
        grid: this.blockTestGrid.getGridState(),
        blocks: this.blockTestGrid.getInfo(),
        totalBlocks: this.blockTestGrid.getInfo().length,
        origin: this.blockTestGrid.getGridState() ? {
          x: this.blockTestGrid.getGridState()!.originX,
          y: this.blockTestGrid.getGridState()!.originY,
          z: this.blockTestGrid.getGridState()!.originZ,
        } : null,
      }),
      getWeatherMetrics: () => ({
        ...this.precipitationSimulator.getMetrics(),
        activeSnowfall: this.weatherController.getState().raining,
        weatherMode: this.weatherController.getState().getEffectiveMode(this.weatherController.getState().partialTick),
      }),
      getLeafDecayMetrics: () => {
        const leaf = (this as any)._leafBehaviour as { getMetrics?: () => any } | undefined;
        const log = (this as any)._logBehaviour as { getMetrics?: () => any } | undefined;
        return {
          ...(leaf?.getMetrics?.() ?? {}),
          ...(log?.getMetrics?.() ?? {}),
          pendingItemDrops: this.worldEventQueue.getItemDropCount(),
          totalItemDrops: this.worldEventQueue.getTotalItemDrops(),
          discardedItemDrops: this.worldEventQueue.getDiscardedItemDropCount(),
          queueDepth: this.worldEventQueue.getQueueDepth(),
        };
      },
      drainLeafDecayDrops: () => this.worldEventQueue.drainItemDrops(),
      resetLeafDecayMetrics: () => {
        const leaf = (this as any)._leafBehaviour as { resetMetrics?: () => void } | undefined;
        const log = (this as any)._logBehaviour as { resetMetrics?: () => void } | undefined;
        leaf?.resetMetrics?.();
        log?.resetMetrics?.();
      },
      inspectLeafDecayArea: (x: number, y: number, z: number, radius = 4) => {
        const results: any[] = [];
        const cx = Math.floor(x);
        const cy = Math.floor(y);
        const cz = Math.floor(z);
        // Guard check for area
        let guardPass = true;
        const minCX = Math.floor((cx - radius - 1) / 16);
        const maxCX = Math.floor((cx + radius + 1) / 16);
        const minCZ = Math.floor((cz - radius - 1) / 16);
        const maxCZ = Math.floor((cz + radius + 1) / 16);
        for (let cxx = minCX; cxx <= maxCX; cxx++) {
          for (let czz = minCZ; czz <= maxCZ; czz++) {
            if (!this.chunkManager.hasChunk(cxx, czz)) {
              guardPass = false;
            }
          }
        }
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dz = -radius; dz <= radius; dz++) {
              const wx = cx + dx;
              const wy = cy + dy;
              const wz = cz + dz;
              if (wy < 0 || wy >= 128) continue;
              const bid = this.blockUpdateWorld.getBlock(wx, wy, wz);
              // Only report leaves and logs
              const isLeaf = bid === 18 || bid === 250 || bid === 253;
              const isLog = bid === 17 || bid === 251 || bid === 252;
              if (!isLeaf && !isLog) continue;
              const meta = this.blockUpdateWorld.getBlockMetadata(wx, wy, wz);
              const hasFlag = (meta & 8) !== 0;
              const species = meta & 3;
              results.push({
                x: wx,
                y: wy,
                z: wz,
                blockId: bid,
                blockName: isLeaf ? 'leaves' : 'log',
                metadata: meta,
                hasDecayFlag: hasFlag,
                species,
                guardPass,
              });
            }
          }
        }
        return {
          center: { x: cx, y: cy, z: cz },
          radius,
          guardPass,
          leaves: results.filter((r) => r.blockName === 'leaves'),
          logs: results.filter((r) => r.blockName === 'log'),
          all: results,
        };
      },
      inspectFluid: (x: number, y: number, z: number) => {
        const blockId = this.blockUpdateWorld.getBlock(x, y, z);
        const metadata = this.blockUpdateWorld.getBlockMetadata(x, y, z);
        const flow = computeFluidFlowVector({
          getBlock: (wx, wy, wz) => this.blockUpdateWorld.getBlock(wx, wy, wz),
          getMetadata: (wx, wy, wz) => this.blockUpdateWorld.getBlockMetadata(wx, wy, wz),
          isSolid: (id) => blockRegistry.getById(id)?.solid ?? false,
        }, x, y, z, blockId);
        const isWater = blockId === 8 || blockId === 9;
        const isLava = blockId === 10 || blockId === 11;
        const moving = Math.hypot(flow.x, flow.z) > 1e-6;
        const textureSelector = isWater
          ? (isFallingFluid(metadata) || moving || blockId === 8 ? 'WaterFlow' : 'WaterStill')
          : isLava
            ? (isFallingFluid(metadata) || moving || blockId === 10 ? 'LavaFlow' : 'LavaStill')
            : 'None';
        return {
          blockId,
          metadata,
          flowLevel: getFluidLevel(metadata),
          falling: isFallingFluid(metadata),
          flow,
          surfaceHeight: fluidSurfaceHeight(metadata),
          textureSelector,
          currentFrames: this.fluidAnimationSystem.getDebugInfo(),
        };
      },
    };
  }

  /**
   * Register a system to receive update(deltaSeconds) each frame.
   * Core systems are wired explicitly; use this for future systems.
   */
  public register(system: IUpdatable): void {
    if (this.updatables.includes(system)) {
      return;
    }

    this.updatables.push(system);
  }

  public unregister(system: IUpdatable): void {
    const index = this.updatables.indexOf(system);

    if (index !== -1) {
      this.updatables.splice(index, 1);
    }
  }

  public start(): void {
    if (this.running) {
      return;
    }

    document.body.appendChild(this.renderer.domElement);
    this.debugOverlay.mount();
    this.input.start();
    this.renderer.start();
    this.running = true;
    this.lastFrameTimeMs = null;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  public stop(): void {
    if (!this.running) {
      return;
    }

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.lastFrameTimeMs = null;
    this.renderer.stop();
    this.input.stop();
    this.debugOverlay.dispose();
    this.blockHighlight.dispose();
    this.chunkStreamer.dispose();
    this.fallingBlockManager.dispose();
    this.lightningRenderer.dispose();
    this.rainSplashRenderer.dispose();
    this.precipitationRenderer.dispose();
    this.cloudRenderer.dispose();
    this.skyRenderer.dispose();
    this.chunkRenderer.dispose();
    this.fluidAnimationSystem.dispose();
    this.fireAnimationSystem.dispose();
    this.atlas.dispose();
    this.chunkManager.clear();
    this.renderer.domElement.remove();
    this.running = false;
  }

  /**
   * Frame order:
   * 1. Begin input frame
   * 2. Toggle debug systems (F3/F4/F6/F7) + time controls
   * 3. Advance world time
   * 4. Update camera look
   * 5. Read movement input (player wish velocity + jump) — only when not in no-clip
   * 6. Update player physics / no-clip movement
   * 7. Move camera to player eye position
   * 8. Update sky/celestials and apply global skylight subtraction
   * 9. Stream chunks
   * 10. Update interaction (raycast + break/place)
   * 11. Rebuild dirty meshes (terrain + water)
   * 12. Compute/apply fog from the current camera eye environment
   * 13. Update block highlight
   * 14. Update debug overlay stats
   * 15. Render (terrain, then water, then debug overlay is plain DOM
   *     drawn by the browser compositor, not part of the WebGL pass)
   *
   * Optional registered systems (see register()) run just before rendering,
   * after all core systems above.
   */
  private tick = (timeMs: number): void => {
    this.animationFrameId = requestAnimationFrame(this.tick);
    this.performanceProfiler.beginFrame();
    this.performanceProfiler.beginUpdate();

    const deltaSeconds =
      this.lastFrameTimeMs === null
        ? 0
        : Math.min((timeMs - this.lastFrameTimeMs) / 1000, MAX_DELTA_SECONDS);
    this.lastFrameTimeMs = timeMs;

    // 1. Begin input frame
    this.input.beginFrame();

    // 2. Toggle debug systems
    if (this.input.isDebugKeyJustPressed('F2')) {
      this.blockTestGrid.generate(this.player.position.x, this.player.position.z);
    }

    if (this.input.isDebugKeyJustPressed('F3')) {
      this.debugOverlay.toggle();
    }

    if (this.input.isDebugKeyJustPressed('F4')) {
      this.rawLightDebugMode = !this.rawLightDebugMode;
      if (this.rawLightDebugMode) {
        this.ambientOcclusionDebugMode = false;
        this.chunkRenderer.setAmbientOcclusionDebugMode(false);
      }
      this.chunkRenderer.setRawLightDebugMode(this.rawLightDebugMode);
    }

    if (this.input.isDebugKeyJustPressed('F7')) {
      this.ambientOcclusionDebugMode = !this.ambientOcclusionDebugMode;
      if (this.ambientOcclusionDebugMode) {
        this.rawLightDebugMode = false;
        this.chunkRenderer.setRawLightDebugMode(false);
      }
      this.chunkRenderer.setAmbientOcclusionDebugMode(this.ambientOcclusionDebugMode);
    }

    if (this.input.isDebugKeyJustPressed('F6')) {
      this.noClipEnabled = !this.noClipEnabled;
      // Reset velocity/grounded state on every transition so re-enabling
      // normal physics (or starting no-clip mid-fall/mid-jump) never
      // carries over a stale velocity into the new mode.
      this.debugController.resetPhysicsState();
    }

    // Stage 18 weather debug controls.
    if (this.input.isDebugKeyJustPressed('F5')) {
      this.weatherController.setAuto();
    }
    if (this.input.isDebugKeyJustPressed('F8')) {
      this.weatherController.forceMode('clear');
    }
    if (this.input.isDebugKeyJustPressed('F9')) {
      this.weatherController.forceMode('rain');
    }
    if (this.input.isDebugKeyJustPressed('F10')) {
      this.weatherController.forceMode('thunder');
    }

    // Basic time controls.
    if (this.input.isKeyJustPressed('ArrowLeft')) {
      this.worldTime.addTicks(-1000);
    }
    if (this.input.isKeyJustPressed('ArrowRight')) {
      this.worldTime.addTicks(1000);
    }
    if (this.input.isKeyJustPressed('ArrowUp')) {
      this.worldTime.setDay();
    }
    if (this.input.isKeyJustPressed('ArrowDown')) {
      this.worldTime.setNight();
    }

    // 3. Advance world time and world block-tick infrastructure.
    this.worldTime.update(deltaSeconds);
    this.worldTickScheduler.update(deltaSeconds);
    this.fallingBlockManager.update(deltaSeconds);
    this.worldEventQueue.drainNoop();
    this.fluidAnimationSystem.update(this.worldTime.getTotalTicks());
    this.fireAnimationSystem.update(this.worldTime.getTotalTicks());

    // 4. Update camera look
    this.cameraController.update();

    // 5-6. Movement + physics: no-clip bypasses PlayerController's wish
    // velocity entirely and moves the player directly, skipping
    // PlayerPhysics (gravity, player collision, block collision) so
    // none of it runs while no-clip is active, per this stage's
    // requirements.
    if (this.noClipEnabled) {
      this.debugController.update(deltaSeconds);
    } else {
      this.playerController.update();
      this.playerPhysics.update(this.player, deltaSeconds);
    }

    // 7. Move camera to the player's eye position
    const camera = this.renderer.camera;
    camera.position.set(
      this.player.position.x,
      this.player.getEyeY(),
      this.player.position.z,
    );

    // 7b. Stage 18: advance weather simulation. Renderer-independent;
    //     only produces a WeatherState the rest of the frame reads from.
    this.weatherController.update(deltaSeconds);
    const weatherState = this.weatherController.getState();

    // 8. Update camera-centered sky and global skylight darkening.
    //    Stage 18: SkyColorController's own getCloudColor still runs
    //    for cloud vertex-colour recompute; the SHARED atmospheric
    //    state we build immediately after is what all other systems
    //    (fog, precipitation, celestial fade) consume. We preview the
    //    weather fade values here (cheap, no colour math) so the sky
    //    renderer can pass them into CelestialRenderer.update in a
    //    single pass.
    const previewFade = previewWeatherFade(
      weatherState.getRainStrength(weatherState.partialTick),
      weatherState.getThunderStrength(weatherState.partialTick),
    );
    // The SkyRenderState returned here is used only for the F3 overlay
    // (via SkyRenderer.getCurrentState); fog and atmos now read from
    // the underlying SkyColorState via getCurrentColorState().
    this.skyRenderer.update(camera, this.worldTime, previewFade);

    // 8b. Build the SHARED atmospheric state once per frame. All
    //     downstream atmospheric renderers read from here — no
    //     independent weather calculation anywhere.
    //     Uses the underlying SkyColorState (which carries the raw
    //     colour channels the weather blend needs), NOT the compact
    //     SkyRenderState used by the F3 overlay.
    const atmos = buildAtmosphericState(
      this.skyRenderer.getCurrentColorState(),
      weatherState,
      this.lightningManager.getState().getFlashStrength(weatherState.partialTick),
    );
    this.skyRenderer.applyAtmosphericState(atmos);

    // Beta weather lighting: calculateSkylightSubtracted and sun brightness
    // are produced by the shared weather math. Lightning flash is visual
    // only and brightens via the same derived atmospheric snapshot.
    this.chunkRenderer.setSkylightSubtracted(atmos.effectiveSkylightSubtracted);
    this.chunkRenderer.setSunBrightnessFactor(atmos.sunBrightnessFactor);

    this.debugStatsCollector.setStormReadout({
      weatherSkylightPenalty: atmos.weatherSkylightPenalty,
      effectiveSkylightSubtracted: atmos.effectiveSkylightSubtracted,
      windX: atmos.wind.x,
      windZ: atmos.wind.z,
    });

    // 8c. Stage 17/18: cloud layer. Weather-blended cloud colour comes
    //     via the shared atmospheric state so it and the sky sphere
    //     agree exactly.
    const cloudColor = {
      r: atmos.cloud.r,
      g: atmos.cloud.g,
      b: atmos.cloud.b,
      hex: atmos.cloud.hex,
    };
    this.cloudRenderer.update(
      camera.position.x,
      camera.position.z,
      deltaSeconds,
      cloudColor,
      atmos.cloudFogStrength,
    );

    // 9. Stream chunks around the player
    const preStreamMeshingStats = this.chunkRenderer.getMeshingStats();
    this.chunkStreamer.update(
      camera.position.x,
      camera.position.z,
      this.cameraController.getYaw(),
      this.player.velocity.x,
      this.player.velocity.z,
      preStreamMeshingStats.queued,
      preStreamMeshingStats.pendingUploads,
    );
    const generationStats = this.chunkStreamer.getGenerationStats();
    const meshingStats = this.chunkRenderer.getMeshingStats();
    this.performanceProfiler.setQueues(
      generationStats.queued,
      meshingStats.queued + meshingStats.pendingUploads,
      generationStats.activeWorkers + meshingStats.activeWorkers,
      generationStats.oldestCriticalAgeMs,
    );
    this.performanceProfiler.setWorkerCounters(
      generationStats.completed,
      generationStats.stale,
      generationStats.errors,
    );

    // 10. Update interaction (raycast targeting + break/place edits)
    this.interactionController.update();

    // 11. Rebuild dirty chunk meshes (budgeted, terrain + water together);
    // picks up this frame's edits
    this.chunkRenderer.update(
      this.performanceProfiler.getSnapshot().frameTimeMs,
      camera.position.x,
      camera.position.z,
    );

    // 11b. Stage 18: precipitation, splash particles, lightning.
    //      Precipitation depends on chunk heightmaps having been
    //      streamed/updated (step 9), so it runs after streaming.
    this.precipitationRenderer.update(
      camera.position.x,
      camera.position.y,
      camera.position.z,
      deltaSeconds,
      atmos,
      this.worldTime,
    );
    this.rainSplashRenderer.update(camera, deltaSeconds, atmos, this.precipitationRenderer);
    this.lightningManager.update(
      deltaSeconds,
      weatherState,
      camera.position.x,
      camera.position.y,
      camera.position.z,
    );
    this.lightningRenderer.update(this.lightningManager.getState());

    // 12. Apply fog from the camera eye position after streaming so any
    // newly entered fluid volume is already loaded when sampled.
    // Stage 17: fog colour now derives from the sky's HORIZON colour
    // (which already equals Beta getFogColor + sunrise tint) so the
    // fog band and horizon band always agree.
    // Stage 18: horizon colour used is the WEATHER-BLENDED one from
    // AtmosphericState, so storms tighten and darken fog automatically.
    const fogState = this.fogController.compute({
      eyeX: camera.position.x,
      eyeY: camera.position.y,
      eyeZ: camera.position.z,
      rawLightDebugMode: this.rawLightDebugMode,
      ambientOcclusionDebugMode: this.ambientOcclusionDebugMode,
      // Stage 18: use WEATHER-BLENDED horizon so fog and sky agree
      // during storms. Base overworld density multiplied by the storm
      // multiplier so rain/thunder pull the horizon closer.
      overworldColorHex: atmos.horizon.hex,
      overworldDensityMultiplier: atmos.fogDensityMultiplier,
    });
    this.renderer.setFogState(fogState);

    // 13. Update the block highlight to match the current target
    this.blockHighlight.setTarget(this.interactionController.getCurrentHit()?.blockPos);

    // 14. Update debug overlay stats. Frame timing is recorded every
    // frame (so FPS smoothing stays accurate even while the overlay is
    // hidden); the full stats snapshot (including a climate/biome
    // sample) is only computed while the overlay is actually visible.
    this.debugStatsCollector.recordFrame(deltaSeconds);
    if (this.debugOverlay.isVisible()) {
      this.debugOverlay.render(this.debugStatsCollector.collect(this.noClipEnabled));
    }

    // Optional registered systems, before rendering.
    for (const system of this.updatables) {
      system.update(deltaSeconds);
    }

    this.performanceProfiler.recordMeshUpload(this.chunkRenderer.getMeshUploadsThisFrame());
    this.performanceProfiler.setApproximateGeometryMemoryMb(
      this.chunkRenderer.getApproximateGeometryMemoryBytes() / (1024 * 1024),
    );
    this.performanceProfiler.endUpdate();

    // 15. Render terrain + water (both drawn in the one WebGL pass; the
    // debug overlay is a separate plain-HTML element composited by the
    // browser on top, not part of this render call).
    this.performanceProfiler.beginRender();
    this.renderer.render();
    this.performanceProfiler.endRender();
    this.performanceProfiler.endFrame();
  };
}
