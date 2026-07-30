import { SignManager } from '../sign/SignManager';
import { SignUi } from '../sign/SignUi';
import { SignController } from '../sign/SignController';
import { SignTextRenderer } from '../sign/SignTextRenderer';
import { registerSignBehaviour } from '../world/behaviours/SignBehaviour';
import { resolveBlockDrops } from '../entities/items/BlockDropResolver';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { CameraController } from '../camera/CameraController';
import { Input } from '../input/Input';
import { Player } from '../player/Player';
import { DEFAULT_ITEM_DEFINITIONS } from '../items/ItemDefinitionRegistry';
import { GameMode } from '../player/GameMode';
import type { GameSettings } from '../settings/GameSettings';
import { normalizeRenderDistance } from '../settings/RenderDistance';
import { resolveMusicContext, type AudioManager, type MusicContext } from '../audio/AudioManager';
import { PlayerController } from '../player/PlayerController';
import { InteractionController } from '../player/InteractionController';
import { PlayerPhysics } from '../physics/PlayerPhysics';
import { BlockHighlight } from '../rendering/BlockHighlight';
import { DestroyOverlayRenderer } from '../rendering/DestroyOverlayRenderer';
import { ItemTextureAtlas } from '../assets/ItemTextureAtlas';
import { ItemEntityManager } from '../entities/items/ItemEntityManager';
import { EntityManager } from '../entities/core/EntityManager';
import { createDefaultEntityTypeRegistry } from '../entities/core/EntityType';
import { registerEntityTypes } from '../entities/registerEntityTypes';
import { JavaRandom } from '../world/generation/random/JavaRandom';
import { NaturalMobSpawner } from '../entities/spawning/NaturalMobSpawner';
import { AnimalInteractionService } from '../entities/interactions/AnimalInteractionService';
import { ExplosionService } from '../entities/explosion/ExplosionService';
import { PlayerSurvivalController } from '../player/PlayerSurvivalController';
import { PlayerDeathController } from '../player/PlayerDeathController';
import { RespawnController } from '../player/RespawnController';
import { DeathScreen } from '../player/DeathScreen';
import { CameraHurtController } from '../player/CameraHurtController';
import { HudRenderer } from '../player/HudRenderer';
import { FoodUseController } from '../player/FoodUseController';
import { SprintFovController } from '../player/SprintFovController';
import type { EntityTextureAssets } from '../assets/EntityTextureAssets';
import { SimpleEntityParticleSink } from '../entities/particles/EntityParticleSink';
import { Inventory } from '../inventory/Inventory';
import type { ItemStack } from '../inventory/ItemStack';
import { InventorySerializer } from '../inventory/InventorySerializer';
import { HotbarHudRenderer } from '../inventory/HotbarHudRenderer';
import { InventoryUi } from '../inventory/InventoryUi';
import { InventoryTooltip } from '../inventory/InventoryTooltip';
import { ChestManager } from '../chest/ChestManager';
import { takeGeneratedFeatures } from '../world/generation/decoration/GeneratedFeaturesRegistry';
import { applyDungeonFeaturesToRuntime } from '../world/generation/decoration/DungeonRuntimeApplier';
import { ChestController } from '../chest/ChestController';
import { ChestUi } from '../chest/ChestUi';
import { ChestRenderer } from '../chest/ChestRenderer';
import { CursorHeldItemRenderer } from '../inventory/CursorHeldItemRenderer';
import { InventoryController } from '../inventory/InventoryController';
import { InventoryInputController } from '../inventory/InventoryInputController';
import { CreativeInventoryUi } from '../inventory/CreativeInventoryUi';
import { CreativeInventoryController } from '../inventory/CreativeInventoryController';
import { RecipeRegistry } from '../crafting/RecipeRegistry';
import { registerDefaultRecipes } from '../crafting/registerDefaultRecipes';
import { CraftingTableUi } from '../crafting/CraftingTableUi';
import { CraftingTableController } from '../crafting/CraftingTableController';
import { CraftingTableInputController } from '../crafting/CraftingTableInputController';
import { MenuInputRouter } from '../input/MenuInputRouter';
import { ContextMenuSuppressor } from '../input/ContextMenuSuppressor';
import { FurnaceManager } from '../furnace/FurnaceManager';
import { SmeltingRegistry } from '../furnace/SmeltingRegistry';
import { FuelRegistry } from '../furnace/FuelRegistry';
import { registerDefaultSmeltingAndFuels } from '../furnace/registerDefaultSmeltingAndFuels';
import { FurnaceUi } from '../furnace/FurnaceUi';
import { FurnaceController } from '../furnace/FurnaceController';
import { FurnaceInputController } from '../furnace/FurnaceInputController';
import { BlockIds, type BlockId } from '../blocks/BlockId';
import { classifyItemRender } from '../inventory/ItemRenderClassifier';
import { BlockItemModelBuilder } from '../inventory/BlockItemModelBuilder';
import { ChunkRenderer, attachEntityLighting } from '../rendering/ChunkRenderer';
import { AnimatedIconController } from '../inventory/AnimatedIconController';
import { EntityLightingUpdater } from '../rendering/EntityLightingUpdater';
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
import { RedstonePowerEngine } from '../world/redstone/RedstonePowerEngine';
import { registerFluidBehaviours } from '../world/fluid/FluidBehaviour';
import { registerPlantBehaviours } from '../world/behaviours/PlantBehaviours';
import { registerSupportBehaviours } from '../world/behaviours/SupportBehaviours';
import { registerFireBehaviour } from '../world/behaviours/FireBehaviour';
import { registerSnowIceBehaviours } from '../world/behaviours/registerSnowIceBehaviours';
import { registerPortalBehaviour } from '../world/behaviours/PortalBehaviour';
import { PrecipitationSimulator } from '../world/weather/PrecipitationSimulator';
import { registerFallingBlockBehaviours } from '../world/behaviours/FallingBlockBehaviour';
import { registerLeafBehaviour } from '../world/behaviours/LeafBehaviour';
import { registerGrassBehaviour } from '../world/behaviours/GrassBehaviour';
import { registerLogBehaviour } from '../world/behaviours/LogBehaviour';
import { registerChestBehaviour } from '../world/behaviours/ChestBehaviour';
import { registerDoorBehaviour } from '../world/behaviours/DoorBehaviour';
import { registerTrapdoorBehaviour } from '../world/behaviours/TrapdoorBehaviour';
import { registerLadderBehaviour } from '../world/behaviours/LadderBehaviour';
import { registerPressurePlateBehaviour } from '../world/behaviours/PressurePlateBehaviour';
import { registerButtonBehaviour } from '../world/behaviours/ButtonBehaviour';
import { registerLeverBehaviour } from '../world/behaviours/LeverBehaviour';
import { registerRedstoneWireBehaviour } from '../world/behaviours/RedstoneWireBehaviour';
import { registerRedstoneTorchBehaviour } from '../world/behaviours/RedstoneTorchBehaviour';
import { registerRedstoneRepeaterBehaviour } from '../world/behaviours/RedstoneRepeaterBehaviour.ts';
import { registerNoteBlockBehaviour } from '../world/behaviours/NoteBlockBehaviour';
import { registerPistonBehaviour } from '../world/behaviours/PistonBaseBehaviour';
import { registerTntBehaviour } from '../world/behaviours/TntBehaviour';
import { registerPoweredRailBehaviour } from '../world/behaviours/PoweredRailBehaviour';
import { registerRailBehaviour } from '../world/behaviours/RailBehaviour';
import { SlabBehaviour } from '../world/behaviours/SlabBehaviour';
import { registerShapedBlockBehaviours } from '../world/behaviours/ShapedBlockBehaviours';
import { FallingBlockManager } from '../world/entities/FallingBlockManager';
import { FluidAnimationSystem } from '../rendering/fluid/FluidAnimationSystem';
import { FireAnimationSystem } from '../rendering/fire/FireAnimationSystem';
import { PortalAnimationSystem } from '../rendering/portal/PortalAnimationSystem';
import { PortalParticleSystem } from '../rendering/portal/PortalParticleSystem';
import { PortalTravelState } from '../world/portal/PortalTravelState';
import { isInsidePortal } from '../world/portal/PortalContact';
import { PortalIndex, scanChunkForPortals, PORTAL_INDEX_RECORD_KEY } from '../world/portal/PortalIndex';
import { portalAxisAt } from '../world/portal/PortalFrame';
import {
  DimensionTransition,
  TRANSITION_CRITICAL_RADIUS,
  criticalChunkCount,
} from '../world/dimension/DimensionTransition';
import { Teleporter, PORTAL_BUILD_MIN_Y, PORTAL_BUILD_MAX_Y, PORTAL_SEARCH_RADIUS } from '../world/portal/Teleporter';
import { WorldEventQueue } from '../world/events/WorldEventQueue';
import { ChunkStreamer } from '../world/ChunkStreamer';
import type { WorldGenerator } from '../world/WorldGenerator';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { DimensionRegistry, convertCoordinate } from '../world/dimension/DimensionRegistry';
import { OVERWORLD_DIMENSION } from '../world/dimension/overworldDimension';
import { NETHER_DIMENSION } from '../world/dimension/netherDimension';
import { DIMENSION_NETHER, DIMENSION_OVERWORLD, type DimensionId } from '../world/dimension/DimensionId';
import { dimensionScopedKey } from '../world/dimension/dimensionKeys';
import type { DimensionDefinition } from '../world/dimension/DimensionDefinition';
import { LightEngine } from '../world/generation/lighting/LightEngine';
import { ClimateSampler } from '../world/generation/climate/ClimateSampler';
import type { HostileMobKind, HostileSpawnEntry, PassiveMobKind, PassiveSpawnEntry } from '../world/generation/climate/biomes';
import { WeatherController } from '../world/weather/WeatherController';
import { PrecipitationSimulator as _UnusedPrecipitationSimulator } from '../world/weather/PrecipitationSimulator';
import { PrecipitationRenderer } from '../rendering/weather/PrecipitationRenderer';
import { RainSplashRenderer } from '../rendering/weather/RainSplashRenderer';
import { LightningRenderer } from '../rendering/weather/LightningRenderer';
import { LightningManager } from '../world/weather/LightningManager';
import { buildAtmosphericState, previewWeatherFade } from '../rendering/AtmosphericState';
import { DebugOverlay } from '../debug/DebugOverlay';
import { DebugStatsCollector } from '../debug/DebugStatsCollector';
import { PerformanceProfiler } from '../debug/PerformanceProfiler';
import { WorkerValidationHarness } from '../debug/WorkerValidationHarness';
import type { IUpdatable } from './IUpdatable';
import { WorldPersistenceService, WRITE_PRIORITY_BACKGROUND, WRITE_PRIORITY_FORCED, type ServiceDiagnostics } from '../persistence2/WorldPersistenceService';
import type { RecordCorruptionError } from '../persistence2/codec/PersistenceError';
import type { PersistenceRiskSnapshot } from '../persistence2/PersistenceRisk';
import { GENERATOR_VERSION, SAVE_VERSION, type WorldMetadata } from '../world/WorldMetadata';
import { PlayerModel } from '../player/PlayerModel';
import { PlayerAnimator } from '../player/PlayerAnimator';
import { FirstPersonArmRenderer } from '../rendering/FirstPersonArmRenderer';
import { MinecartRenderSystem } from '../rendering/MinecartRenderer';
import { MinecartEntity } from '../entities/MinecartEntity';
import { BoatRenderer } from '../rendering/BoatRenderer';
import { registerBedBehaviour } from '../world/behaviours/BedBehaviour';
import { SleepController, sleepPoseFor, type WakeReason } from '../player/SleepController';
import { SleepOverlayRenderer } from '../player/SleepOverlayRenderer';
import { UnderwaterOverlayRenderer, isCameraSubmerged } from '../rendering/UnderwaterOverlayRenderer';
import { collectAmbientSounds } from '../audio/AmbientBlockAudio';
import { FIRST_PERSON_ROD_TIP_OFFSET } from '../player/PlayerConstants.ts';

/** Scratch vectors for the fishing-line anchor; avoids per-frame allocation. */
const FISHING_TIP_LOCAL = new THREE.Vector3();
const FISHING_TIP_WORLD = new THREE.Vector3();
import { FishingLineRenderer } from '../rendering/FishingLineRenderer';
import { BED_FOOT_TO_HEAD } from '../blocks/shapes/BlockShapes';
import { FirstPersonHeldItemRenderer } from '../rendering/FirstPersonHeldItemRenderer.ts';
import { ThirdPersonHeldItemRenderer } from '../rendering/ThirdPersonHeldItemRenderer.ts';
import { FirstPersonMotionController } from '../player/FirstPersonMotionController';
import { CameraModeController, CameraMode } from '../camera/CameraModeController';
import * as THREE from 'three';
import { PlayerSkinManager } from '../player/PlayerSkinManager';
import type { ArmourTextureAssets } from '../assets/ArmourTextureAssets';
import { ArmourGeometryCache } from '../rendering/armour/ArmourGeometryCache';
import { ArmourMaterialCache } from '../rendering/armour/ArmourMaterialCache';
import { PlayerArmourRenderer } from '../player/PlayerArmourRenderer';
import {
  FIRST_PERSON_HELD_BLOCK_X,
  FIRST_PERSON_HELD_BLOCK_Y,
  FIRST_PERSON_HELD_BLOCK_Z,
  FIRST_PERSON_HELD_BLOCK_PITCH,
  FIRST_PERSON_HELD_BLOCK_YAW,
  FIRST_PERSON_HELD_BLOCK_ROLL,
  FIRST_PERSON_HELD_BLOCK_SCALE,
  THIRD_PERSON_HELD_BLOCK_X,
  THIRD_PERSON_HELD_BLOCK_Y,
  THIRD_PERSON_HELD_BLOCK_Z,
  THIRD_PERSON_HELD_BLOCK_PITCH,
  THIRD_PERSON_HELD_BLOCK_YAW,
  THIRD_PERSON_HELD_BLOCK_ROLL,
  THIRD_PERSON_HELD_BLOCK_SCALE,
  FIRST_PERSON_CAMERA_OFFSET_Y
} from '../player/PlayerConstants';
import { measureSaveSync, recordSaveEvent } from '../persistence2/debug/SavePipelineTrace';
import { installEngineDebugHooks } from './EngineDebugHooks';
import type { Chunk } from '../world/Chunk';

interface EntityLightingUniforms {
  uSkylightSubtracted: { value: number };
  uSunBrightnessFactor: { value: number };
  uTextureMinBrightness: { value: number };
  uDynamicLightingEnabled: { value: number };
  uStaticSkyLight: { value: number };
  uStaticBlockLight: { value: number };
  uStaticAoFactor: { value: number };
  uStaticFaceBrightness: { value: number };
}

const MAX_DELTA_SECONDS = 0.1;
const METADATA_AUTOSAVE_MS = 30_000;
const CHUNK_SAVE_PUMP_INTERVAL_MS = 500;
const CHUNK_SAVE_PUMP_MAX_CHUNKS = 2;
const RAIN_COVER_OFFSETS = [-2, 0, 2] as const;

/** Autosave diagnostics (correction 7). */
interface AutosaveStats {
  lastPumpMs: number;
  lastSelected: number;
  lastSkippedInFlight: number;
  lastDirtyCount: number;
  lastSuccessMs: number;
  lastFailureMs: number;
  lastFailure: string | null;
}

function readProfilerEnabledSetting(): boolean {
  try {
    return window.localStorage.getItem('minecraft.profiler.enabled') !== 'false';
  } catch {
    return true;
  }
}

const GEOMETRY_MEMORY_SAMPLE_MS = 250;

/** Radius (blocks) around the camera scanned for portal ambience/particles. */
const PORTAL_AMBIENCE_RADIUS = 8;

/**
 * Gain for the looping portal ambience.
 *
 * The raw asset is mixed loud enough to dominate everything else near a
 * portal, so it is attenuated here in the sound EVENT rather than by editing
 * portal.ogg. Only the ambience is reduced: portal.trigger and portal.travel
 * are one-shots tied to a deliberate player action and stay at full volume.
 */
const PORTAL_AMBIENCE_VOLUME = 0.15;

/**
 * Maps a dimension definition's Beta entity id to an implemented spawner kind.
 *
 * The Nether's Ghast and PigZombie are now implemented, so the Nether roster is
 * authoritative (PigZombie + Ghast only); any still-unimplemented id remains
 * filtered out rather than attempted and failing.
 */
const HOSTILE_KIND_BY_ENTITY_ID: Readonly<Record<string, HostileMobKind | undefined>> = {
  Zombie: 'zombie',
  Skeleton: 'skeleton',
  Spider: 'spider',
  Creeper: 'creeper',
  PigZombie: 'pigzombie',
  Ghast: 'ghast',
};

const PASSIVE_KIND_BY_ENTITY_ID: Readonly<Record<string, PassiveMobKind | undefined>> = {
  Pig: 'pig',
  Cow: 'cow',
  Sheep: 'sheep',
  Chicken: 'chicken',
};

/**
 * Budget for the destination half of a dimension switch.
 *
 * Each stage is bounded separately so one slow stage cannot consume the whole
 * allowance and starve the ones after it. Exceeding a budget aborts the
 * transition rather than leaving the player frozen behind the loading screen.
 */
const DIMENSION_CHUNK_LOAD_TIMEOUT_MS = 20_000;
const DIMENSION_MESH_SETTLE_TIMEOUT_MS = 8_000;
const DIMENSION_TRANSITION_POLL_MS = 16;

/** How long to wait for one indexed portal anchor's chunk to stream in. */
const PORTAL_ANCHOR_LOAD_TIMEOUT_MS = 4_000;

export class Engine {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly cameraController: CameraController;
  private readonly player: Player;
  private readonly playerController: PlayerController;
  private readonly playerPhysics: PlayerPhysics;
  private readonly playerSurvivalController:PlayerSurvivalController;
  private readonly playerDeathController:PlayerDeathController;
  private readonly respawnController:RespawnController;
  private readonly deathScreen:DeathScreen;
  private readonly cameraHurtController=new CameraHurtController();
  private readonly sprintFovController=new SprintFovController();
  private readonly foodUseController:FoodUseController;
  private readonly interactionController: InteractionController;
  private readonly blockHighlight: BlockHighlight;
  private readonly destroyOverlayRenderer: DestroyOverlayRenderer;
  private readonly itemAtlas: ItemTextureAtlas;
  private readonly animatedIcons: AnimatedIconController;
  private readonly entityLighting: EntityLightingUpdater;
  /** World spawn, used to aim the compass needle. */
  private readonly worldSpawnPoint: { x: number; y: number; z: number };
  private readonly itemEntityManager: ItemEntityManager;
  private readonly entityManager: EntityManager;
  private readonly naturalMobSpawner: NaturalMobSpawner;
  private readonly explosionService: ExplosionService;
  private readonly entityParticles: SimpleEntityParticleSink;
  private readonly minecartRenderSystem: MinecartRenderSystem;
  private readonly boatRenderer: BoatRenderer;
  private simulationAccumulatorTicks = 0;
  /** Beta distanceWalkedModified and nextStepDistance equivalents. */
  private playerStepDistance = 0;
  private playerNextStepDistance = 1;
  private rainCoverSampleSeconds = 0;
  private simulationTick = 0;
  private readonly inventory: Inventory;
  private readonly hotbarHudRenderer:HotbarHudRenderer;
  private readonly hudRenderer:HudRenderer;
  private readonly inventoryUi: InventoryUi;
  private readonly inventoryTooltip: InventoryTooltip;
  private readonly cursorHeldRenderer: CursorHeldItemRenderer;
  private readonly inventoryController: InventoryController;
  private readonly inventoryInputController: InventoryInputController;
  private readonly creativeInventoryUi: CreativeInventoryUi;
  private readonly creativeInventoryController: CreativeInventoryController;
  private readonly recipeRegistry: RecipeRegistry;
  private readonly craftingTableUi: CraftingTableUi;
  private readonly craftingTableController: CraftingTableController;
  private readonly craftingTableInputController: CraftingTableInputController;
  private readonly furnaceManager: FurnaceManager;
  private readonly smeltingRegistry: SmeltingRegistry;
  private readonly fuelRegistry: FuelRegistry;
  private readonly furnaceUi: FurnaceUi;
  private readonly furnaceController: FurnaceController;
  private readonly furnaceInputController: FurnaceInputController;
  private readonly chestManager: ChestManager;
  private readonly chestUi: ChestUi;
  private readonly chestController: ChestController;
  private readonly chestRenderer: ChestRenderer;
  private readonly signManager: SignManager;
  private readonly signUi: SignUi;
  private readonly signController: SignController;
  private readonly signTextRenderer: SignTextRenderer;
  private readonly menuInputRouter: MenuInputRouter;
  private readonly contextMenuSuppressor: ContextMenuSuppressor;
  private selectedSlot = 0;
  private readonly itemHeldMaterial: THREE.MeshBasicMaterial;
  private readonly atlas: TextureAtlas;
  private readonly chunkManager: ChunkManager;
  /** Every dimension the engine knows about; extensible by future registrations. */
  private readonly dimensions = new DimensionRegistry();
  /** The dimension currently being simulated and rendered. */
  private activeDimensionId: DimensionId = DIMENSION_OVERWORLD;
  /**
   * Bumped whenever a world context is (re)created, so an in-flight worker
   * result from a previous visit to a dimension can be rejected.
   */
  private contextGeneration = 1;
  private worldGenerator: WorldGenerator;
  /** World seed, retained so a dimension switch can build the new generator. */
  private readonly worldSeed: bigint;
  private readonly chunkRenderer: ChunkRenderer;
  private readonly fluidAnimationSystem: FluidAnimationSystem;
  private readonly fireAnimationSystem: FireAnimationSystem;
  private readonly portalAnimation = new PortalAnimationSystem();
  private portalParticles: PortalParticleSystem | undefined;
  /** Beta portal charge/cooldown state, ticked at the fixed 20 Hz rate. */
  private readonly portalTravel = new PortalTravelState();
  /** Single owner of any in-flight dimension switch. */
  private readonly dimensionTransition = new DimensionTransition();
  /**
   * Portal anchors for the ACTIVE dimension. Rebuilt on every dimension
   * switch, so an Overworld anchor can never satisfy a Nether search.
   */
  private portalIndex = new PortalIndex();
  /** Last rain strength handed to the audio mixer (diagnostics only). */
  private lastRainAudioStrength = 0;
  private readonly worldEventQueue: WorldEventQueue;
  private readonly chunkStreamer: ChunkStreamer;
  private readonly lightEngine: LightEngine;
  private readonly blockUpdateWorld: BlockUpdateWorld;
  private readonly blockBehaviourRegistry: BlockBehaviourRegistry;
  private readonly fallingBlockManager: FallingBlockManager;
  private readonly worldTickScheduler: WorldTickScheduler;
  private readonly redstonePowerEngine: RedstonePowerEngine;
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

  private readonly debugOverlay: DebugOverlay;
  private readonly debugStatsCollector: DebugStatsCollector;
  private nextGeometryMemorySampleMs = 0;
  private readonly performanceProfiler = new PerformanceProfiler();
  private removeDebugHooks: (() => void) | null = null;
  private readonly activeMinecartAudioLoops = new Set<string>();

  private simulationPaused = false;
  private running = false;
  private animationFrameId: number | null = null;
  private lastFrameTimeMs: number | null = null;
  private lastMetadataAutosaveMs = 0;
  private lastChunkSavePumpMs = 0;
  private deathSavePending=false;
  /** Save-and-Quit quiesce state: gameplay mutations/streaming/autosave/unloads disabled. */
  private quiescing = false;
  /** True while a Save-and-Quit attempt is active (settled or not). */
  private saveExitActive = false;
  /** Autosave is paused after a background write failure until explicitly resumed (correction 7). */
  private autosavePaused = false;
  private lastMetadataJson = '';
  private readonly autosaveStats: AutosaveStats = { lastPumpMs: 0, lastSelected: 0, lastSkippedInFlight: 0, lastDirtyCount: 0, lastSuccessMs: 0, lastFailureMs: 0, lastFailure: null };
  private readonly persistenceRiskListeners = new Set<(snapshot: PersistenceRiskSnapshot) => void>();
  private readonly playerModel: PlayerModel;
  private readonly playerAnimator: PlayerAnimator;
  private readonly armourGeometryCache: ArmourGeometryCache;
  private readonly armourMaterialCache: ArmourMaterialCache;
  private readonly playerArmourRenderer: PlayerArmourRenderer;
  private readonly firstPersonArmRenderer: FirstPersonArmRenderer;
  private readonly firstPersonMotionController: FirstPersonMotionController;
  private readonly heldItemRenderer: FirstPersonHeldItemRenderer;
  private readonly thirdPersonHeldItemRenderer: ThirdPersonHeldItemRenderer;
  private readonly cameraModeController: CameraModeController;

  private readonly skinManager: PlayerSkinManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly heldBlockMaterial: THREE.MeshBasicMaterial;
  private readonly firstPersonHeldBlockMesh: THREE.Mesh;
  private readonly thirdPersonHeldBlockMesh: THREE.Mesh;
  private lastSelectedStackId: number | string | null = null;
  private lastSelectedStackCount = 0;
  private lastSelectedStackEmpty = true;

  private readonly playerModelUniforms: EntityLightingUniforms | undefined;

  public constructor(
    blockRegistry: BlockRegistry,
    atlas: TextureAtlas,
    itemAtlas: ItemTextureAtlas,
    private readonly entityTextures: EntityTextureAssets,
    armourTextures: ArmourTextureAssets,
    private readonly persistence: WorldPersistenceService,
    skinManager: PlayerSkinManager,
    private settings: GameSettings,
    private readonly audioManager: AudioManager,
    private readonly onPauseRequested: (() => void) | undefined = undefined,
    private readonly onPersistenceError: ((error: RecordCorruptionError) => void) | undefined = undefined,
    /**
     * Requested dimension switch. The application owns the loading screen and
     * world-context swap; the engine only detects and freezes.
     */
    private readonly onDimensionTransitionRequested:
      ((dimensionId: DimensionId, x: number, y: number, z: number) => void) | undefined = undefined,
  ) {
    const loadedMetadata = this.persistence.getMetadata();
    if (loadedMetadata === null) throw new Error('Engine requires the world metadata to be loaded before construction');
    const metadata = loadedMetadata;
    const worldSeed = BigInt(metadata.seed);
    this.atlas = atlas;
    this.itemAtlas = itemAtlas;
    this.animatedIcons = new AnimatedIconController(itemAtlas);
    this.blockRegistry = blockRegistry;
    this.skinManager = skinManager;
    this.armourGeometryCache = new ArmourGeometryCache(skinManager);
    this.armourMaterialCache = new ArmourMaterialCache(armourTextures);
    this.chunkManager = new ChunkManager();
    // Dimension behaviour is configuration consumed by generic systems, not
    // `if (dimension === -1)` branches. The active dimension supplies the
    // generator, lighting rules, sky/weather policy and music profile.
    this.dimensions.register(OVERWORLD_DIMENSION);
    this.dimensions.register(NETHER_DIMENSION);
    this.activeDimensionId = metadata.playerDimension ?? DIMENSION_OVERWORLD;
    if (!this.dimensions.has(this.activeDimensionId)) this.activeDimensionId = DIMENSION_OVERWORLD;
    // The persistence service namespaces chunk/record keys by its `dimension`
    // field, which defaults to the Overworld and is otherwise only re-pointed
    // during a portal switch. A world saved in the Nether must re-point it HERE,
    // before the streamer issues its first chunk reads — otherwise every Nether
    // (x,z) read/write lands in the Overworld key namespace and the two
    // dimensions collide (Nether terrain overwriting/reading Overworld chunks).
    this.persistence.setDimension(this.activeDimensionId);
    this.worldSeed = worldSeed;
    this.worldGenerator = this.activeDimension.createGenerator(worldSeed);
    this.worldTime = new WorldTime();
    this.worldTime.setTotalTicks(metadata.timeTicks);

    this.renderer = new Renderer();

    this.input = new Input(this.renderer.domElement, this.settings.controls.bindings);
    this.input.setPointerLockLostHandler(() => this.handlePointerLockLost());
    this.cameraController = new CameraController(
      this.renderer.camera,
      this.input,
      this.settings,
    );
    this.cameraController.setRotation(metadata.player.yaw, metadata.player.pitch);

    this.player=new Player(metadata.player.x,metadata.player.y,metadata.player.z);this.player.setDamageListener((event)=>{if(!event.fullHit)return;this.audioManager.play({type:'player.damage',kind:'hurt',x:this.player.position.x,y:this.player.position.y,z:this.player.position.z});});this.player.viewBobbingEnabled=this.settings.video.viewBobbing;this.renderer.setAaMode(this.settings.video.aaMode);this.renderer.setRenderScale(this.settings.video.renderScale);this.player.setGameMode(metadata.gameMode ?? GameMode.Survival);this.player.setMaxHealth(metadata.playerHealth?.maxHealth??20);this.player.setHealth(metadata.playerHealth?.health??20);this.player.recentHealth=this.player.health;this.player.setFoodState(metadata.playerFood?.hunger??20,metadata.playerFood?.saturation??5,metadata.playerFood?.exhaustion??0);
    this.playerController = new PlayerController(
      this.input,
      this.cameraController,
      this.player,
    );
    this.blockBehaviourRegistry = new BlockBehaviourRegistry();

    this.lightEngine = new LightEngine(this.chunkManager, blockRegistry);
    this.blockUpdateWorld = new BlockUpdateWorld(this.chunkManager, blockRegistry, this.lightEngine);
    this.redstonePowerEngine = new RedstonePowerEngine(this.blockUpdateWorld, blockRegistry, this.blockBehaviourRegistry);
    this.blockUpdateWorld.setPowerEngine(this.redstonePowerEngine);
    this.blockUpdateWorld.setBlockSoundSink((id, x, y, z, pitch, volume) => this.audioManager.play({ type: 'block.action', id, x, y, z, ...(pitch === undefined ? {} : { pitch }), ...(volume === undefined ? {} : { volume }) }));
    this.playerPhysics=new PlayerPhysics(blockRegistry,this.blockBehaviourRegistry,this.blockUpdateWorld);
    this.playerSurvivalController=new PlayerSurvivalController(this.player,this.blockUpdateWorld,blockRegistry,()=>metadata.difficulty);
    this.playerSurvivalController.setLandingSoundListener((event)=>{this.audioManager.play({type:'step',material:event.material,x:event.x,y:event.y,z:event.z,volume:event.volume,pitch:event.pitch});});
    this.cameraModeController = new CameraModeController(this.input, this.blockUpdateWorld, blockRegistry);
    this.playerModel = new PlayerModel();
    this.playerAnimator = new PlayerAnimator();
    this.firstPersonArmRenderer = new FirstPersonArmRenderer();
    this.firstPersonMotionController = new FirstPersonMotionController();

    this.playerModel.updateSkin(this.skinManager);
    this.firstPersonArmRenderer.updateSkin(this.skinManager);

    this.heldBlockMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.3,
      fog: false,
    });
    attachEntityLighting(this.heldBlockMaterial);

    this.itemHeldMaterial = new THREE.MeshBasicMaterial({
      map: itemAtlas.texture,
      transparent: true,
      side: THREE.FrontSide,
      alphaTest: 0.1,
    });
    attachEntityLighting(this.itemHeldMaterial);

    const worldRng = new JavaRandom(worldSeed);
    const entityTypeRegistry = createDefaultEntityTypeRegistry();
    registerEntityTypes(entityTypeRegistry);
    this.entityParticles = new SimpleEntityParticleSink(this.renderer.scene);
    this.entityManager = new EntityManager({
      blockRegistry,
      behaviourRegistry: this.blockBehaviourRegistry,
      blockUpdateWorld: this.blockUpdateWorld,
      chunkManager: this.chunkManager,
      scene: this.renderer.scene,
      blockAtlas: this.atlas,
      itemAtlas: this.itemAtlas,
      heldBlockMaterial: this.heldBlockMaterial,
      itemHeldMaterial: this.itemHeldMaterial,
      typeRegistry: entityTypeRegistry,
      rng: worldRng,
      particles: this.entityParticles,
      weather: { isRaining: () => this.weatherController.getState().raining },
      playerPosition: this.player.position,
      playerHeldItemId: () => this.inventory?.getStack(this.interactionController?.getSelectedSlotIndex())?.identity.id,
      player: this.player,
      difficulty: () => metadata.difficulty,
      isDaytime: () => this.worldTime.getTimeOfDayTicks() < 12000,
      skylightSubtracted: () => this.worldTime.getSkylightSubtracted(),
      explode: (source, x, y, z, strength, flaming) => this.explosionService.explode(source, x, y, z, strength, flaming),
      entityTextures: this.entityTextures,
      sounds:this.audioManager,
    });
    this.minecartRenderSystem = new MinecartRenderSystem(this.entityManager, this.renderer.scene, this.entityTextures);
    this.boatRenderer = new BoatRenderer(this.renderer.scene, this.entityTextures.get('boat'));
    this.fishingLine = new FishingLineRenderer(this.renderer.scene);
    this.explosionService = new ExplosionService(this.blockUpdateWorld, blockRegistry, this.entityManager, this.player, worldRng, (x, y, z) => this.audioManager.play({ type: 'random.explode', x, y, z }), (x, y, z) => this.entityParticles.explosion({ x, y, z, width: 1, height: 1 }));

    this.persistence.setEntityHooks({
      serializeChunkEntities: (cx, cz) => this.entityManager.serializeChunkEntities(cx, cz),
      loadChunkEntities: (tags) => this.entityManager.loadChunkEntities(tags),
      hasParkedEntities: (cx, cz) => this.entityManager.hasParkedEntities(cx, cz),
    });
    // Event-driven persistence-risk propagation (correction 8): the service
    // notifies on every persistence state change; the engine owns autosave-failure
    // recovery (correction 7) and re-publishes an aggregated risk snapshot to
    // subscribers (e.g. the DirtyWarningController).
    this.persistence.setChangeListener(() => this.onPersistenceStateChanged());
    this.lastMetadataJson = JSON.stringify(metadata);

    this.playerModelUniforms = this.playerModel.material.userData.dynamicLightingUniforms as EntityLightingUniforms | undefined;

    this.firstPersonHeldBlockMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.heldBlockMaterial);
    this.thirdPersonHeldBlockMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.heldBlockMaterial);

    this.firstPersonHeldBlockMesh.position.set(FIRST_PERSON_HELD_BLOCK_X, FIRST_PERSON_HELD_BLOCK_Y, FIRST_PERSON_HELD_BLOCK_Z);
    this.firstPersonHeldBlockMesh.rotation.set(FIRST_PERSON_HELD_BLOCK_PITCH, FIRST_PERSON_HELD_BLOCK_YAW, FIRST_PERSON_HELD_BLOCK_ROLL);
    this.firstPersonHeldBlockMesh.scale.set(FIRST_PERSON_HELD_BLOCK_SCALE, FIRST_PERSON_HELD_BLOCK_SCALE, FIRST_PERSON_HELD_BLOCK_SCALE);

    this.thirdPersonHeldBlockMesh.position.set(THIRD_PERSON_HELD_BLOCK_X, THIRD_PERSON_HELD_BLOCK_Y, THIRD_PERSON_HELD_BLOCK_Z);
    this.thirdPersonHeldBlockMesh.rotation.set(THIRD_PERSON_HELD_BLOCK_PITCH, THIRD_PERSON_HELD_BLOCK_YAW, THIRD_PERSON_HELD_BLOCK_ROLL);
    this.thirdPersonHeldBlockMesh.scale.set(THIRD_PERSON_HELD_BLOCK_SCALE, THIRD_PERSON_HELD_BLOCK_SCALE, THIRD_PERSON_HELD_BLOCK_SCALE);

    this.firstPersonArmRenderer.armGroup.add(this.firstPersonHeldBlockMesh);
    this.playerModel.rightArmGroup.add(this.thirdPersonHeldBlockMesh);

    this.renderer.scene.add(this.playerModel.root);

    this.worldEventQueue = new WorldEventQueue();
    this.fallingBlockManager = new FallingBlockManager(this.entityManager);
    registerFluidBehaviours(this.blockBehaviourRegistry);
    registerPlantBehaviours(this.blockBehaviourRegistry, blockRegistry);
    registerSupportBehaviours(this.blockBehaviourRegistry, blockRegistry);
    registerDoorBehaviour(this.blockBehaviourRegistry);
    registerTrapdoorBehaviour(this.blockBehaviourRegistry);
    registerLadderBehaviour(this.blockBehaviourRegistry);
    registerPressurePlateBehaviour(this.blockBehaviourRegistry);
    registerButtonBehaviour(this.blockBehaviourRegistry);
    registerLeverBehaviour(this.blockBehaviourRegistry);
    registerRedstoneWireBehaviour(this.blockBehaviourRegistry);
    registerRedstoneTorchBehaviour(this.blockBehaviourRegistry);
    registerRedstoneRepeaterBehaviour(this.blockBehaviourRegistry);
    registerNoteBlockBehaviour(this.blockBehaviourRegistry);
    registerPistonBehaviour(this.blockBehaviourRegistry);
    registerTntBehaviour(this.blockBehaviourRegistry);
    registerRailBehaviour(this.blockBehaviourRegistry);
    registerPoweredRailBehaviour(this.blockBehaviourRegistry);
    this.blockBehaviourRegistry.register(BlockIds.Slab, new SlabBehaviour());
    // Must run after the behaviours above: it layers shared shape bounds onto
    // whatever behaviour each block already has.
    registerShapedBlockBehaviours(this.blockBehaviourRegistry);
    registerBedBehaviour(this.blockBehaviourRegistry, {
      // Beta `World.isDaytime` refuses sleep outside 12541..23458 ticks.
      isNight: () => {
        const time = this.worldTime.getTimeOfDayTicks();
        return time >= 12541 && time <= 23458;
      },
      getPlayerPosition: () => this.player.position,
      isPlayerSleeping: () => this.sleepController.isSleeping(),
      beginSleep: (bedX, bedY, bedZ, direction) => this.beginSleep(bedX, bedY, bedZ, direction),
    });
    this.weatherController = new WeatherController(worldSeed);
    this.weatherController.restore(metadata.weather);
    this.precipitationSimulator = new PrecipitationSimulator(worldSeed);
    registerFireBehaviour(this.blockBehaviourRegistry, blockRegistry, this.weatherController, this.chunkManager);
    registerSnowIceBehaviours(this.blockBehaviourRegistry);
    registerPortalBehaviour(this.blockBehaviourRegistry);
    registerGrassBehaviour(this.blockBehaviourRegistry, blockRegistry);
    registerFallingBlockBehaviours(this.blockBehaviourRegistry, blockRegistry, this.fallingBlockManager);
    registerLeafBehaviour(this.blockBehaviourRegistry);
    registerLogBehaviour(this.blockBehaviourRegistry);

    const randomTickScheduler = new RandomTickScheduler(worldSeed);
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
    this.blockUpdateWorld.setEntityManager(this.entityManager);
    this.blockUpdateWorld.setBehaviourPlayer(this.player);
    this.blockUpdateWorld.setEventQueue(this.worldEventQueue);
    // Keep the portal index in step with every portal block create/destroy.
    this.blockUpdateWorld.setPortalChangeListener((x, _y, z) => this.reindexPortalsAround(x, z));
    this.blockUpdateWorld.setGameTickProvider(() => this.worldTickScheduler.getGameTick());
    this.blockUpdateWorld.setNextIntProvider((bound: number) => randomTickScheduler.nextInt(bound));
    this.persistence.setSimulationTickProvider(() => this.worldTickScheduler.getGameTick());

    this.worldTickScheduler.addGameTickCallback(() => {
      // A dimension without weather runs no precipitation simulation at all,
      // rather than simulating rain that is then hidden. Beta's Nether has no
      // weather, and an inactive system must not keep doing background work.
      if (!this.activeDimension.weather.hasWeather) return;
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

    this.climateSampler = new ClimateSampler(worldSeed);
    this.naturalMobSpawner = new NaturalMobSpawner({
      chunkManager: this.chunkManager,
      entityManager: this.entityManager,
      blockRegistry: this.blockRegistry,
      behaviourRegistry: this.blockBehaviourRegistry,
      world: this.blockUpdateWorld,
      climateSampler: this.climateSampler,
      rng: worldRng,
      player: this.player,
      worldSpawn: metadata.spawn,
      getSkylightSubtracted: () => this.worldTime.getSkylightSubtracted(),
      getDifficulty: () => metadata.difficulty,
      isThundering: () => this.weatherController.getState().thundering,
      // Dimension spawn tables. Returning null means "use the Overworld biome
      // table"; returning a list (possibly empty) overrides it completely.
      // Entries whose entity type is not implemented yet are filtered out, so
      // the Nether's authentic Ghast/PigZombie roster stays recorded in the
      // dimension definition without the spawner trying to construct them.
      getDimensionSpawnEntries: () => this.dimensionHostileSpawnEntries(),
      getDimensionPassiveSpawnEntries: () => this.dimensionPassiveSpawnEntries(),
    });
    this.worldSpawnPoint = metadata.spawn;
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
      worldSeed,
    );
    this.lightningRenderer = new LightningRenderer(this.renderer.scene);

    this.inventory = new Inventory();
    InventorySerializer.deserialize(this.inventory, metadata.inventory, metadata.armour);
    const playerEquipment = this.inventory.getEquipment();
    if (playerEquipment === undefined) throw new Error('Player inventory equipment was not initialized');
    this.player.setEquipment(playerEquipment);
    this.playerArmourRenderer = new PlayerArmourRenderer(
      {
        head: this.playerModel.headGroup,
        body: this.playerModel.bodyGroup,
        rightArm: this.playerModel.rightArmGroup,
        leftArm: this.playerModel.leftArmGroup,
        rightLeg: this.playerModel.rightLegGroup,
        leftLeg: this.playerModel.leftLegGroup,
      },
      playerEquipment,
      this.armourGeometryCache,
      this.armourMaterialCache,
    );
    this.selectedSlot = metadata.selectedHotbarSlot ?? 0;

    this.itemEntityManager = new ItemEntityManager(
      this.entityManager,
      this.inventory,
      blockRegistry,
    );
    playerEquipment.setBreakHandler(() => {
      this.itemEntityManager.emitItemBreak(this.player.position.x, this.player.position.y, this.player.position.z);
    });
    const animalInteractions=new AnimalInteractionService(this.inventory,this.itemEntityManager);
    this.foodUseController=new FoodUseController(this.player,this.inventory,this.input,()=>this.selectedSlot,this.audioManager);
    this.interactionController = new InteractionController(
      this.input,
      this.renderer.camera,
      this.player,
      this.chunkManager,
      blockRegistry,
      this.blockUpdateWorld,
      this.itemEntityManager,
      this.inventory,
      this.blockBehaviourRegistry,
      this.entityManager,
      animalInteractions,
      this.foodUseController,
      (id, x, y, z) => this.audioManager.play({ type: 'block.action', id, x, y, z }),
      (id, x, y, z, volume, pitch) => this.audioManager.play({
        type: 'entity.legacy', id, kind: 'bow', x, y, z, volume, pitch, attenuationDistance: 16,
      }),
    );
    this.blockHighlight = new BlockHighlight(this.renderer.scene);
    this.destroyOverlayRenderer = new DestroyOverlayRenderer(
      this.renderer.scene,
      atlas,
      blockRegistry,
      this.blockUpdateWorld,
    );

    // Built before the held-item renderers so its animated-icon frame source
    // can be shared with them: clock and compass must show the SAME current
    // frame in the hotbar, the inventory, and the player's hand.
    this.hotbarHudRenderer = new HotbarHudRenderer(this.atlas, this.itemAtlas, blockRegistry, this.inventory, this.settings.video.guiScale);
    this.heldItemRenderer = new FirstPersonHeldItemRenderer(
      this.firstPersonArmRenderer,
      this.inventory,
      blockRegistry,
      this.atlas,
      this.itemAtlas,
      this.hotbarHudRenderer.getAnimatedIcons(),
    );
    this.thirdPersonHeldItemRenderer = new ThirdPersonHeldItemRenderer(
      this.playerModel.rightHandAttachment,
      blockRegistry,
      this.atlas,
      this.itemAtlas,
      this.hotbarHudRenderer.getAnimatedIcons(),
    );
    this.firstPersonHeldBlockMesh.visible = false;
    this.thirdPersonHeldBlockMesh.visible = false;
    this.hudRenderer=new HudRenderer(this.hotbarHudRenderer,this.player,playerEquipment);
    this.inventoryUi = new InventoryUi();
    this.inventoryTooltip = new InventoryTooltip();
    this.cursorHeldRenderer = new CursorHeldItemRenderer();
    this.recipeRegistry = new RecipeRegistry();
    registerDefaultRecipes(this.recipeRegistry, blockRegistry, this.hotbarHudRenderer.getSlotContentRenderer()['itemIcons']);

    this.inventoryController = new InventoryController(
      this.inventory,
      this.inventoryUi,
      this.inventoryTooltip,
      this.cursorHeldRenderer,
      this.hotbarHudRenderer.getSlotContentRenderer(),
      this.itemEntityManager,
      this.player,
      this.recipeRegistry
    );
    const displayNameResolver = (stack: { identity: { type: string; id: string | number } }) => {
      if (stack.identity.type === 'item') {
        const item = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
        if (item?.displayName !== undefined) return item.displayName;
        if (item !== undefined) return item.id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      if (stack.identity.type === 'block') {
        const def = blockRegistry.getById(stack.identity.id);
        if (def && def.displayName) return def.displayName;
      }
      return String(stack.identity.id)
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    };
    this.inventoryController.setDisplayNameResolver(displayNameResolver as any);
    this.inventoryInputController = new InventoryInputController(this.inventoryController, this.hotbarHudRenderer.getLayout());
    this.creativeInventoryUi = new CreativeInventoryUi(this.hotbarHudRenderer.getSlotContentRenderer());
    this.creativeInventoryController = new CreativeInventoryController(this.creativeInventoryUi, this.inventory, blockRegistry, this.hotbarHudRenderer.getSlotContentRenderer(), this.inventoryTooltip, displayNameResolver as (stack: ItemStack) => string, () => this.inventoryController.open(this.hotbarHudRenderer.getLayout().scale));

    this.craftingTableUi = new CraftingTableUi();
    this.craftingTableController = new CraftingTableController(
      this.inventory,
      this.craftingTableUi,
      this.inventoryTooltip,
      this.cursorHeldRenderer,
      this.hotbarHudRenderer.getSlotContentRenderer(),
      this.itemEntityManager,
      this.player,
      this.recipeRegistry
    );
    this.craftingTableController.setDisplayNameResolver(displayNameResolver as any);
    this.craftingTableInputController = new CraftingTableInputController(this.craftingTableController, this.hotbarHudRenderer.getLayout());

    this.furnaceManager = new FurnaceManager();
    this.smeltingRegistry = new SmeltingRegistry();
    this.fuelRegistry = new FuelRegistry();
    registerDefaultSmeltingAndFuels(this.smeltingRegistry, this.fuelRegistry, blockRegistry, this.hotbarHudRenderer.getSlotContentRenderer()['itemIcons']);
    this.furnaceManager.deserialize(metadata.furnaces);

    this.entityLighting = new EntityLightingUpdater(this.blockUpdateWorld);
    this.chestManager = new ChestManager(this.blockUpdateWorld, this.itemEntityManager);
    this.chestManager.setBlockSoundSink((id, x, y, z) => this.audioManager.play({ type: 'block.action', id, x, y, z }));
    this.chestManager.deserialize(metadata.chests);

    registerChestBehaviour(this.blockBehaviourRegistry, this.chestManager);

    this.signManager = new SignManager();
    this.signManager.deserialize(metadata.signs);
    registerSignBehaviour(this.blockBehaviourRegistry, this.signManager);

    this.signUi = new SignUi();
    this.signController = new SignController(this.signUi, this.signManager);

    this.chestUi = new ChestUi();
    this.chestController = new ChestController(
      this.chestUi,
      this.inventory,
      this.inventoryTooltip,
      this.cursorHeldRenderer,
      this.hotbarHudRenderer.getSlotContentRenderer(),
      this.itemEntityManager,
      this.player
    );
    this.chestController.setDisplayNameResolver(displayNameResolver as any);

    this.furnaceUi = new FurnaceUi();
    this.furnaceController = new FurnaceController(
      this.inventory,
      this.furnaceUi,
      this.inventoryTooltip,
      this.cursorHeldRenderer,
      this.hotbarHudRenderer.getSlotContentRenderer(),
      this.itemEntityManager,
      this.player,
      this.smeltingRegistry,
      this.fuelRegistry
    );
    this.furnaceController.setDisplayNameResolver(displayNameResolver as any);
    this.furnaceInputController = new FurnaceInputController(this.furnaceController, this.hotbarHudRenderer.getLayout());

    this.menuInputRouter = new MenuInputRouter(
      this.inventoryController,
      this.craftingTableController,
      this.furnaceController,
      this.chestController,
      this.signController,
      this.hotbarHudRenderer.getLayout(),
      this.creativeInventoryController,
      this.player,
      () => this.settings.controls.bindings,
    );

    this.interactionController.setBlockInteractionHandler((targetId, _x, _y, _z) => {
      if (targetId === BlockIds.SignPost || targetId === BlockIds.WallSign) {
        this.signController.open(_x, _y, _z);
        return true;
      }

      if (targetId === BlockIds.Chest) {
        if (!this.chestController.isOpen) {
          const container = this.chestManager.get(_x, _y, _z);
          if (container) {
            const isSolid = (x: number, y: number, z: number) => {
              const def = blockRegistry.getById(this.blockUpdateWorld.getBlock(x, y, z));
              return def && def.solid && def.renderType === 'opaque';
            };

            const pair = this.chestManager.getPairDescriptor(_x, _y, _z);

            if (pair) {
              if (!isSolid(pair.inventoryFirst.x, pair.inventoryFirst.y + 1, pair.inventoryFirst.z) && 
                  !isSolid(pair.inventorySecond.x, pair.inventorySecond.y + 1, pair.inventorySecond.z)) {
                if (this.inventoryController.isOpen) this.inventoryController.close();
                if (this.craftingTableController.isOpen) this.craftingTableController.close();
                if (this.furnaceController.isOpen) this.furnaceController.close();
                this.chestController.openDoubleContainer(pair.inventoryFirst, pair.inventorySecond, this.hotbarHudRenderer.getLayout().scale);
              }
            } else {
              if (!isSolid(_x, _y + 1, _z)) {
                if (this.inventoryController.isOpen) this.inventoryController.close();
                if (this.craftingTableController.isOpen) this.craftingTableController.close();
                if (this.furnaceController.isOpen) this.furnaceController.close();
                this.chestController.openSingleContainer(container, this.hotbarHudRenderer.getLayout().scale);
              }
            }
          }
        }
        return true;
      }

      if (targetId === BlockIds.CraftingTable) {
        if (!this.craftingTableController.isOpen) {
          if (this.inventoryController.isOpen) this.inventoryController.close();
          if (this.furnaceController.isOpen) this.furnaceController.close();
          if (this.chestController.isOpen) this.chestController.close();
          this.craftingTableController.open(this.hotbarHudRenderer.getLayout().scale);
        }
        return true;
      }
      if (targetId === BlockIds.Furnace || targetId === BlockIds.FurnaceBurning) {
        if (!this.furnaceController.isOpen) {
          if (this.inventoryController.isOpen) this.inventoryController.close();
          if (this.craftingTableController.isOpen) this.craftingTableController.close();
          if (this.chestController.isOpen) this.chestController.close();
          const container = this.furnaceManager.getOrCreate(_x, _y, _z);
          this.furnaceController.openContainer(container, this.hotbarHudRenderer.getLayout().scale);
        }
        return true;
      }
      return false;
    });

    this.interactionController.setBlockPlacedHandler((blockId, x, y, z) => {
      const sound = blockRegistry.getById(blockId)?.sound;
      if (sound) this.audioManager.play({ type: 'block.place', material: sound.dig, x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      if (blockId === BlockIds.SignPost || blockId === BlockIds.WallSign) {
        this.signController.open(x, y, z);
      }
    });

    this.interactionController.breakingController.setOnMiningHitHandler((blockId,x,y,z)=>{ const sound=blockRegistry.getById(blockId)?.sound; if(sound)this.audioManager.play({type:'block.mine',material:sound.dig,x:x+.5,y:y+.5,z:z+.5}); });

    this.interactionController.breakingController.setOnBlockBrokenHandler((blockId,x,y,z)=>{this.player.addExhaustion(.025);const sound=blockRegistry.getById(blockId)?.sound;if(sound)this.audioManager.play({type:'block.break',material:sound.dig,x:x+0.5,y:y+0.5,z:z+0.5});
      if (blockId === BlockIds.Chest) {
        if (this.chestController.isOpen) {
          const isActive = this.chestController.activeContainers.some(c => c.x === x && c.y === y && c.z === z);
          if (isActive) {
            this.chestController.close();
          }
        }
        this.chestManager.breakChest(x, y, z);
      }

      if (blockId === BlockIds.Furnace || blockId === BlockIds.FurnaceBurning) {
        if (this.furnaceController.isOpen && this.furnaceController.activeContainer && this.furnaceController.activeContainer.x === x && this.furnaceController.activeContainer.y === y && this.furnaceController.activeContainer.z === z) {
          this.furnaceController.close();
        }
        const c = this.furnaceManager.remove(x, y, z);
        if (c) {
          const items = [c.inputSlot, c.fuelSlot, c.outputSlot];
          for (const s of items) {
            if (s !== null && s.count > 0) {
              const eyeY = this.player.position.y + 1.62;
              this.itemEntityManager.spawnThrownItem(x + 0.5, eyeY - 0.3, z + 0.5, { type: s.identity.type, id: s.identity.id, count: s.count, metadata: s.metadata, damage: s.damage }, 0, 0.2, 0, 40);
            }
          }
          c.clear();
        }
      }
    });

    this.contextMenuSuppressor = new ContextMenuSuppressor();
    this.fluidAnimationSystem = new FluidAnimationSystem();
    this.fireAnimationSystem = new FireAnimationSystem();

    this.portalParticles = new PortalParticleSystem(this.renderer.scene);
    this.chunkRenderer = new ChunkRenderer(this.renderer.scene, this.chunkManager, blockRegistry, this.atlas, this.fluidAnimationSystem, this.fireAnimationSystem, this.portalAnimation, worldSeed);
    const trustPersistedLighting = metadata.saveVersion === SAVE_VERSION && metadata.generatorVersion === GENERATOR_VERSION;
    this.chunkStreamer = new ChunkStreamer(
      this.chunkManager,
      this.worldGenerator,
      this.chunkRenderer,
      this.lightEngine,
      worldSeed,
      this.persistence,
      { worldId: metadata.worldId, dimensionId: this.activeDimensionId, contextGeneration: this.contextGeneration },
      this.activeDimension.name,
      this.activeDimension.lighting.hasSkyLight,
      trustPersistedLighting,
      (chunk: Chunk) => {
        this.chestManager.synchronizeChunk(chunk.chunkX, chunk.chunkZ, chunk);
        applyDungeonFeaturesToRuntime(takeGeneratedFeatures(chunk.chunkX, chunk.chunkZ), this.chestManager, chunk);
        this.signManager.synchronizeChunk(chunk.chunkX, chunk.chunkZ, chunk);
        this.worldTickScheduler.indexLoadedChunkTicks(chunk);
        this.worldTickScheduler.reconcileChunkBoundaries(chunk);
        // Index any portals this chunk contains so the teleporter can find
        // them later without rescanning 128 blocks of unloaded world.
        this.portalIndex.reconcileChunk(chunk.chunkX, chunk.chunkZ, scanChunkForPortals(chunk));
    }, (error) => this.onPersistenceError?.(error));
    // Seed the streamer with the persisted render-distance setting before any
    // streaming happens, so a saved value of 2 or 8 is honoured from frame one.
    this.chunkStreamer.setRenderDistance(settings.video.renderDistance);
    this.deathScreen=new DeathScreen(()=>this.respawnController.request());
    this.playerDeathController=new PlayerDeathController(this.player,this.inventory,this.itemEntityManager,worldRng,this.deathScreen,()=>{this.deathSavePending=true;});
    this.respawnController=new RespawnController(this.player,this.chunkManager,this.chunkStreamer,this.blockUpdateWorld,blockRegistry,metadata.spawn,this.deathScreen,this.playerDeathController,()=>{this.cameraHurtController.reset(this.renderer.camera);this.sprintFovController.reset(this.renderer.camera);this.foodUseController.cancel();void this.saveMetadata(true);});

    this.chestRenderer = new ChestRenderer(this.renderer.scene, this.chestManager, this.atlas, this.chunkRenderer.getOpaqueMaterial());
    this.signTextRenderer = new SignTextRenderer(this.renderer.scene, this.signManager, this.blockUpdateWorld);
    this.debugOverlay = new DebugOverlay();
    this.debugStatsCollector = new DebugStatsCollector(
      this.player,
      this.chunkManager,
      this.chunkRenderer,
      this.chunkStreamer,
      this.entityManager,
      this.renderer.renderer,
      () => this.cameraController.getYaw(),
      () => `${this.activeDimension.displayName} (${this.activeDimensionId})`,
    );

    const validationHarness = new WorkerValidationHarness(worldSeed, this.atlas);
    this.removeDebugHooks = installEngineDebugHooks({
      persistence: this.persistence,
      validationHarness,
      interactionController: this.interactionController,
      entityManager: this.entityManager,
      worldTickScheduler: this.worldTickScheduler,
      redstonePowerEngine: this.redstonePowerEngine,
      lightEngine: this.lightEngine,
      fallingBlockManager: this.fallingBlockManager,
      worldEventQueue: this.worldEventQueue,
      weatherController: this.weatherController,
      precipitationSimulator: this.precipitationSimulator,
      blockUpdateWorld: this.blockUpdateWorld,
      chunkRenderer: this.chunkRenderer,
      renderDistance: {
        getState: () => ({
          renderDistance: this.chunkStreamer.getRenderDistance(),
          unloadRadius: this.chunkStreamer.getUnloadRadius(),
        }),
        // Routed through applySettings so the debug path exercises exactly the
        // same flow the settings screen uses (settings -> engine -> streamer).
        set: (value: number) => {
          this.applySettings({ ...this.settings, video: { ...this.settings.video, renderDistance: normalizeRenderDistance(value) } });
        },
      },
      environment: {
        getState: () => {
          const dimension = this.activeDimension;
          const fog = this.renderer.getFogState();
          const weather = this.weatherController.getState();
          return {
            dimension: this.activeDimensionId,
            hasSky: dimension.sky.hasSky,
            hasClouds: dimension.sky.hasClouds,
            hasWeather: dimension.weather.hasWeather,
            skyRootVisible: this.skyRenderer.isVisible(),
            cloudRootVisible: this.cloudRenderer.isVisible(),
            ambientLightFloor: dimension.lighting.ambientLightFloor,
            hasSkyLight: dimension.lighting.hasSkyLight,
            fogMode: fog?.mode ?? null,
            fogColorHex: fog?.colorHex ?? null,
            backgroundHex: this.renderer.getBackgroundHex(),
            skylightSubtracted: this.chunkRenderer.getSkylightSubtracted(),
            rainStrength: weather.getRainStrength(weather.partialTick),
            rainAudio: this.lastRainAudioStrength,
          };
        },
        getEntityKinds: () => {
          const kinds: string[] = [];
          this.entityManager.forEachActive((entity) => {
            kinds.push(entity.constructor.name.replace(/Entity$/, '').toLowerCase());
          });
          return kinds;
        },
      },
      portal: {
        getState: () => ({
          dimension: this.activeDimensionId,
          dimensionName: this.activeDimension.name,
          phase: this.portalTravel.getPhase(),
          overlay: this.portalTravel.getOverlayStrength(),
          cooldownTicks: this.portalTravel.getCooldownTicks(),
          transitionActive: this.dimensionTransition.isActive(),
          transitionPhase: this.dimensionTransition.getPhase(),
          readiness: this.dimensionTransition.getReadiness(),
          inPortal: this.player.isAlive() && isInsidePortal(
            {
              getBlock: (x: number, y: number, z: number) => this.blockUpdateWorld.getBlock(x, y, z),
              isLoaded: (x: number, z: number) => this.blockUpdateWorld.isLoaded(x, z),
            },
            this.player.getAABB(),
          ),
          particles: this.portalParticles?.getActiveCount() ?? 0,
          simulationTick: this.simulationTick,
          position: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
        }),
        placePlayer: (x: number, y: number, z: number) => {
          this.player.resetForPortalArrival(x, y, z);
        },
      },
      chunkManager: this.chunkManager,
      fluidAnimationSystem: this.fluidAnimationSystem,
      fireAnimationSystem: this.fireAnimationSystem,
      blockRegistry,
      performanceProfiler: this.performanceProfiler,
      saveMetadata: (force) => this.saveMetadata(force),
      countDirtyChunks: () => this.countDirtyChunks(),
    });

    this.updateHeldItemMesh();
  }

  public register(system: IUpdatable): void { if (!this.updatables.includes(system)) this.updatables.push(system); }
  public unregister(system: IUpdatable): void { const index = this.updatables.indexOf(system); if (index !== -1) this.updatables.splice(index, 1); }

  public start(): void {
    if (this.running) {
      console.warn('[Engine] Duplicate start() ignored; engine is already running.');
      return;
    }
    if (this.animationFrameId !== null) {
      console.warn('[Engine] Stale animation frame detected before start(); cancelling before starting a new loop.');
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    document.body.appendChild(this.renderer.domElement);
    // Restore this dimension's portal anchors so the very first portal trip
    // can already link to portals built in a previous session.
    void this.loadPortalIndex();
    this.debugOverlay.mount();
    const profilerEnabled = readProfilerEnabledSetting();
    this.performanceProfiler.setEnabled(profilerEnabled);
    this.lightEngine.setMetricsEnabled(profilerEnabled);
    this.input.start();
    this.renderer.start();
    this.running = true;
    this.playerDeathController.update();
    this.lastFrameTimeMs = null;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  public applySettings(settings: GameSettings): void {
    this.settings = settings;
    this.input.setBindings(settings.controls.bindings);
    this.audioManager.applySettings(settings);
    this.cameraController.setSettings(settings);
    this.hotbarHudRenderer.setGuiScale(settings.video.guiScale);
    this.player.viewBobbingEnabled = settings.video.viewBobbing;
    this.renderer.setAaMode(settings.video.aaMode);
    this.renderer.setRenderScale(settings.video.renderScale);
    // Render distance is applied to the streamer, the single runtime owner.
    // Takes effect immediately; no world reload.
    this.chunkStreamer.setRenderDistance(settings.video.renderDistance);
  }

  public setPaused(paused: boolean): void {
    this.simulationPaused = paused;
    this.audioManager.setWorldPaused(paused);
    this.input.clearTransientState();
    this.interactionController.breakingController.reset();
    if (paused && typeof document !== 'undefined' && document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    if (!paused) {
      this.lastFrameTimeMs = null;
      this.simulationAccumulatorTicks = 0;
    }
  }

  public get isPaused(): boolean { return this.simulationPaused; }

  /** Definition driving the currently simulated dimension. */
  public get activeDimension(): DimensionDefinition {
    return this.dimensions.require(this.activeDimensionId);
  }

  /** Id of the dimension currently being simulated and rendered. */
  public getActiveDimensionId(): DimensionId { return this.activeDimensionId; }

  /**
   * The music context for the ACTIVE dimension, provider-driven through the
   * dimension definition's `musicContext` (Nether -> nether, Overworld ->
   * survival), refined for creative mode in the Overworld. Used on world load
   * so a save in the Nether resumes Nether music immediately rather than
   * starting an Overworld track first.
   */
  public getMusicContext(): MusicContext {
    return resolveMusicContext(this.activeDimension.musicContext, this.player.gameMode);
  }

  /** Current game mode, so dimension switches can resolve music provider-style. */
  public get gameMode(): GameMode { return this.player.gameMode; }

  /** True while a dimension switch is in flight (input/simulation frozen). */
  public isDimensionTransitionActive(): boolean { return this.dimensionTransition.isActive(); }

  /** The in-flight transition, for readiness reporting during loading. */
  public getDimensionTransition(): DimensionTransition { return this.dimensionTransition; }

  /** Portal charge 0..1, for the screen overlay. */
  public getPortalOverlayStrength(): number { return this.portalTravel.getOverlayStrength(); }

  /** Registry of all known dimensions (extension point for custom dimensions). */
  public getDimensionRegistry(): DimensionRegistry { return this.dimensions; }

  // --- Save-and-Quit lifecycle operations (orchestrated by SaveExitController) ---

  /**
   * Step 1-2 of the shutdown ordering (correction 5): freeze gameplay and
   * streaming, and cancel pending reads. Pausing stops simulation ticks, the
   * autosave pump and streaming; stopAccepting halts new unload scheduling;
   * cancelPendingReads detaches in-flight read results. Idempotent.
   */
  public freezeForSave(): void {
    if (this.quiescing) return;
    this.quiescing = true;
    this.setPaused(true);
    this.chunkStreamer.stopAccepting();
    this.chunkStreamer.cancelPendingReads();
  }

  /** Step 3a: settle accepted reads (correction 3) — never close while a detached read can reject unobserved. */
  public settleAcceptedReads(): Promise<void> {
    return this.chunkStreamer.settleAcceptedReads();
  }

  /** Step 3b: settle accepted unloads. The ChunkStreamer is the single owner (correction 2); rejects if an unload failed. */
  public settleAcceptedUnloads(): Promise<void> {
    return this.chunkStreamer.settleAcceptedUnloads();
  }

  /** Step 4: capture the immutable metadata snapshot from the frozen state (correction 5). */
  public captureMetadataSnapshot(): WorldMetadata {
    return this.snapshotMetadata();
  }

  /** Step 4: capture the stable set of currently-loaded dirty chunks (mutations are frozen). */
  public dirtyChunkSnapshot(): Chunk[] {
    const dirty: Chunk[] = [];
    for (const chunk of this.chunkManager) if (chunk.isPersistenceDirty()) dirty.push(chunk);
    return dirty;
  }

  /** The persistence service (used by the SaveExitController for saves/barrier/close). */
  public getPersistence(): WorldPersistenceService {
    return this.persistence;
  }

  public setSaveExitActive(active: boolean): void {
    this.saveExitActive = active;
    this.emitPersistenceRisk();
  }

  /**
   * Return to gameplay after a FAILED Save-and-Quit (failed -> idle). Clears the
   * quiesce state, resumes streaming, and resumes autosave (correction 7).
   */
  public resumeFromFailedSave(): void {
    this.quiescing = false;
    this.saveExitActive = false;
    this.autosavePaused = false;
    this.persistence.clearLastError();
    this.chunkStreamer.resume();
    this.setPaused(true); // remain paused at the pause menu; the user resumes explicitly
    this.emitPersistenceRisk();
  }

  /** Aggregated persistence-risk snapshot for the beforeunload warning (correction 8). */
  public getPersistenceRiskSnapshot(): PersistenceRiskSnapshot {
    const diag = this.persistence.getDiagnostics();
    const dirtyChunks = this.countDirtyChunks();
    const metadataChanged = this.metadataDirty() || diag.metadataWriteInFlight;
    const unresolvedFailure = diag.lastError !== null || this.autosavePaused;
    const snapshot: PersistenceRiskSnapshot = {
      dirtyChunks,
      inFlightWrites: diag.writeLane.active + diag.writeLane.pending,
      metadataChanged,
      pendingUnloads: diag.pendingUnloads + this.chunkStreamer.pendingUnloadCount,
      finalSaveActive: this.saveExitActive,
      unresolvedFailure,
      atRisk: dirtyChunks > 0 || (diag.writeLane.active + diag.writeLane.pending) > 0 || metadataChanged || (diag.pendingUnloads + this.chunkStreamer.pendingUnloadCount) > 0 || this.saveExitActive || unresolvedFailure,
    };
    return snapshot;
  }

  /** Subscribe to persistence-risk changes; returns an unsubscribe function (correction 8). */
  public subscribePersistenceRisk(listener: (snapshot: PersistenceRiskSnapshot) => void): () => void {
    this.persistenceRiskListeners.add(listener);
    return () => { this.persistenceRiskListeners.delete(listener); };
  }

  private emitPersistenceRisk(): void {
    if (this.persistenceRiskListeners.size === 0) return;
    const snapshot = this.getPersistenceRiskSnapshot();
    for (const listener of this.persistenceRiskListeners) listener(snapshot);
  }

  /** snapshotMetadata guarded for use before the player/world is fully ready. */
  private snapshotMetadataSafe(): WorldMetadata {
    try {
      return this.snapshotMetadata();
    } catch {
      return this.persistence.getMetadata() ?? this.snapshotMetadata();
    }
  }

  /** Aggregated diagnostics for watchdogs / error screens. */
  public getPersistenceDiagnostics(): {
    service: ServiceDiagnostics;
    dirtyChunks: number;
    pendingReads: number;
    pendingUnloads: number;
    quiescing: boolean;
    saveExitActive: boolean;
    autosavePaused: boolean;
    autosaveStats: AutosaveStats;
  } {
    return {
      service: this.persistence.getDiagnostics(),
      dirtyChunks: this.countDirtyChunks(),
      pendingReads: this.chunkStreamer.pendingReadCount,
      pendingUnloads: this.chunkStreamer.pendingUnloadCount,
      quiescing: this.quiescing,
      saveExitActive: this.saveExitActive,
      autosavePaused: this.autosavePaused,
      autosaveStats: { ...this.autosaveStats },
    };
  }

  /**
   * Convenience full save-and-quit (used by application disposal). The
   * user-initiated Save-and-Quit goes through SaveExitController, which wraps
   * these same operations with diagnostic watchdogs and the state machine.
   */
  public async saveAndQuit(): Promise<void> {
    recordSaveEvent('save.engine.save_and_quit_begin', { paused: this.simulationPaused, dirtyChunkCount: this.countDirtyChunks() });
    this.freezeForSave();
    await this.settleAcceptedReads();
    await this.settleAcceptedUnloads();
    const metadata = this.captureMetadataSnapshot();
    const dirtyChunks = this.dirtyChunkSnapshot();
    for (const chunk of dirtyChunks) this.persistence.saveChunk(chunk, WRITE_PRIORITY_FORCED).catch(() => undefined);
    await this.persistence.flushBarrier();
    await this.persistence.saveMetadata(metadata, WRITE_PRIORITY_FORCED);
    await this.persistence.flushBarrier();
    recordSaveEvent('save.engine.save_and_quit_persisted', { dirtyChunkCount: this.countDirtyChunks() });
    await this.persistence.close();
    this.stop();
    recordSaveEvent('save.engine.save_and_quit_complete', { running: this.running });
  }

  /**
   * Halt the world session after a fail-loud corruption error: stop accepting
   * new reads/writes and settle already-accepted operations by closing the
   * service — WITHOUT saving the corrupt state — then dispose the engine. The
   * application-owned shared backend stays open.
   */
  public async abortForCorruption(): Promise<void> {
    try {
      await this.persistence.close();
    } catch (error) {
      console.warn('[Engine] error closing service after corruption:', error);
    }
    this.stop();
  }

  public stop(): void {
    if (!this.running) return;
    measureSaveSync('save.engine.stop.loop', {
      animationFrameId: this.animationFrameId,
      running: this.running,
    }, () => {
      this.running = false;
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.lastFrameTimeMs = null;
      this.renderer.stop();
      this.input.stop();
    });

    measureSaveSync('save.engine.dispose_game_systems', {
      paused: this.simulationPaused,
    }, () => {
      this.removeDebugHooks?.();
      this.removeDebugHooks = null;
      this.interactionController.dispose();
      this.debugOverlay.dispose();
      this.blockHighlight.dispose();
      this.destroyOverlayRenderer.dispose();
      this.hudRenderer.dispose();
      this.inventoryTooltip.dispose();
      this.cursorHeldRenderer.dispose();
      this.deathScreen.dispose();
      this.inventoryInputController.dispose();
      this.creativeInventoryController.dispose();
      this.inventoryController.dispose();
      this.craftingTableInputController.dispose();
      this.furnaceInputController.dispose();
      this.menuInputRouter.dispose();
      this.craftingTableController.dispose();
      this.furnaceController.dispose();
      this.chestController.dispose();
      this.signController.dispose();
      this.furnaceManager.clear();
      this.contextMenuSuppressor.dispose();
      this.heldItemRenderer.dispose();
      this.firstPersonArmRenderer.dispose();
      this.playerArmourRenderer.dispose();
      this.playerModel.dispose();
      this.minecartRenderSystem.dispose();
      this.boatRenderer.dispose();
      this.fishingLine.dispose();
      this.endSleep('teardown');
      this.sleepOverlay.dispose();
      this.entityManager.dispose();
      this.entityParticles.dispose();
    });

    measureSaveSync('save.engine.dispose_world_systems', {
      persistenceStats: this.persistence.getStats(),
      dirtyChunkCount: this.countDirtyChunks(),
    }, () => {
      this.chunkStreamer.dispose();
      this.fallingBlockManager.dispose();
      this.lightningRenderer.dispose();
      this.rainSplashRenderer.dispose();
      this.precipitationRenderer.dispose();
      this.cloudRenderer.dispose();
      this.skyRenderer.dispose();
      this.chestRenderer.dispose();
      this.signTextRenderer.dispose();
      this.chunkRenderer.dispose();
      this.fluidAnimationSystem.dispose();
      this.fireAnimationSystem.dispose();
      this.armourMaterialCache.dispose();
      this.armourGeometryCache.dispose();
      this.firstPersonHeldBlockMesh.geometry.dispose();
      this.thirdPersonHeldBlockMesh.geometry.dispose();
      this.heldBlockMaterial.dispose();
      this.itemHeldMaterial.dispose();
      this.chunkManager.clear();
    });

    measureSaveSync('save.engine.dispose_renderer', {
      persistenceStats: this.persistence.getStats(),
    }, () => {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    });
  }

  private tick = (timeMs: number): void => {
    if (!this.running) {
      this.animationFrameId = null;
      return;
    }
    this.animationFrameId = requestAnimationFrame(this.tick);
    this.performanceProfiler.beginFrame();
    this.performanceProfiler.beginUpdate();

    const deltaSeconds = this.lastFrameTimeMs === null ? 0 : Math.min((timeMs - this.lastFrameTimeMs) / 1000, MAX_DELTA_SECONDS);
    this.lastFrameTimeMs = timeMs;

    this.input.beginFrame();
    if (!this.simulationPaused && this.input.isActionJustPressed('pause')) {
      this.onPauseRequested?.();
      this.input.clearTransientState();
    }
    if (this.simulationPaused) {
      this.lastFrameTimeMs = timeMs;
      this.simulationAccumulatorTicks = 0;
      this.renderer.renderer.clear();
      this.renderer.render();
      this.performanceProfiler.endUpdate();
      this.performanceProfiler.beginRender();
      this.performanceProfiler.endRender();
      this.performanceProfiler.endFrame();
      return;
    }
    // F3 is the only player-facing debug hotkey.
    if (this.input.isDebugKeyJustPressed('F3')) this.debugOverlay.toggle();

    this.worldTime.update(deltaSeconds);
    this.simulationAccumulatorTicks += deltaSeconds * 20;
    while (this.simulationAccumulatorTicks >= 1) {
      this.simulationTick++;
      this.worldTickScheduler.beginTick(this.simulationTick);
      this.tickSleep();
      this.player.tickCombatState(); this.playerController.tickSprintWindow(); this.foodUseController.tick();
      this.playerSurvivalController.tick(); this.interactionController.breakingController.tick();
      this.playerDeathController.update(); this.respawnController.update(); this.naturalMobSpawner.tick();
      this.entityManager.tick(); this.entityManager.collideWithPlayer(this.player); this.itemEntityManager.tickPickups(this.player);
      if(this.deathSavePending){this.deathSavePending=false;void this.saveMetadata(true);}
      // Logical, tick-rate work: these sample the world or advance animation
      // state and must run at Beta's fixed 20 Hz, not once per rendered frame
      // (which made their cost scale with monitor refresh rate).
      this.updateAnimatedItemIcons();
      this.updateAmbientBlockAudio();
      this.tickPortalTravel();
      this.worldTickScheduler.endTick();
      this.simulationAccumulatorTicks--;
    }
    const now = performance.now();
    if (now - this.lastChunkSavePumpMs >= CHUNK_SAVE_PUMP_INTERVAL_MS) { this.lastChunkSavePumpMs = now; void this.pumpChunkSaves(); }
    if (now - this.lastMetadataAutosaveMs >= METADATA_AUTOSAVE_MS) { this.lastMetadataAutosaveMs = now; void this.saveMetadata(false); }
    this.chestManager.update(); this.chestRenderer.update(deltaSeconds); this.signTextRenderer.update(); this.furnaceManager.tick(this.blockUpdateWorld, this.smeltingRegistry, this.fuelRegistry);
    
    for (const drop of this.worldEventQueue.drainBlockDrops()) {
      const drops = resolveBlockDrops(drop.blockId, drop.metadata);
      for (const d of drops) this.itemEntityManager.spawnItem(drop.x + 0.5, drop.y + 0.2, drop.z + 0.5, d, 10);
    }
    for (const drop of this.worldEventQueue.drainItemDrops()) {
      this.itemEntityManager.spawnItem(drop.x + 0.5, drop.y + 0.2, drop.z + 0.5, { type: 'item', id: drop.itemId, count: drop.count, metadata: drop.metadata }, 10);
    }
    this.worldEventQueue.drainNoop();
    this.fluidAnimationSystem.update(this.worldTime.getTotalTicks());
    this.fireAnimationSystem.update(this.worldTime.getTotalTicks());
    this.portalAnimation.update(this.worldTime.getTotalTicks());
    this.portalParticles?.update(deltaSeconds);
    this.updateSleepPresentation();
    this.updateUnderwaterOverlay();
    this.updateFishingLine();
    if (this.animatedIconsDirty) {
      this.animatedIconsDirty = false;
      this.refreshOpenContainerIcons();
    }
    if (!this.inventoryController.isOpen && !this.creativeInventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && !this.signController.isOpen && this.player.isAlive() && !this.deathScreen.isOpen && !this.sleepController.isSleeping()) this.cameraController.update();
    if(!this.player.isAlive()){this.player.wishVelocity.x=this.player.wishVelocity.z=0;}
    else {
      const chunkX = Math.floor(this.player.position.x / 16);
      const chunkZ = Math.floor(this.player.position.z / 16);
      if (this.chunkManager.hasChunk(chunkX, chunkZ)) {
        this.player.preTick();
        if (!this.inventoryController.isOpen && !this.creativeInventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && !this.signController.isOpen && this.player.isAlive() && !this.deathScreen.isOpen) {
          this.playerController.update(deltaSeconds);
        } else { this.player.wishVelocity.x = 0; this.player.wishVelocity.z = 0; }
        const movement=this.playerPhysics.update(this.player,deltaSeconds,this.input.isActionActive('jump'),this.input.isActionActive('sprint'));
        this.playerSurvivalController.recordMovement(movement);
        if (movement.splashVolume !== undefined) this.audioManager.play({ type: 'random.splash', x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, volume: movement.splashVolume });
        this.updatePlayerFootsteps(movement);
      } else { this.chunkStreamer.dispatchCriticalLoad(chunkX, chunkZ); }
    }

    // Beta's body-yaw maths needs the LOOK direction (camera yaw).
    this.player.updateAnimationState(deltaSeconds, this.cameraController.getYaw());
    this.cameraModeController.update();
    const camera = this.renderer.camera;
    this.cameraModeController.applyTransform(camera, this.player, this.cameraController.getYaw(), this.cameraController.getPitch());
    this.cameraHurtController.update(camera,this.player,deltaSeconds);
    const survivalUiSuppressed=this.inventoryController.isOpen||this.creativeInventoryController.isOpen||this.craftingTableController.isOpen||this.furnaceController.isOpen||this.chestController.isOpen||this.signController.isOpen||this.deathScreen.isOpen;
    if(survivalUiSuppressed){this.player.isSprinting=false;this.foodUseController.cancel();this.interactionController.breakingController.reset();}
    this.sprintFovController.update(camera,this.player,deltaSeconds,survivalUiSuppressed);

    const fishingRodCast = this.interactionController.getActiveBobber() !== null;
    this.heldItemRenderer.setFishingRodCast(fishingRodCast);
    this.thirdPersonHeldItemRenderer.setFishingRodCast(fishingRodCast);

    if (this.cameraModeController.getMode() === CameraMode.FIRST_PERSON) {
      this.playerModel.setVisible(true); this.playerModel.setFirstPersonMode(true); this.firstPersonArmRenderer.setVisible(true);
      this.firstPersonMotionController.update(camera, this.player, this.firstPersonArmRenderer, 1.0);
      const hasHeldContent = this.heldItemRenderer.update(this.selectedSlot, deltaSeconds);
      this.firstPersonArmRenderer.setArmMeshVisible(!hasHeldContent);
      const currentHeldStack = this.inventory.getStack(this.selectedSlot);
      const holdingItem = currentHeldStack !== null;
      this.applyHeldItemVisibility(holdingItem);
      this.playerAnimator.update(this.player, this.playerModel, this.cameraController.getYaw(), this.cameraController.getPitch(), 1.0, deltaSeconds, holdingItem, this.thirdPersonHeldPose(currentHeldStack));
    } else {
      this.playerModel.setVisible(true); this.playerModel.setFirstPersonMode(false); this.firstPersonArmRenderer.setVisible(false);
      this.heldItemRenderer.update(this.selectedSlot, deltaSeconds);
      // Keep the third-person held item in step with the current slot.
      const currentHeldStack = this.inventory.getStack(this.selectedSlot);
      const holdingItem = currentHeldStack !== null;
      this.applyHeldItemVisibility(holdingItem);
      this.playerAnimator.update(this.player, this.playerModel, this.cameraController.getYaw(), this.cameraController.getPitch(), 1.0, deltaSeconds, holdingItem, this.thirdPersonHeldPose(currentHeldStack));
    }
    this.playerArmourRenderer.sync();

    // Every environment decision below is driven by the ACTIVE DIMENSION's
    // rules, not by a dimension id check. A dimension with no weather never
    // advances the weather clock, never renders sky/clouds, and never feeds
    // rain to the audio mixer.
    const dimension = this.activeDimension;
    const dimensionHasWeather = dimension.weather.hasWeather;

    const weatherSimStart = performance.now();
    if (dimensionHasWeather) this.weatherController.update(deltaSeconds);
    const weatherSimEnd = performance.now();
    const weatherState = this.weatherController.getState();
    const rainStrength = dimensionHasWeather ? weatherState.getRainStrength(weatherState.partialTick) : 0;
    const previewFade = previewWeatherFade(rainStrength, dimensionHasWeather ? weatherState.getThunderStrength(weatherState.partialTick) : 0);

    this.skyRenderer.setVisible(dimension.sky.hasSky);
    this.cloudRenderer.setVisible(dimension.sky.hasClouds);
    if (dimension.sky.hasSky) this.skyRenderer.update(camera, this.worldTime, previewFade);

    const atmos = buildAtmosphericState(
      this.skyRenderer.getCurrentColorState(),
      weatherState,
      dimensionHasWeather ? this.lightningManager.getState().getFlashStrength(weatherState.partialTick) : 0,
    );
    if (dimension.sky.hasSky) this.skyRenderer.applyAtmosphericState(atmos);
    this.audioManager.updateListener(camera.position.x, camera.position.y, camera.position.z, this.cameraController.getYaw(), this.cameraController.getPitch());
    // No weather => no rain audio, and no rain-cover raycasts either.
    this.audioManager.setRain(rainStrength);
    this.lastRainAudioStrength = rainStrength;
    if (dimensionHasWeather) {
      this.rainCoverSampleSeconds -= deltaSeconds;
      if (this.rainCoverSampleSeconds <= 0) { this.rainCoverSampleSeconds = 0.25; this.audioManager.setRainCover(this.sampleRainCover(camera.position.x, camera.position.y, camera.position.z)); }
    }
    // A dimension with no sky has no day/night skylight subtraction: its
    // ambient floor comes from the light table instead.
    this.chunkRenderer.setSkylightSubtracted(dimension.lighting.hasSkyLight ? atmos.effectiveSkylightSubtracted : 0);
    this.chunkRenderer.setSunBrightnessFactor(dimension.lighting.hasSkyLight ? atmos.sunBrightnessFactor : 1);
    this.chunkRenderer.setAmbientLightFloor(dimension.lighting.ambientLightFloor);
    if (dimension.sky.hasClouds) {
      const cloudColor = { r: atmos.cloud.r, g: atmos.cloud.g, b: atmos.cloud.b, hex: atmos.cloud.hex };
      this.cloudRenderer.update(camera.position.x, camera.position.z, deltaSeconds, cloudColor, atmos.cloudFogStrength);
    }

    const preStreamMeshingStats = this.chunkRenderer.getMeshingStats();
    this.chunkStreamer.update(camera.position.x, camera.position.z, this.cameraController.getYaw(), this.player.velocity.x, this.player.velocity.z, preStreamMeshingStats.queued, preStreamMeshingStats.pendingUploads);
    const generationStats = this.chunkStreamer.getGenerationStats();
    const integrationStats = this.chunkStreamer.getIntegrationStats();
    const meshingStats = this.chunkRenderer.getMeshingStats();
    this.performanceProfiler.setQueues(generationStats.queued, meshingStats.queued + meshingStats.pendingUploads, generationStats.activeWorkers + meshingStats.activeWorkers, generationStats.oldestCriticalAgeMs);
    this.performanceProfiler.setWorkerCounters(generationStats.completed, generationStats.stale, generationStats.errors + meshingStats.errors);
    this.performanceProfiler.recordGenerationTimings({
      queueProcessMs: generationStats.processMs,
      workerDurationMs: generationStats.lastWorkerDurationMs || generationStats.syncGenerationMs,
      integrationMs: integrationStats.lastGeneratedIntegrationMs + integrationStats.lastReadIntegrationMs,
      chunksCompleted: generationStats.completed,
      bytesReceived: generationStats.lastTransferBytes,
      transferLatencyMs: generationStats.lastTransferLatencyMs,
      lightingInitMs: integrationStats.lastLightingInitMs,
      borderReconcileMs: integrationStats.lastBorderReconcileMs,
      neighbourDirtyCount: integrationStats.lastNeighbourDirtyCount,
    });
    const persistenceDiag = this.persistence.getDiagnostics();
    this.performanceProfiler.setPersistenceQueueDepth(
      persistenceDiag.writeLane.active +
      persistenceDiag.writeLane.pending +
      persistenceDiag.readLane.active +
      persistenceDiag.readLane.pending +
      persistenceDiag.pendingUnloads +
      persistenceDiag.inFlightChunks,
    );
    this.performanceProfiler.recordChunkCounts(this.chunkManager.size, this.chunkRenderer.getVisibleMeshCount(), this.chunkManager.countDirtyChunks());

    if (!this.inventoryController.isOpen && !this.creativeInventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && !this.signController.isOpen && this.player.isAlive() && !this.deathScreen.isOpen && !this.sleepController.isSleeping()) this.interactionController.update(deltaSeconds);

    const currentSlot = this.interactionController.getSelectedSlotIndex();
    const currentStack = this.inventory.getStack(currentSlot);
    const currentStackEmpty = currentStack === null;
    const currentStackId = currentStack?.identity.id ?? null;
    const currentStackCount = currentStack?.count ?? 0;
    if (
      this.selectedSlot !== currentSlot
      || this.lastSelectedStackEmpty !== currentStackEmpty
      || this.lastSelectedStackId !== currentStackId
      || this.lastSelectedStackCount !== currentStackCount
    ) {
      this.selectedSlot = currentSlot;
      this.lastSelectedStackEmpty = currentStackEmpty;
      this.lastSelectedStackId = currentStackId;
      this.lastSelectedStackCount = currentStackCount;
      this.updateHeldItemMesh();
    }

    if (!this.inventoryController.isOpen && !this.creativeInventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && this.input.isActionJustPressed('drop')) {
      const selectedSlotIndex = this.interactionController.getSelectedSlotIndex();
      const stack = this.inventory.getStack(selectedSlotIndex);
      if (stack !== null) {
        const spawnX = this.player.position.x; const spawnY = this.player.position.y + 1.32; const spawnZ = this.player.position.z;
        const yaw = this.cameraController.getYaw(); const pitch = this.cameraController.getPitch();
        const throwStrength = 0.3;
        let motionX = -Math.sin(yaw) * Math.cos(pitch) * throwStrength; let motionZ = Math.cos(yaw) * Math.cos(pitch) * throwStrength; let motionY = -Math.sin(pitch) * throwStrength + 0.1;
        const randAngle = Math.random() * Math.PI * 2; const randForce = Math.random() * 0.02;
        motionX += Math.cos(randAngle) * randForce; motionZ += Math.sin(randAngle) * randForce; motionY += (Math.random() - Math.random()) * 0.1;
        this.itemEntityManager.spawnThrownItem(spawnX, spawnY, spawnZ, { type: stack.identity.type, id: stack.identity.id, count: 1, metadata:stack.metadata, damage:stack.damage }, motionX, motionY, motionZ, 40);
        this.inventory.decrementSlot(selectedSlotIndex, 1);
      }
    }

    const px = Math.floor(this.player.position.x); const pey = Math.floor(this.player.position.y + FIRST_PERSON_CAMERA_OFFSET_Y); const pz = Math.floor(this.player.position.z);
    const skyLight = this.blockUpdateWorld.getSkylight(px, pey, pz); const blockLight = this.blockUpdateWorld.getBlocklight(px, pey, pz);
    this.firstPersonArmRenderer.updateLighting(skyLight, blockLight, atmos.effectiveSkylightSubtracted, atmos.sunBrightnessFactor);
    // Mobs, dropped items, arrows, minecarts and TNT all carry the same Beta
    // lighting uniforms but nothing wrote them before, so they rendered fully
    // lit at night and underground.
    this.entityLighting.setAtmosphere(atmos.effectiveSkylightSubtracted, atmos.sunBrightnessFactor);
    this.entityManager.forEachActive((entity) => this.entityLighting.update(entity));
    this.heldItemRenderer.updateLighting(skyLight, blockLight, atmos.effectiveSkylightSubtracted, atmos.sunBrightnessFactor);
    this.armourMaterialCache.updateLighting(skyLight, blockLight, atmos.effectiveSkylightSubtracted, atmos.sunBrightnessFactor);

    if (this.playerModelUniforms && this.playerModelUniforms.uStaticSkyLight && this.playerModelUniforms.uStaticBlockLight) {
      this.playerModelUniforms.uStaticSkyLight.value = skyLight; this.playerModelUniforms.uStaticBlockLight.value = blockLight;
      this.playerModelUniforms.uSkylightSubtracted.value = atmos.effectiveSkylightSubtracted; this.playerModelUniforms.uSunBrightnessFactor.value = atmos.sunBrightnessFactor;
    }

    this.chunkRenderer.update(this.performanceProfiler.getLastFrameTimeMs(), camera.position.x, camera.position.z);
    this.performanceProfiler.recordDirtyChunkScanMs(this.chunkRenderer.getLastDirtyScanMs());
    const postRenderMeshingStats = this.chunkRenderer.getMeshingStats();
    const geometryCreationMs = this.chunkRenderer.getLastGeometryCreationMs();
    const sceneInsertionMs = this.chunkRenderer.getLastSceneInsertionMs();
    this.performanceProfiler.recordMeshingTimings({
      jobBuildMs: postRenderMeshingStats.jobBuildMs,
      dispatchMs: postRenderMeshingStats.dispatchMs,
      resultDrainMs: postRenderMeshingStats.resultDrainMs,
      workerDurationMs: postRenderMeshingStats.lastWorkerDurationMs,
      geometryCreationMs,
      sceneInsertionMs,
      bytesCopied: postRenderMeshingStats.bytesCopied,
      bytesTransferred: postRenderMeshingStats.bytesTransferred,
      bytesReturned: postRenderMeshingStats.bytesReturned,
      transferLatencyMs: postRenderMeshingStats.transferLatencyMs,
    });
    this.performanceProfiler.recordMeshUploadTimings(geometryCreationMs, sceneInsertionMs, geometryCreationMs + sceneInsertionMs);
    const precipStart = performance.now();
    this.precipitationRenderer.update(camera.position.x, camera.position.y, camera.position.z, deltaSeconds, atmos, this.worldTime);
    const precipEnd = performance.now();
    const splashStart = performance.now();
    this.rainSplashRenderer.update(camera, deltaSeconds, atmos, this.precipitationRenderer);
    const splashEnd = performance.now();
    if (dimensionHasWeather) {
      this.lightningManager.setAudioHook((x, y, z, distance) => this.audioManager.play({ type: 'weather.thunder', x, y, z, distance }));
    } else {
      this.lightningManager.setAudioHook(null);
    }
    // Beta drives its rain sound from raindrop impacts, not a loop: the
    // splash renderer already knows where drops land, so it is the correct
    // trigger point. `aboveListener` reproduces Beta's quieter, lower-pitched
    // variant used when the drop lands above the player under open sky.
    this.rainSplashRenderer.setAudioHook((x, y, z) => {
      const aboveListener = y > this.player.position.y + 1;
      this.audioManager.playRainImpact(x, y, z, aboveListener);
    });
    if (dimensionHasWeather) {
      this.lightningManager.update(deltaSeconds, weatherState, camera.position.x, camera.position.y, camera.position.z);
    }
    this.lightningRenderer.update(this.lightningManager.getState());
    this.performanceProfiler.recordWeatherTimings({
      simulationMs: weatherSimEnd - weatherSimStart,
      splashMs: splashEnd - splashStart,
      heightmapResampleMs: 0,
      geometryRebuildMs: precipEnd - precipStart,
      drawMs: 0,
      transparentRenderingMs: 0,
    });
    const lightingMetrics = this.lightEngine.drainBfsMetrics();
    this.performanceProfiler.setLightingQueueDepth(lightingMetrics.maximumBfsQueueSize);
    this.performanceProfiler.recordLightingTimings({
      propagationMs: lightingMetrics.propagationMs,
      averageBfsQueueSize: lightingMetrics.averageBfsQueueSize,
      maximumBfsQueueSize: lightingMetrics.maximumBfsQueueSize,
      propagationCalls: lightingMetrics.propagationCalls,
      nodesProcessed: lightingMetrics.nodesProcessed,
      initializationMs: lightingMetrics.initializationMs,
      borderReconcileMs: lightingMetrics.borderReconcileMs,
      localRelightMs: lightingMetrics.localRelightMs,
      blockReads: lightingMetrics.blockReads,
      lightReads: lightingMetrics.lightReads,
      lightWrites: lightingMetrics.lightWrites,
      opacityQueries: lightingMetrics.opacityQueries,
      emissionQueries: lightingMetrics.emissionQueries,
      coordinateConversions: lightingMetrics.coordinateConversions,
      chunkLookups: lightingMetrics.chunkLookups,
      missingChunkLookups: lightingMetrics.missingChunkLookups,
      boundaryTraversals: lightingMetrics.boundaryTraversals,
      queuePushes: lightingMetrics.queuePushes,
      removeQueuePushes: lightingMetrics.removeQueuePushes,
      queueNodeAllocations: lightingMetrics.queueNodeAllocations,
      remeshFanOutChunks: lightingMetrics.remeshFanOutChunks,
    });

    const fogState = this.fogController.compute({
      eyeX: camera.position.x, eyeY: camera.position.y, eyeZ: camera.position.z,
      overworldColorHex: atmos.horizon.hex,
      overworldDensityMultiplier: atmos.fogDensityMultiplier,
      // Beta WorldProviderHell.func_4096_a — constant (0.2, 0.03, 0.03).
      dimensionFogColor: dimension.sky.constantFogColor,
      renderDistance: this.chunkStreamer.getRenderDistance(),
    });
    this.renderer.setFogState(fogState);
    this.blockHighlight.setTarget(this.interactionController.getCurrentHit());
    const activeMiningPos = this.interactionController.breakingController.getMiningBlockPos(); const progress = this.interactionController.breakingController.getProgress();
    this.destroyOverlayRenderer.update(activeMiningPos, progress);
    const totalTicksForAlpha = this.worldTime.getTotalTicks();
    const entityAlpha = totalTicksForAlpha - Math.floor(totalTicksForAlpha);
    this.entityManager.render(entityAlpha);
    this.minecartRenderSystem.update(entityAlpha, this.entityLighting);
    const minecartAudioSeen = new Set<string>();
    this.entityManager.forEachActive((entity) => {
      if (entity instanceof MinecartEntity) {
        minecartAudioSeen.add(entity.uuid);
        const speed = Math.hypot(entity.velocity.x, entity.velocity.z);
        this.audioManager.setMinecartLoop(entity.uuid, entity.riddenByEntity === this.player, speed, entity.position.x, entity.position.y, entity.position.z);
      }
    });
    for (const uuid of this.activeMinecartAudioLoops) {
      if (!minecartAudioSeen.has(uuid)) this.audioManager.stopMinecartLoops(uuid);
    }
    this.activeMinecartAudioLoops.clear();
    for (const uuid of minecartAudioSeen) this.activeMinecartAudioLoops.add(uuid);
    this.boatRenderer.update(this.entityManager, entityAlpha);
    this.entityParticles.update(deltaSeconds);
    this.debugStatsCollector.recordFrame(deltaSeconds);
    if (this.debugOverlay.isVisible()) {
      const debugCollectStart = performance.now();
      const debugStats = this.debugStatsCollector.collect();
      const debugCollectMs = performance.now() - debugCollectStart;
      const debugRenderStart = performance.now();
      this.debugOverlay.render(debugStats);
      this.performanceProfiler.recordDebugOverlayTimings(debugCollectMs, performance.now() - debugRenderStart);
    } else {
      this.performanceProfiler.recordDebugOverlayTimings(0, 0);
    }
    for (const system of this.updatables) system.update(deltaSeconds);

    this.performanceProfiler.recordMeshUpload(this.chunkRenderer.getMeshUploadsThisFrame());
    // Geometry-memory estimation walks every chunk geometry, so it is sampled
    // on a slow timer and only while the internal profiler is enabled. It is
    // profiler data, not F3 data, and must never be tied to overlay visibility.
    if (this.performanceProfiler.isEnabled()) {
      const profilerNow = performance.now();
      if (profilerNow >= this.nextGeometryMemorySampleMs) {
        this.performanceProfiler.setApproximateGeometryMemoryMb(this.chunkRenderer.getApproximateGeometryMemoryBytes() / (1024 * 1024));
        this.nextGeometryMemorySampleMs = profilerNow + GEOMETRY_MEMORY_SAMPLE_MS;
      }
    }
    this.performanceProfiler.endUpdate();
    this.performanceProfiler.beginRender();
    this.renderer.renderer.clear(); this.renderer.render();
    if (this.cameraModeController.getMode() === CameraMode.FIRST_PERSON) { this.renderer.renderer.clearDepth(); this.renderer.renderer.render(this.firstPersonArmRenderer.scene, camera); }

    this.hudRenderer.update(this.selectedSlot);
    const layoutScale = this.hotbarHudRenderer.getLayout().scale;
    this.inventoryController.updateScale(layoutScale); this.craftingTableController.updateScale(layoutScale); this.furnaceController.updateScale(layoutScale); this.chestController.updateScale(layoutScale);
    if (this.inventoryController.isOpen) this.inventoryController.renderAll();
    if (this.craftingTableController.isOpen) this.craftingTableController.renderAll();
    if (this.furnaceController.isOpen) this.furnaceController.renderAll();
    if (this.chestController.isOpen) this.chestController.renderAll();
    this.hudRenderer.render();
    const renderInfo = this.renderer.renderer.info;
    this.performanceProfiler.recordRenderStats({
      drawCalls: renderInfo.render.calls,
      triangles: renderInfo.render.triangles,
      geometries: renderInfo.memory.geometries,
      textures: renderInfo.memory.textures,
    });
    this.performanceProfiler.endRender(); this.performanceProfiler.endFrame();
  };


  private handlePointerLockLost(): void {
    if (this.simulationPaused || !this.running || this.isAnyMenuOpen()) return;
    this.onPauseRequested?.();
  }

  private isAnyMenuOpen(): boolean {
    return this.inventoryController.isOpen
      || this.creativeInventoryController.isOpen
      || this.craftingTableController.isOpen
      || this.furnaceController.isOpen
      || this.chestController.isOpen
      || this.signController.isOpen
      || this.deathScreen.isOpen;
  }

  /** Samples a 3x3 listener neighbourhood four times per second; no vertical world scans. */
  private sampleRainCover(x: number, y: number, z: number): number {
    let exposed = 0; let known = 0;
    for (const ox of RAIN_COVER_OFFSETS) for (const oz of RAIN_COVER_OFFSETS) {
      const wx = Math.floor(x + ox), wz = Math.floor(z + oz); const chunk = this.chunkManager.getChunk(Math.floor(wx / 16), Math.floor(wz / 16));
      if (chunk === undefined) continue;
      const lx = ((wx % 16) + 16) % 16, lz = ((wz % 16) + 16) % 16; const height = chunk.getHeight(lx, lz); known++;
      if (y + 0.1 >= height) exposed++;
    }
    if (known === 0) return 0;
    const openness = exposed / known;
    return 1 - openness;
  }

  private updatePlayerFootsteps(movement: { readonly previousX?: number; readonly previousZ?: number; readonly currentX?: number; readonly currentZ?: number; readonly grounded: boolean; readonly inWater?: boolean; readonly climbing?: boolean }): void {
    if (!movement.grounded || movement.inWater || movement.climbing || this.player.isFlying || this.player.ridingEntity !== null) return;
    const dx = (movement.currentX ?? this.player.position.x) - (movement.previousX ?? this.player.position.x);
    const dz = (movement.currentZ ?? this.player.position.z) - (movement.previousZ ?? this.player.position.z);
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.001) return;
    // Beta Entity.moveEntity: distanceWalkedModified += horizontalDistance * 0.6.
    this.playerStepDistance += distance * 0.6;
    // A bounded carry-forward loop preserves long-frame distance without a cadence burst.
    let emitted = 0;
    while (this.playerStepDistance > this.playerNextStepDistance && emitted < 2) {
      this.playerNextStepDistance++;
      emitted++;
      const bx = Math.floor(this.player.position.x), by = Math.floor(this.player.position.y - 0.1), bz = Math.floor(this.player.position.z);
      const sound = this.blockRegistry.getById(this.blockUpdateWorld.getBlock(bx, by, bz))?.sound;
      if (sound) this.audioManager.play({ type: 'step', material: sound.step, x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, volume: (sound.volume ?? 1) * 0.15, pitch: sound.pitch ?? 1 });
    }
  }

  private countDirtyChunks(): number {
    let dirtyChunks = 0;
    for (const chunk of this.chunkManager) if (chunk.isPersistenceDirty()) dirtyChunks++;
    return dirtyChunks;
  }

  private currentMetadata(): WorldMetadata {
    const metadata = this.persistence.getMetadata();
    if (metadata === null) throw new Error('No world metadata loaded');
    return metadata;
  }

  private snapshotMetadata(): WorldMetadata {
    const weather = this.weatherController.getState(); const serialized = InventorySerializer.serialize(this.inventory, this.selectedSlot);
    return { ...this.currentMetadata(), player: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, yaw: this.cameraController.getYaw(), pitch: this.cameraController.getPitch() }, playerHealth:{health:this.player.health,maxHealth:this.player.maxHealth},playerFood:{hunger:this.player.hunger,saturation:this.player.saturation,exhaustion:this.player.exhaustion}, gameMode:this.player.gameMode, timeTicks: this.worldTime.getTotalTicks(), weather: { raining: weather.raining, thundering: weather.thundering, rainTime: weather.rainTime, thunderTime: weather.thunderTime }, inventory: serialized.inventory, armour: serialized.armour, selectedHotbarSlot: serialized.selectedHotbarSlot, furnaces: this.furnaceManager.serialize(), chests: this.chestManager.serialize(), signs: this.signManager.serialize() };
  }

  /**
   * Persist a metadata snapshot on the serialized write lane. Autosave / death /
   * debug callers fire-and-forget; the Save-and-Quit bridge calls the service
   * directly so it can await + barrier. Background metadata failures are logged.
   */
  private saveMetadata(force: boolean): Promise<void> {
    const priority = force ? WRITE_PRIORITY_FORCED : WRITE_PRIORITY_BACKGROUND;
    const snapshot = this.snapshotMetadata();
    this.lastMetadataJson = JSON.stringify(snapshot);
    return this.persistence.saveMetadata(snapshot, priority).catch((error) => {
      console.warn('[Engine] metadata save failed:', error);
    });
  }

  /** True when the current session metadata differs from the last saved snapshot. */
  private metadataDirty(): boolean {
    return this.lastMetadataJson !== JSON.stringify(this.snapshotMetadataSafe());
  }

  /**
   * Service state-change handler: owns autosave-failure recovery (correction 7)
   * and re-publishes the aggregated persistence-risk snapshot (correction 8).
   */
  private onPersistenceStateChanged(): void {
    const diag = this.persistence.getDiagnostics();
    if (diag.lastError !== null && !this.autosavePaused && !this.saveExitActive) {
      // Pause further background persistence on failure; preserve dirty state and
      // record the error. Resumed by resumeFromFailedSave / a successful forced save.
      this.autosavePaused = true;
      this.autosaveStats.lastFailure = diag.lastError.message;
      this.autosaveStats.lastFailureMs = diag.lastError.timeMs;
      console.warn('[Engine] background persistence failed; pausing autosave until recovery:', diag.lastError.message);
    }
    this.emitPersistenceRisk();
  }

  /**
   * Bounded background autosave, triggered externally by the tick loop (the
   * service has no timers). Skip policy (corrections 3 & 7): skip while quiescing,
   * during an active Save-and-Quit, while autosave is paused after a failure,
   * while the write lane already has queued background work, or when nothing is
   * dirty. At most one bounded batch is accepted per pump; in-flight chunks are
   * never re-selected.
   */
  private pumpChunkSaves(): void {
    this.autosaveStats.lastPumpMs = performance.now();
    const diag = this.persistence.getDiagnostics();
    const dirtyCount = this.countDirtyChunks();
    this.autosaveStats.lastDirtyCount = dirtyCount;
    this.autosaveStats.lastSkippedInFlight = diag.inFlightChunks;
    if (this.quiescing || this.saveExitActive || this.autosavePaused) { this.autosaveStats.lastSelected = 0; return; }
    if (diag.closing || diag.closed) { this.autosaveStats.lastSelected = 0; return; }
    if (diag.pendingBackgroundSaves > 0) { this.autosaveStats.lastSelected = 0; return; }
    if (dirtyCount === 0) { this.autosaveStats.lastSelected = 0; return; }
    void this.persistence.saveSomeDirty(this.chunkManager.getPersistenceDirtyChunks(), CHUNK_SAVE_PUMP_MAX_CHUNKS).then((count) => {
      this.autosaveStats.lastSelected = count;
      if (count > 0) this.autosaveStats.lastSuccessMs = performance.now();
    }).catch((error) => {
      console.warn('[Engine] autosave pump failed:', error);
    });
  }

  private updateHeldItemMesh(): void {
    const stack = this.inventory.getStack(this.selectedSlot);
    if (stack === null) { this.applyHeldItemVisibility(false); } else {
      const category = classifyItemRender(stack.identity, this.blockRegistry); const def = this.blockRegistry.getById(stack.identity.id as number);
      if (category === 'unsupported') {
        const newGeo = BlockItemModelBuilder.buildDebugPlaceholder();
        this.firstPersonHeldBlockMesh.geometry.dispose(); this.firstPersonHeldBlockMesh.geometry = newGeo; this.firstPersonHeldBlockMesh.material = this.heldBlockMaterial;
        this.thirdPersonHeldBlockMesh.geometry.dispose(); this.thirdPersonHeldBlockMesh.geometry = newGeo.clone(); this.thirdPersonHeldBlockMesh.material = this.heldBlockMaterial;
      } else if (category === 'block_3d' && def !== undefined) {
        const newGeo = BlockItemModelBuilder.build3DGeometry(def, this.atlas);
        this.firstPersonHeldBlockMesh.geometry.dispose(); this.firstPersonHeldBlockMesh.geometry = newGeo; this.firstPersonHeldBlockMesh.material = this.heldBlockMaterial;
        this.thirdPersonHeldBlockMesh.geometry.dispose(); this.thirdPersonHeldBlockMesh.geometry = newGeo.clone(); this.thirdPersonHeldBlockMesh.material = this.heldBlockMaterial;
      } else if (category === 'block_flat' && def !== undefined) {
        const newGeo = BlockItemModelBuilder.buildFlatGeometry(def, this.atlas);
        this.firstPersonHeldBlockMesh.geometry.dispose(); this.firstPersonHeldBlockMesh.geometry = newGeo; this.firstPersonHeldBlockMesh.material = this.heldBlockMaterial;
        this.thirdPersonHeldBlockMesh.geometry.dispose(); this.thirdPersonHeldBlockMesh.geometry = newGeo.clone(); this.thirdPersonHeldBlockMesh.material = this.heldBlockMaterial;
      } else {
        // Resolve through the icon resolver so numeric ids work, and keep the
        // held clock/compass on the same animated frame the HUD shows.
        const iconName = this.hotbarHudRenderer.getSlotContentRenderer()['itemIcons'].resolveTextureName(stack.identity.id);
        const uvRect = this.itemAtlas.getUvRect(iconName) ?? this.itemAtlas.getUvRect(stack.identity.id as string);
        const u0 = uvRect?.u0 ?? 0; const v0 = uvRect?.v0 ?? 0; const u1 = uvRect?.u1 ?? 1; const v1 = uvRect?.v1 ?? 1;
        const newGeo = this.createBillboardGeometry(u0, v0, u1, v1, uvRect === undefined);
        this.firstPersonHeldBlockMesh.geometry.dispose(); this.firstPersonHeldBlockMesh.geometry = newGeo; this.firstPersonHeldBlockMesh.material = this.itemHeldMaterial;
        this.thirdPersonHeldBlockMesh.geometry.dispose(); this.thirdPersonHeldBlockMesh.geometry = newGeo.clone(); this.thirdPersonHeldBlockMesh.material = this.itemHeldMaterial;
      }
      // Third-person visuals are rebuilt by the dedicated renderer, which
      // shares the hotbar's animated-icon frames.
      this.thirdPersonHeldItemRenderer.update(stack);
      // Visibility is owned by applyHeldItemVisibility(), which follows the
      // camera mode.
      this.applyHeldItemVisibility(true);
    }
  }

  private thirdPersonHeldPose(stack: ItemStack | null): 'none' | 'block' | 'flat' | 'tool' | 'bow' | 'fishing_rod' | 'food' | 'use' {
    if (stack === null) return 'none';
    const definition = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
    const id = definition?.id ?? String(stack.identity.id);
    if (id === 'bow' || id.startsWith('bow_')) return 'bow';
    if (id === 'fishing_rod' || id.startsWith('fishing_rod')) return 'fishing_rod';
    if (definition?.useAction === 'eat') return 'food';
    const category = classifyItemRender(stack.identity, this.blockRegistry);
    if (category === 'block3d' || category === 'block_3d') return 'block';
    if (category === 'tool') return 'tool';
    return 'flat';
  }

  /**
   * Shows the held item on the third-person player model only when the camera
   * is actually in third person. The first-person copy lives in a separate
   * overlay scene and is driven by FirstPersonHeldItemRenderer.
   */
  private applyHeldItemVisibility(hasItem: boolean): void {
    const thirdPerson = this.cameraModeController.getMode() !== CameraMode.FIRST_PERSON;
    // Third person is owned by ThirdPersonHeldItemRenderer, which resolves
    // clock/compass through the same AnimatedIconFrames instance as the
    // hotbar and inventory. The older per-mesh path built its icon from the
    // item atlas instead, so the hand could show a different frame from the
    // HUD; it is kept hidden rather than deleted because the first-person
    // overlay still shares its geometry builders.
    this.thirdPersonHeldBlockMesh.visible = false;
    this.firstPersonHeldBlockMesh.visible = false;
    this.thirdPersonHeldItemRenderer.setVisible(hasItem && thirdPerson);
  }

  /**
   * Keeps the third-person held item in step with the animated-icon frame
   * source. Clock and compass change frame without the stack itself changing,
   * so the slot-change check in `update()` never fires for them; this runs
   * every frame and is a no-op unless the cached key actually moved.
   */
  private updateThirdPersonAnimatedHeldItem(): void {
    this.thirdPersonHeldItemRenderer.update(this.inventory.getStack(this.selectedSlot));
  }

  /**
   * Beta `EntityPlayer.sleepInBedAt` sets the player's spawn to the bed, so
   * dying later returns them there instead of the world spawn.
   *
   * `worldSpawnPoint` and the respawn controller both hold a reference to the
   * same metadata spawn object, so mutating it in place updates respawn and
   * the compass together, and the new value is written out by the next
   * metadata save.
   */
  private setRespawnPointToBed(bedX: number, bedY: number, bedZ: number): void {
    this.worldSpawnPoint.x = bedX + 0.5;
    this.worldSpawnPoint.y = bedY + 1;
    this.worldSpawnPoint.z = bedZ + 0.5;
    void this.saveMetadata(true);
  }

  private createBillboardGeometry(u0: number, v0: number, u1: number, v1: number, isMissing = false): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry(); const half = 0.25;
    const positions = new Float32Array([-half, half, 0.001, half, half, 0.001, -half, -half, 0.001, half, -half, 0.001, -half, half, -0.001, half, half, -0.001, -half, -half, -0.001, half, -half, -0.001]);
    const uvs = new Float32Array([u0, v0, u1, v0, u0, v1, u1, v1, u1, v0, u0, v0, u1, v1, u0, v1]);
    const colors = new Float32Array(24); const r = 1.0; const g = isMissing ? 0.0 : 1.0; const b = 1.0;
    for (let i = 0; i < 8; i++) { colors[i * 3 + 0] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; }
    geom.setIndex([0, 2, 1, 1, 2, 3, 5, 6, 4, 7, 6, 5]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals(); return geom;
  }

  /** Owns the Beta sleep timeline, camera pose and screen fade. */
  private readonly sleepController = new SleepController();
  private readonly sleepOverlay = new SleepOverlayRenderer();
  private readonly underwaterOverlay = new UnderwaterOverlayRenderer();
  private readonly fishingLine: FishingLineRenderer;

  /**
   * Beta `EntityPlayer.sleepInBedAt` success path.
   *
   * The player is laid on the bed and the sleep timeline starts; the dawn
   * skip happens later, when the timer reaches Beta's 100-tick "fully asleep"
   * point, rather than instantly.
   */
  private beginSleep(bedX: number, bedY: number, bedZ: number, direction: number): void {
    this.sleepController.beginSleep({ x: bedX, y: bedY, z: bedZ, direction });
    this.setRespawnPointToBed(bedX, bedY, bedZ);

    const pose = sleepPoseFor({ x: bedX, y: bedY, z: bedZ, direction });
    this.player.position.x = pose.x;
    this.player.position.y = pose.y;
    this.player.position.z = pose.z;
    this.player.velocity.x = 0;
    this.player.velocity.y = 0;
    this.player.velocity.z = 0;
    this.player.isSprinting = false;
    this.cameraController.setRotation(pose.yaw, 0);
  }

  /**
   * Drives the sleep timeline each tick: holds the player in place, applies
   * the dawn skip once fully asleep, and wakes them if the bed goes away.
   */
  private tickSleep(): void {
    if (!this.sleepController.isSleeping() && this.sleepController.getPhase() === 'awake') {
      this.sleepController.tick();
      return;
    }

    if (this.sleepController.isSleeping()) {
      const bed = this.sleepController.getBed();
      // Losing the bed (broken, or the chunk unloaded) must not strand the
      // player in the sleeping pose.
      if (bed === null || this.blockUpdateWorld.getBlock(bed.x, bed.y, bed.z) !== BlockIds.Bed) {
        this.endSleep('bed-destroyed');
        return;
      }
      if (!this.player.isAlive()) {
        this.endSleep('died');
        return;
      }
      // Beta zeroes motion every tick while asleep.
      this.player.velocity.x = 0;
      this.player.velocity.y = 0;
      this.player.velocity.z = 0;
      const pose = sleepPoseFor(bed);
      this.player.position.x = pose.x;
      this.player.position.y = pose.y;
      this.player.position.z = pose.z;
    }

    if (this.sleepController.tick() === 'advance-time') {
      this.advanceToDawn();
      this.endSleep('dawn');
    }
  }

  /**
   * Beta `World.wakeUpAllPlayers`: advance to the start of the next day
   * (`time + 24000` rounded down to a day boundary).
   */
  private advanceToDawn(): void {
    const total = this.worldTime.getTotalTicks();
    const nextDawn = total + 24000 - ((total + 24000) % 24000);
    this.worldTime.addTicks(nextDawn - total);
  }

  /**
   * Ends sleep and restores normal state. Safe to call repeatedly and from
   * any path (dawn, interruption, death, bed destruction, teardown), so the
   * player and camera can never be left stuck asleep.
   */
  private endSleep(reason: WakeReason): void {
    const bed = this.sleepController.getBed();
    if (bed !== null && this.blockUpdateWorld.getBlock(bed.x, bed.y, bed.z) === BlockIds.Bed) {
      // Clear Beta's occupied bit (4) on both halves.
      const metadata = this.blockUpdateWorld.getBlockMetadata(bed.x, bed.y, bed.z);
      this.blockUpdateWorld.setBlockMetadata(bed.x, bed.y, bed.z, metadata & ~4, { notifyNeighbours: false });
      const offset = BED_FOOT_TO_HEAD[metadata & 3] ?? [0, 1];
      const headX = bed.x + offset[0];
      const headZ = bed.z + offset[1];
      if (this.blockUpdateWorld.getBlock(headX, bed.y, headZ) === BlockIds.Bed) {
        const headMeta = this.blockUpdateWorld.getBlockMetadata(headX, bed.y, headZ);
        this.blockUpdateWorld.setBlockMetadata(headX, bed.y, headZ, headMeta & ~4, { notifyNeighbours: false });
      }
      // Beta stands the player beside the bed rather than inside it.
      this.player.position.x = bed.x + 0.5;
      this.player.position.y = bed.y + 1;
      this.player.position.z = bed.z + 0.5;
    }

    this.sleepController.wake(reason);
  }

  /**
   * Applies the sleeping camera pose and screen fade. Beta pins the view to
   * the bed and tints the screen; both are derived from the sleep timeline so
   * they cannot desync from the simulation.
   */
  private updateSleepPresentation(): void {
    this.sleepOverlay.setAlpha(this.sleepController.getOverlayAlpha());
    const pose = this.sleepController.getCameraPose();
    if (pose === null) return;
    const camera = this.renderer.camera;
    camera.position.set(pose.x, pose.y, pose.z);
    this.cameraController.setRotation(pose.yaw, 0);
  }

  /** True while the player is in bed; suppresses normal input and camera. */
  public isPlayerSleeping(): boolean {
    return this.sleepController.isSleeping();
  }

  /**
   * Keeps the compass and clock icons in step with world state. Beta redraws
   * these procedurally each tick; this project selects the matching frame from
   * the shipped strip instead, so the atlas is only re-uploaded when the frame
   * actually changes.
   */
  /**
   * Draws the line from the rod in the player's hand to the bobber, and hides
   * it the instant the bobber is gone.
   */
  private updateFishingLine(): void {
    const bobber = this.interactionController.getActiveBobber();
    if (bobber === null) {
      this.fishingLine.clear();
      return;
    }
    // The line must leave the ROD, not an arbitrary body coordinate.
    //
    // Third person: `ThirdPersonHeldItemRenderer.rodTip` is parented to the
    // player model's right-hand attachment, so it already inherits the arm
    // swing, body yaw and model scale. Reading its world matrix gives the
    // true rod-tip position with no duplicated trigonometry.
    //
    // First person: the rod is drawn in the overlay scene by the
    // first-person renderer, so the tip is derived from the camera basis
    // using the shared FIRST_PERSON_ROD_TIP_OFFSET constant.
    let handX: number;
    let handY: number;
    let handZ: number;
    if (this.cameraModeController.getMode() === CameraMode.FIRST_PERSON) {
      const camera = this.renderer.camera;
      FISHING_TIP_LOCAL.set(
        FIRST_PERSON_ROD_TIP_OFFSET[0],
        FIRST_PERSON_ROD_TIP_OFFSET[1],
        FIRST_PERSON_ROD_TIP_OFFSET[2],
      );
      FISHING_TIP_LOCAL.applyQuaternion(camera.quaternion);
      handX = camera.position.x + FISHING_TIP_LOCAL.x;
      handY = camera.position.y + FISHING_TIP_LOCAL.y;
      handZ = camera.position.z + FISHING_TIP_LOCAL.z;
    } else {
      const tip = this.thirdPersonHeldItemRenderer.rodTip;
      tip.updateWorldMatrix(true, false);
      tip.getWorldPosition(FISHING_TIP_WORLD);
      handX = FISHING_TIP_WORLD.x;
      handY = FISHING_TIP_WORLD.y;
      handZ = FISHING_TIP_WORLD.z;
    }

    this.fishingLine.update(
      { x: handX, y: handY, z: handZ },
      // Beta draws the line to the bobber's centre, offset a quarter block up.
      { x: bobber.position.x, y: bobber.position.y + 0.25, z: bobber.position.z },
    );
  }

  /** Set when a clock/compass frame changed and open UIs need a redraw. */
  private animatedIconsDirty = false;

  /**
   * Re-renders whichever container screen is open so its clock/compass slots
   * pick up the new frame. Cheap because it only runs on an actual change.
   */
  private refreshOpenContainerIcons(): void {
    if (this.inventoryController.isOpen) this.inventoryController.renderAll();
    else if (this.creativeInventoryController.isOpen) this.creativeInventoryController.render();
  }

  /**
   * Beta shows the water overlay only while the CAMERA is inside water, not
   * merely while the player's feet are wet, so this samples the eye cell.
   */
  /**
   * Beta `randomDisplayTick` ambience for fire and liquids: positional
   * one-shots rolled per nearby block, never a permanent global loop, so they
   * fade out naturally as the source is removed or falls out of range.
   */
  /**
   * Beta portal contact, charge and travel — run on the fixed 20 Hz tick, not
   * per rendered frame, so the timer is frame-rate independent.
   *
   * Portals are deliberately non-solid (Beta returns null from
   * `getCollisionBoundingBoxFromPool`), so contact CANNOT come from the
   * collision system. An explicit AABB overlap against the portal's visible
   * plane is used instead.
   */
  private tickPortalTravel(): void {
    // A transition owns the world; never evaluate contact while one runs.
    if (this.dimensionTransition.isActive()) return;

    const world = {
      getBlock: (x: number, y: number, z: number) => this.blockUpdateWorld.getBlock(x, y, z),
      isLoaded: (x: number, z: number) => this.blockUpdateWorld.isLoaded(x, z),
    };

    if (this.player.isAlive() && isInsidePortal(world, this.player.getAABB())) {
      this.portalTravel.setInPortal();
    }

    const result = this.portalTravel.tick();

    if (result.startedContact) {
      // Beta plays portal.trigger exactly once, as the charge begins.
      this.audioManager.emit({
        id: 'portal.trigger',
        kind: 'ambient',
        x: this.player.position.x, y: this.player.position.y, z: this.player.position.z,
        volume: 1,
        pitch: Math.random() * 0.4 + 0.8,
        attenuationDistance: 16,
      });
    }

    if (result.shouldTravel) {
      this.beginPortalTransition();
    }

    this.emitPortalAmbience();
  }

  /**
   * Beta `BlockPortal.randomDisplayTick`: a 1-in-100 ambient hum per portal
   * block and four particles per tick, both positional and distance-culled.
   */
  private emitPortalAmbience(): void {
    const particles = this.portalParticles;
    if (particles === undefined) return;

    const camera = this.renderer.camera;
    const cx = Math.floor(camera.position.x);
    const cy = Math.floor(camera.position.y);
    const cz = Math.floor(camera.position.z);
    const radius = PORTAL_AMBIENCE_RADIUS;

    const world = {
      getBlock: (x: number, y: number, z: number) => this.blockUpdateWorld.getBlock(x, y, z),
      setBlock: () => undefined,
      isLoaded: (x: number, z: number) => this.blockUpdateWorld.isLoaded(x, z),
    };

    for (let y = cy - radius; y <= cy + radius; y++) {
      if (y < 0 || y >= CHUNK_SIZE_Y) continue;
      for (let z = cz - radius; z <= cz + radius; z++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (!this.blockUpdateWorld.isLoaded(x, z)) continue;
          if (this.blockUpdateWorld.getBlock(x, y, z) !== BlockIds.Portal) continue;

          const axis = portalAxisAt(world, x, y, z);
          particles.emit(x, y, z, axis, camera.position.x, camera.position.y, camera.position.z);

          // Beta: nextInt(100) == 0 per portal block per random display tick.
          if (Math.random() < 0.01) {
            this.audioManager.emit({
              id: 'portal.portal',
              kind: 'ambient',
              x: x + 0.5, y: y + 0.5, z: z + 0.5,
              volume: PORTAL_AMBIENCE_VOLUME,
              pitch: Math.random() * 0.4 + 0.8,
              attenuationDistance: 16,
            });
          }
        }
      }
    }
  }

  /**
   * Starts an asynchronous dimension switch: play the travel sound once, show
   * the loading screen, and freeze the source world. The destination is only
   * revealed once the critical area is renderable.
   */
  private beginPortalTransition(): void {
    const source = this.activeDimension;
    const destinationId = this.activeDimensionId === DIMENSION_OVERWORLD ? DIMENSION_NETHER : DIMENSION_OVERWORLD;
    const destination = this.dimensions.get(destinationId);
    if (destination === undefined) {
      this.portalTravel.abortTransition();
      return;
    }

    // Beta scales X/Z by the ratio of the two dimensions' scales and keeps Y.
    const targetX = convertCoordinate(this.player.position.x, source.coordinateScale, destination.coordinateScale);
    const targetZ = convertCoordinate(this.player.position.z, source.coordinateScale, destination.coordinateScale);

    const started = this.dimensionTransition.begin({
      dimensionId: destinationId,
      x: targetX,
      y: this.player.position.y,
      z: targetZ,
    });
    // A second trigger while one is running must be ignored entirely.
    if (!started) return;

    // Beta plays portal.travel exactly once, as the switch fires.
    this.audioManager.emit({
      id: 'portal.travel',
      kind: 'ambient',
      x: this.player.position.x, y: this.player.position.y, z: this.player.position.z,
      volume: 1,
      pitch: Math.random() * 0.4 + 0.8,
      attenuationDistance: 16,
    });

    // Freeze the source world before anything is torn down, and clear live
    // particles so none survive into the destination.
    this.setPaused(true);
    this.portalParticles?.clear();
    this.onDimensionTransitionRequested?.(destinationId, targetX, this.player.position.y, targetZ);
  }

  /**
   * Performs the destination half of a dimension switch, driving the
   * transition's readiness flags as each stage completes.
   *
   * The order is load-bearing and mirrors the requirement:
   *   save source -> activate destination context -> load critical chunks ->
   *   establish lighting -> find/create the destination portal -> position the
   *   player -> report ready.
   *
   * Only the CRITICAL ring is awaited, never the full render distance: the
   * player must not stare at a loading screen while chunks 6 rings out
   * generate, but must also never be revealed into an empty void.
   *
   * Called by the application layer, which owns the loading screen. The engine
   * stays paused throughout, so nothing here races the simulation tick.
   */
  public async activateDimension(
    dimensionId: DimensionId,
    targetX: number,
    targetY: number,
    targetZ: number,
  ): Promise<boolean> {
    const destination = this.dimensions.get(dimensionId);
    if (destination === undefined) return false;
    const transition = this.dimensionTransition;

    // 1. Persist the dimension we are leaving. Chunk records are namespaced by
    //    dimension, so this must happen BEFORE persistence is re-pointed or
    //    Nether chunks would be written into Overworld keys.
    this.savePortalIndex();
    await this.saveActiveDimensionState();

    // 2. Tear down the source world's residency. Meshes must go with the
    //    chunks or the old dimension would still be drawn behind the new one.
    for (const chunk of [...this.chunkManager]) {
      this.chunkRenderer.removeChunkMesh(chunk.chunkX, chunk.chunkZ);
    }
    this.chunkManager.clear();
    this.entityManager.dispose();
    this.portalParticles?.clear();
    // Stale Overworld lightning must not fire thunder in the destination.
    this.lightningManager.clear();

    // 3. Activate the destination context. The generation counter is bumped so
    //    any worker result still in flight for the old dimension is rejected
    //    on arrival rather than integrated into the wrong world.
    this.contextGeneration += 1;
    this.activeDimensionId = dimensionId;
    // Biome spawn tables are an Overworld concept; drop any cached ones so the
    // destination's authoritative dimension table is the only spawn source.
    this.naturalMobSpawner.clearDimensionCaches();
    this.worldGenerator = destination.createGenerator(this.worldSeed);
    this.persistence.setDimension(dimensionId);

    const metadata = this.persistence.getMetadata();
    const trustPersistedLighting =
      metadata !== null &&
      metadata.saveVersion === SAVE_VERSION &&
      metadata.generatorVersion === GENERATOR_VERSION;

    this.chunkStreamer.rebindContext(
      { worldId: metadata?.worldId ?? '', dimensionId, contextGeneration: this.contextGeneration },
      this.worldGenerator,
      destination.name,
      destination.lighting.hasSkyLight,
      trustPersistedLighting,
    );
    // The portal index is per dimension: load the destination's before any
    // search runs, or the Overworld's anchors would be consulted in the Nether.
    await this.loadPortalIndex();
    transition.updateReadiness({ contextReady: true });

    // 4. Load the critical ring around the (pre-portal) target. The teleporter
    //    needs resident columns to search, so chunks come before the portal.
    const targetChunkX = Math.floor(targetX / CHUNK_SIZE_X);
    const targetChunkZ = Math.floor(targetZ / CHUNK_SIZE_Z);
    const ready = await this.loadCriticalChunks(targetChunkX, targetChunkZ);
    if (!ready) return false;

    // 5. Lighting for the critical ring. Worker-generated chunks arrive with
    //    initial light already computed; borders are reconciled on adoption.
    //    Verify rather than assume, so a missed chunk cannot reveal unlit.
    this.establishCriticalLighting(targetChunkX, targetChunkZ);
    transition.updateReadiness({ lightingReady: true });

    // 6. Find an existing portal or build one (Beta Teleporter). This happens
    //    BEFORE the player is placed and before the loading screen is allowed
    //    to hide, so the Overworld is never revealed and then teleported away
    //    from.
    const placement = await this.resolveDestinationPortal(targetX, targetY, targetZ);
    transition.updateReadiness({ portalReady: true });

    // 7. Position the player and settle the camera on the new location.
    this.player.resetForPortalArrival(placement.x, placement.y, placement.z);
    this.portalTravel.completeTransition();
    transition.updateReadiness({ playerPlaced: true });

    // An existing portal can be far from the scaled target, so the critical
    // ring that must be renderable is the one around the PLAYER, not the one
    // around the original search origin.
    const placementChunkX = Math.floor(placement.x / CHUNK_SIZE_X);
    const placementChunkZ = Math.floor(placement.z / CHUNK_SIZE_Z);
    if (placementChunkX !== targetChunkX || placementChunkZ !== targetChunkZ) {
      await this.loadCriticalChunks(placementChunkX, placementChunkZ);
      this.establishCriticalLighting(placementChunkX, placementChunkZ);
    }

    // 8. Mesh the critical ring so the reveal shows geometry, not holes.
    await this.settleCriticalMeshes(placementChunkX, placementChunkZ);
    transition.updateReadiness({ meshesReady: true });
    this.savePortalIndex();

    return transition.isReadyToReveal();
  }

  /**
   * Persists the dimension being left.
   *
   * Chunk writes are ENQUEUED but deliberately not awaited. Each write
   * captures its dimension at enqueue time, so a queued Overworld chunk still
   * lands in Overworld keys even after persistence is re-pointed at the
   * Nether; there is therefore no correctness reason to block travel on them,
   * and awaiting a full working set (50+ chunks, one storage round-trip each)
   * routinely exceeded the entire transition budget.
   *
   * Only the metadata write is awaited, because `playerDimension` must be
   * durable before the switch: a crash mid-transition should reopen the world
   * in the dimension the player actually ended up in.
   */
  private async saveActiveDimensionState(): Promise<void> {
    try {
      // Metadata is enqueued FIRST. The write lane is serial and ties on
      // priority are broken by acceptance order, so enqueueing it after the
      // chunk batch would make it wait for every chunk write to drain — which
      // is what the transition budget is spent on.
      const metadataSaved = this.persistence.saveMetadata(
        { ...this.snapshotMetadata(), playerDimension: this.activeDimensionId },
        WRITE_PRIORITY_FORCED,
      );

      for (const chunk of this.chunkManager) {
        if (!chunk.isPersistenceDirty()) continue;
        this.persistence.saveChunk(chunk, WRITE_PRIORITY_FORCED).catch((error: unknown) => {
          console.warn('[Dimension] chunk save failed while leaving a dimension:', error);
        });
      }

      await metadataSaved;
    } catch (error) {
      // A failed source save must not strand the player mid-transition; the
      // previously written records on disk are still intact.
      console.warn('[Dimension] saving the source dimension failed:', error);
    }
  }

  /**
   * Pumps the streamer until the critical ring around the target is resident.
   *
   * Chunk loading is asynchronous and normally driven from the render loop,
   * which is frozen during a transition, so it is driven explicitly here.
   */
  private async loadCriticalChunks(centerChunkX: number, centerChunkZ: number): Promise<boolean> {
    const transition = this.dimensionTransition;
    const required = criticalChunkCount();
    const deadline = performance.now() + DIMENSION_CHUNK_LOAD_TIMEOUT_MS;

    while (performance.now() < deadline) {
      let loaded = 0;
      for (let dz = -TRANSITION_CRITICAL_RADIUS; dz <= TRANSITION_CRITICAL_RADIUS; dz++) {
        for (let dx = -TRANSITION_CRITICAL_RADIUS; dx <= TRANSITION_CRITICAL_RADIUS; dx++) {
          const cx = centerChunkX + dx;
          const cz = centerChunkZ + dz;
          if (this.chunkManager.hasChunk(cx, cz)) loaded += 1;
          else this.chunkStreamer.dispatchCriticalLoad(cx, cz);
        }
      }

      transition.updateReadiness({
        criticalChunksLoaded: loaded,
        targetChunkLoaded: this.chunkManager.hasChunk(centerChunkX, centerChunkZ),
      });

      if (loaded >= required) return true;

      // Advance ONLY the chunks requested above. Calling the streamer's normal
      // update() here would re-stream the full render radius and queue ~160
      // chunks nobody is waiting for ahead of the 9 that gate the reveal.
      this.chunkStreamer.pumpCriticalLoads(centerChunkX, centerChunkZ);
      await new Promise((resolve) => setTimeout(resolve, DIMENSION_TRANSITION_POLL_MS));
    }

    return false;
  }

  /**
   * Guarantees the critical ring carries valid light before the reveal.
   *
   * Chunks adopted from the generation worker already hold initial light, but
   * a chunk read from persistence in an older format (or one whose neighbours
   * arrived after it) can still have unreconciled borders.
   */
  private establishCriticalLighting(centerChunkX: number, centerChunkZ: number): void {
    for (let dz = -TRANSITION_CRITICAL_RADIUS; dz <= TRANSITION_CRITICAL_RADIUS; dz++) {
      for (let dx = -TRANSITION_CRITICAL_RADIUS; dx <= TRANSITION_CRITICAL_RADIUS; dx++) {
        const chunk = this.chunkManager.getChunk(centerChunkX + dx, centerChunkZ + dz);
        if (chunk === undefined) continue;
        this.lightEngine.reconcileChunkBorders(chunk);
      }
    }
  }

  /**
   * Beta `Teleporter`: reuse the nearest existing portal, and only build one
   * when the search genuinely fails.
   *
   * Search strategy, in order:
   *   1. Consult the dimension-local portal index for anchors within Beta's
   *      128-block radius, nearest first. The index is a cache, so each
   *      candidate is re-verified against live blocks; if its chunk is not
   *      resident the chunk is loaded on demand before verifying.
   *   2. Fall back to Beta's raw scan over resident columns, which also
   *      catches portals that predate the index.
   *   3. Only if BOTH find nothing, run Beta's safe-placement search and
   *      forced-construction fallback.
   *
   * Step 1 is what fixes return linking. Previously only the 9-chunk critical
   * ring (about +/-16 blocks) was resident when this ran, so a portal 800
   * Overworld blocks away was invisible to the search and every return trip
   * built a redundant portal.
   */
  private async resolveDestinationPortal(x: number, y: number, z: number): Promise<{ x: number; y: number; z: number }> {
    const teleporter = new Teleporter(this.worldSeed + BigInt(this.activeDimensionId));
    const world = {
      getBlock: (bx: number, by: number, bz: number) => this.blockUpdateWorld.getBlock(bx, by, bz),
      setBlock: (bx: number, by: number, bz: number, id: number) => {
        this.blockUpdateWorld.setBlock(bx, by, bz, id as BlockId);
      },
      isLoaded: (bx: number, bz: number) => this.blockUpdateWorld.isLoaded(bx, bz),
      // Beta's 128-block search would otherwise read air out of unloaded
      // space and "find" nothing; restrict it to resident columns.
      isColumnAvailable: (bx: number, bz: number) => this.blockUpdateWorld.isLoaded(bx, bz),
    };

    // --- 1. Indexed candidates, nearest first --------------------------------
    const candidates = this.portalIndex.findNear(x, y, z, PORTAL_SEARCH_RADIUS);
    for (const candidate of candidates) {
      const verified = await this.verifyPortalAnchor(candidate);
      if (verified === undefined) continue;
      // Re-run Beta's own placement rules from the verified anchor so the
      // player is centred in the portal exactly as an in-world find would.
      const placed = teleporter.findExistingPortal(world, verified.x + 0.5, verified.y + 0.5, verified.z + 0.5);
      if (placed !== undefined) return placed;
    }

    // --- 2. Beta raw scan over whatever is resident --------------------------
    const existing = teleporter.findExistingPortal(world, x, y, z);
    if (existing !== undefined) return existing;

    // --- 3. Nothing found anywhere: build one --------------------------------
    const clampedY = Math.max(PORTAL_BUILD_MIN_Y, Math.min(PORTAL_BUILD_MAX_Y, y));
    const built = teleporter.createPortal(world, x, clampedY, z);
    // Register immediately so the return trip links back to this portal.
    this.reindexPortalsAround(built.x, built.z);
    return teleporter.findExistingPortal(world, built.x, built.y, built.z) ?? built;
  }

  /**
   * Confirms an indexed anchor still has a portal block, loading its chunk if
   * necessary.
   *
   * A stale anchor (portal since broken) is dropped from the index and skipped
   * rather than trusted, so the cache can never resurrect a deleted portal.
   */
  private async verifyPortalAnchor(anchor: { x: number; y: number; z: number }): Promise<{ x: number; y: number; z: number } | undefined> {
    const chunkX = Math.floor(anchor.x / CHUNK_SIZE_X);
    const chunkZ = Math.floor(anchor.z / CHUNK_SIZE_Z);

    if (!this.chunkManager.hasChunk(chunkX, chunkZ)) {
      this.chunkStreamer.dispatchCriticalLoad(chunkX, chunkZ);
      const deadline = performance.now() + PORTAL_ANCHOR_LOAD_TIMEOUT_MS;
      while (!this.chunkManager.hasChunk(chunkX, chunkZ) && performance.now() < deadline) {
        this.chunkStreamer.pumpCriticalLoads(chunkX, chunkZ);
        await new Promise((resolve) => setTimeout(resolve, DIMENSION_TRANSITION_POLL_MS));
      }
      if (!this.chunkManager.hasChunk(chunkX, chunkZ)) return undefined;
    }

    if (this.blockUpdateWorld.getBlock(anchor.x, anchor.y, anchor.z) !== BlockIds.Portal) {
      // Stale entry: reconcile the whole chunk so every anchor in it is fixed.
      this.reindexPortalsAround(anchor.x, anchor.z);
      return undefined;
    }

    return anchor;
  }

  /** Re-scans the chunk containing (x, z) and updates the portal index. */
  private reindexPortalsAround(x: number, z: number): void {
    const chunkX = Math.floor(x / CHUNK_SIZE_X);
    const chunkZ = Math.floor(z / CHUNK_SIZE_Z);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) return;
    this.portalIndex.reconcileChunk(chunkX, chunkZ, scanChunkForPortals(chunk));
  }

  /** Loads the active dimension's persisted portal index. */
  private async loadPortalIndex(): Promise<void> {
    this.portalIndex = new PortalIndex();
    try {
      // Scope the portal index by dimension (Overworld key is unchanged for
      // backward compatibility). readRecord/writeRecord take no dimension, so
      // without this every dimension's portal index shares one key and a
      // Nether save overwrites the Overworld index.
      this.portalIndex.deserialize(await this.persistence.readRecord(dimensionScopedKey(this.activeDimensionId, PORTAL_INDEX_RECORD_KEY)));
    } catch (error) {
      // The index is a cache; a failed read degrades to the raw Beta scan.
      console.warn('[Portal] could not load the portal index:', error);
    }
    // Fold in anything already resident, which also covers a first-ever run.
    for (const chunk of this.chunkManager) {
      this.portalIndex.reconcileChunk(chunk.chunkX, chunk.chunkZ, scanChunkForPortals(chunk));
    }
  }

  /** Persists the active dimension's portal index if it changed. */
  private savePortalIndex(): void {
    if (!this.portalIndex.isDirty()) return;
    const bytes = this.portalIndex.serialize();
    this.portalIndex.clearDirty();
    this.persistence.writeRecord(dimensionScopedKey(this.activeDimensionId, PORTAL_INDEX_RECORD_KEY), bytes, WRITE_PRIORITY_FORCED)
      .catch((error: unknown) => { console.warn('[Portal] could not save the portal index:', error); });
  }

  /**
   * Waits for the critical ring's meshes to be built and uploaded.
   *
   * Readiness must be judged on what is actually renderable, not on chunk
   * residency: a resident but unmeshed chunk still reveals as a hole.
   */
  private async settleCriticalMeshes(centerChunkX: number, centerChunkZ: number): Promise<void> {
    const deadline = performance.now() + DIMENSION_MESH_SETTLE_TIMEOUT_MS;
    while (performance.now() < deadline) {
      this.chunkRenderer.update(0, centerChunkX * CHUNK_SIZE_X + 8, centerChunkZ * CHUNK_SIZE_Z + 8);
      const stats = this.chunkRenderer.getMeshingStats();
      if (stats.queued === 0 && stats.pendingUploads === 0) return;
      await new Promise((resolve) => setTimeout(resolve, DIMENSION_TRANSITION_POLL_MS));
    }
  }

  /**
   * Resumes play after a successful transition, or recovers after a failed
   * one. Either way the player ends up unfrozen: a transition failure must
   * never leave the game stuck behind a loading screen.
   */
  public finishDimensionTransition(succeeded: boolean): void {
    if (succeeded) {
      this.dimensionTransition.complete();
      this.portalTravel.resumeNormal();
    } else {
      this.dimensionTransition.abort();
      this.portalTravel.abortTransition();
    }
    this.setPaused(false);
    void this.saveMetadata(true);
  }

  /**
   * Hostile spawn entries for the active dimension, or null to fall back to
   * the Overworld biome tables.
   *
   * The Overworld deliberately returns null so biome-driven spawning is
   * untouched. Any other dimension returns its own list with unimplemented
   * entity types filtered out. The Nether's implemented roster is PigZombie +
   * Ghast; any not-yet-implemented id is dropped rather than attempted.
   */
  private dimensionHostileSpawnEntries(): readonly HostileSpawnEntry[] | null {
    if (this.activeDimensionId === DIMENSION_OVERWORLD) return null;
    const available = this.activeDimension.spawn.monsters.filter((entry) => entry.available);
    return available.flatMap((entry) => {
      const kind = HOSTILE_KIND_BY_ENTITY_ID[entry.entityId];
      return kind === undefined ? [] : [{ kind, weight: entry.weight }];
    });
  }

  /** Passive equivalent of {@link dimensionHostileSpawnEntries}. */
  private dimensionPassiveSpawnEntries(): readonly PassiveSpawnEntry[] | null {
    if (this.activeDimensionId === DIMENSION_OVERWORLD) return null;
    const available = this.activeDimension.spawn.creatures.filter((entry) => entry.available);
    return available.flatMap((entry) => {
      const kind = PASSIVE_KIND_BY_ENTITY_ID[entry.entityId];
      return kind === undefined ? [] : [{ kind, weight: entry.weight }];
    });
  }

  private updateAmbientBlockAudio(): void {
    const camera = this.renderer.camera;
    const sounds = collectAmbientSounds(
      this.blockUpdateWorld,
      camera.position.x, camera.position.y, camera.position.z,
      () => Math.random(),
    );
    for (const sound of sounds) {
      this.audioManager.emit({
        id: sound.id,
        kind: 'ambient',
        x: sound.x, y: sound.y, z: sound.z,
        volume: sound.volume,
        pitch: sound.pitch,
        attenuationDistance: 16,
      });
    }
  }

  private updateUnderwaterOverlay(): void {
    const camera = this.renderer.camera;
    const submerged = isCameraSubmerged(
      camera.position.x, camera.position.y, camera.position.z,
      (x, y, z) => this.blockUpdateWorld.getBlock(x, y, z),
      (id) => id === BlockIds.WaterStill || id === BlockIds.WaterFlowing,
    );
    this.underwaterOverlay.setSubmerged(submerged);
  }

  private updateAnimatedItemIcons(): void {
    // Drive the DOM icon frames (inventory, hotbar, containers). Beta shows
    // one 16x16 frame at a time; the strip must never be rendered whole.
    const frames = this.hotbarHudRenderer.getAnimatedIcons();
    const clockFrames = frames.getFrameCount('clock');
    if (clockFrames > 1) {
      const angle = ((this.worldTime.getCelestialAngle() % 1) + 1) % 1;
      if (frames.setFrame('clock', Math.floor(angle * clockFrames))) this.animatedIconsDirty = true;
    }
    const compassFrames = frames.getFrameCount('compass');
    if (compassFrames > 1) {
      const dx = this.worldSpawnPoint.x - this.player.position.x;
      const dz = this.worldSpawnPoint.z - this.player.position.z;
      const relative = Math.atan2(dz, dx) - this.cameraController.getYaw();
      const turns = ((relative / (Math.PI * 2)) % 1 + 1) % 1;
      if (frames.setFrame('compass', Math.floor(turns * compassFrames))) this.animatedIconsDirty = true;
    }

    // Keep the world-space atlas (held item, dropped items) in step.
    this.animatedIcons.updateClock(this.worldTime.getCelestialAngle());
    this.animatedIcons.updateCompass(
      this.cameraController.getYaw(),
      this.worldSpawnPoint.x - this.player.position.x,
      this.worldSpawnPoint.z - this.player.position.z,
    );

    // The third-person hand reads the same DOM frame source as the hotbar, so
    // refresh it here rather than letting it drift on its own timer.
    this.updateThirdPersonAnimatedHeldItem();
  }

}
