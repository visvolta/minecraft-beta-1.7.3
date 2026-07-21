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
import { PigEntity } from '../entities/living/PigEntity';
import { CowEntity } from '../entities/living/CowEntity';
import { SheepEntity } from '../entities/living/SheepEntity';
import { ChickenEntity } from '../entities/living/ChickenEntity';
import { MobSpawnMenu, type MobType } from '../debug/MobSpawnMenu';
import { SimpleEntityParticleSink } from '../entities/particles/EntityParticleSink';
import { Inventory } from '../inventory/Inventory';
import { InventorySerializer } from '../inventory/InventorySerializer';
import { HotbarHudRenderer } from '../inventory/HotbarHudRenderer';
import { InventoryUi } from '../inventory/InventoryUi';
import { InventoryTooltip } from '../inventory/InventoryTooltip';
import { ChestManager } from '../chest/ChestManager';
import { ChestController } from '../chest/ChestController';
import { ChestUi } from '../chest/ChestUi';
import { ChestRenderer } from '../chest/ChestRenderer';
import { CursorHeldItemRenderer } from '../inventory/CursorHeldItemRenderer';
import { InventoryController } from '../inventory/InventoryController';
import { InventoryInputController } from '../inventory/InventoryInputController';
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
import { BlockIds } from '../blocks/BlockId';
import { classifyItemRender } from '../inventory/ItemRenderClassifier';
import { BlockItemModelBuilder } from '../inventory/BlockItemModelBuilder';
import { ChunkRenderer, attachEntityLighting } from '../rendering/ChunkRenderer';
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
import { registerChestBehaviour } from '../world/behaviours/ChestBehaviour';
import { registerDoorBehaviour } from '../world/behaviours/DoorBehaviour';
import { registerTrapdoorBehaviour } from '../world/behaviours/TrapdoorBehaviour';
import { registerLadderBehaviour } from '../world/behaviours/LadderBehaviour';
import { registerPressurePlateBehaviour } from '../world/behaviours/PressurePlateBehaviour';
import { registerButtonBehaviour } from '../world/behaviours/ButtonBehaviour';
import { registerLeverBehaviour } from '../world/behaviours/LeverBehaviour';
import { SlabBehaviour } from '../world/behaviours/SlabBehaviour';
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
import type { WorldSaveCoordinator } from '../persistence/coordinator/WorldSaveCoordinator';
import { RegionCoordinator } from '../persistence/queue/RegionCoordinator';
import { ChunkPersistenceQueue } from '../persistence/queue/ChunkPersistenceQueue';
import type { WorldStorage } from '../persistence/storage/WorldStorage';
import type { WorldMetadata } from '../persistence/metadata/WorldMetadata';
import { PlayerModel } from '../player/PlayerModel';
import { PlayerAnimator } from '../player/PlayerAnimator';
import { FirstPersonArmRenderer } from '../rendering/FirstPersonArmRenderer';
import { FirstPersonHeldItemRenderer } from '../rendering/FirstPersonHeldItemRenderer.ts';
import { FirstPersonMotionController } from '../player/FirstPersonMotionController';
import { CameraModeController, CameraMode } from '../camera/CameraModeController';
import * as THREE from 'three';
import { PlayerSkinManager } from '../player/PlayerSkinManager';
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
const METADATA_AUTOSAVE_MS = 30_000;

/**
 * Player spawn (feet position). Fixed X/Z with a generously high Y so the
 * player always starts above generated terrain (which varies in height,
 * unlike the old flat world) and falls onto it under gravity + collision.
 * No spawn search or saved spawn data yet — fixed for this stage.
 */

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
  private readonly destroyOverlayRenderer: DestroyOverlayRenderer;
  private readonly itemAtlas: ItemTextureAtlas;
  private readonly itemEntityManager: ItemEntityManager;
  private readonly entityManager: EntityManager;
  private readonly entityParticles: SimpleEntityParticleSink;
  private lastTotalTicks = 0;
  private readonly inventory: Inventory;
  private readonly hotbarHudRenderer: HotbarHudRenderer;
  private readonly inventoryUi: InventoryUi;
  private readonly inventoryTooltip: InventoryTooltip;
  private readonly cursorHeldRenderer: CursorHeldItemRenderer;
  private readonly inventoryController: InventoryController;
  private readonly inventoryInputController: InventoryInputController;
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
  private readonly mobSpawnMenu: MobSpawnMenu;
  private readonly debugController: DebugController;
  private readonly debugStatsCollector: DebugStatsCollector;
  private readonly blockTestGrid: BlockTestGrid;
  private readonly performanceProfiler = new PerformanceProfiler();
  private noClipEnabled = false;
  private rawLightDebugMode = false;
  private ambientOcclusionDebugMode = false;

  private running = false;
  private animationFrameId: number | null = null;
  private readonly regionCoordinator: RegionCoordinator;
  private readonly chunkPersistenceQueue: ChunkPersistenceQueue;
  private lastFrameTimeMs: number | null = null;
  private lastMetadataAutosaveMs = 0;
  private metadataSaveInFlight: Promise<void> | null = null;
  private readonly playerModel: PlayerModel;
  private readonly playerAnimator: PlayerAnimator;
  private readonly firstPersonArmRenderer: FirstPersonArmRenderer;
  private readonly firstPersonMotionController: FirstPersonMotionController;
  private readonly heldItemRenderer: FirstPersonHeldItemRenderer;
  private readonly cameraModeController: CameraModeController;

  private readonly skinManager: PlayerSkinManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly heldBlockMaterial: THREE.MeshBasicMaterial;
  private readonly firstPersonHeldBlockMesh: THREE.Mesh;
  private readonly thirdPersonHeldBlockMesh: THREE.Mesh;
  private lastSelectedStackKey = '';

  private readonly playerModelUniforms: EntityLightingUniforms | undefined;

  public constructor(
    blockRegistry: BlockRegistry,
    atlas: TextureAtlas,
    itemAtlas: ItemTextureAtlas,
    private readonly saveCoordinator: WorldSaveCoordinator,
    private readonly storage: WorldStorage,
    skinManager: PlayerSkinManager
  ) {
    const metadata = saveCoordinator.getMetadata();
    const worldSeed = BigInt(metadata.seed);
    this.atlas = atlas;
    this.itemAtlas = itemAtlas;
    this.blockRegistry = blockRegistry;
    this.skinManager = skinManager;
    this.chunkManager = new ChunkManager();
    this.worldGenerator = new BetaWorldGenerator(worldSeed);
    this.regionCoordinator = new RegionCoordinator(this.storage, metadata.worldId);
    this.chunkPersistenceQueue = new ChunkPersistenceQueue(this.regionCoordinator);
    this.saveCoordinator.attachPersistence(this.chunkManager, this.chunkPersistenceQueue);
    this.worldTime = new WorldTime();
    this.worldTime.setTotalTicks(metadata.timeTicks);

    this.renderer = new Renderer();

    this.input = new Input(this.renderer.domElement);
    this.cameraController = new CameraController(
      this.renderer.camera,
      this.input,
    );
    this.cameraController.setRotation(metadata.player.yaw, metadata.player.pitch);

    this.player = new Player(metadata.player.x, metadata.player.y, metadata.player.z);
    this.playerController = new PlayerController(
      this.input,
      this.cameraController,
      this.player,
    );
    this.blockBehaviourRegistry = new BlockBehaviourRegistry();

    this.lightEngine = new LightEngine(this.chunkManager, blockRegistry);
    this.blockUpdateWorld = new BlockUpdateWorld(this.chunkManager, blockRegistry, this.lightEngine);
    this.playerPhysics = new PlayerPhysics(blockRegistry, this.blockBehaviourRegistry, this.blockUpdateWorld);
    this.cameraModeController = new CameraModeController(this.input, this.blockUpdateWorld, blockRegistry);
    this.playerModel = new PlayerModel();
    this.playerAnimator = new PlayerAnimator();
    this.firstPersonArmRenderer = new FirstPersonArmRenderer();
    this.firstPersonMotionController = new FirstPersonMotionController();

    // Apply the active skin texture to the models
    this.playerModel.updateSkin(this.skinManager);
    this.firstPersonArmRenderer.updateSkin(this.skinManager);

    // Initialize Held Block Material with generalized fog/lighting shader
    this.heldBlockMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.3,
      fog: false, // Exclude foreground hand held blocks from distance fog
    });
    attachEntityLighting(this.heldBlockMaterial);

    this.itemHeldMaterial = new THREE.MeshBasicMaterial({
      map: itemAtlas.texture,
      transparent: true,
      side: THREE.FrontSide,
      alphaTest: 0.1,
    });
    attachEntityLighting(this.itemHeldMaterial);

    // Shared entity foundation (single authoritative simulation owner, driven
    // by the Engine's 20 Hz clock). Created early so specialised entity
    // systems (falling blocks, items) can be wired against it.
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
      rng: new JavaRandom(worldSeed),
      particles: this.entityParticles,
      weather: { isRaining: () => this.weatherController.getState().raining },
      playerPosition: this.player.position,
    });

    // Persist each chunk's owned entities on save and restore them on load.
    this.chunkPersistenceQueue.setEntityHooks({
      serializeChunkEntities: (cx, cz) => this.entityManager.serializeChunkEntities(cx, cz),
      loadChunkEntities: (tags) => this.entityManager.loadChunkEntities(tags),
      hasParkedEntities: (cx, cz) => this.entityManager.hasParkedEntities(cx, cz),
    });

    this.playerModelUniforms = this.playerModel.material.userData.dynamicLightingUniforms as EntityLightingUniforms | undefined;

    // Dummy initial geometries
    this.firstPersonHeldBlockMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.heldBlockMaterial);
    this.thirdPersonHeldBlockMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.heldBlockMaterial);

    this.firstPersonHeldBlockMesh.position.set(
      FIRST_PERSON_HELD_BLOCK_X,
      FIRST_PERSON_HELD_BLOCK_Y,
      FIRST_PERSON_HELD_BLOCK_Z
    );
    this.firstPersonHeldBlockMesh.rotation.set(
      FIRST_PERSON_HELD_BLOCK_PITCH,
      FIRST_PERSON_HELD_BLOCK_YAW,
      FIRST_PERSON_HELD_BLOCK_ROLL
    );
    this.firstPersonHeldBlockMesh.scale.set(
      FIRST_PERSON_HELD_BLOCK_SCALE,
      FIRST_PERSON_HELD_BLOCK_SCALE,
      FIRST_PERSON_HELD_BLOCK_SCALE
    );

    this.thirdPersonHeldBlockMesh.position.set(
      THIRD_PERSON_HELD_BLOCK_X,
      THIRD_PERSON_HELD_BLOCK_Y,
      THIRD_PERSON_HELD_BLOCK_Z
    );
    this.thirdPersonHeldBlockMesh.rotation.set(
      THIRD_PERSON_HELD_BLOCK_PITCH,
      THIRD_PERSON_HELD_BLOCK_YAW,
      THIRD_PERSON_HELD_BLOCK_ROLL
    );
    this.thirdPersonHeldBlockMesh.scale.set(
      THIRD_PERSON_HELD_BLOCK_SCALE,
      THIRD_PERSON_HELD_BLOCK_SCALE,
      THIRD_PERSON_HELD_BLOCK_SCALE
    );

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
    this.blockBehaviourRegistry.register(BlockIds.Slab, new SlabBehaviour());
    // Fire needs WeatherController + ChunkManager for rain/sky-exposure checks.
    this.weatherController = new WeatherController(worldSeed);
    this.weatherController.restore(metadata.weather);
    this.precipitationSimulator = new PrecipitationSimulator(worldSeed);
    registerFireBehaviour(this.blockBehaviourRegistry, blockRegistry, this.weatherController, this.chunkManager);
    registerSnowIceBehaviours(this.blockBehaviourRegistry);
    registerFallingBlockBehaviours(this.blockBehaviourRegistry, blockRegistry, this.fallingBlockManager);
    // Stage 5 leaf decay
    const leafBehaviour = registerLeafBehaviour(this.blockBehaviourRegistry);
    const logBehaviour = registerLogBehaviour(this.blockBehaviourRegistry);
    (this as any)._leafBehaviour = leafBehaviour;
    (this as any)._logBehaviour = logBehaviour;

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
    this.climateSampler = new ClimateSampler(worldSeed);
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
    InventorySerializer.deserialize(this.inventory, metadata.inventory);
    this.selectedSlot = metadata.selectedHotbarSlot ?? 0;

    this.itemEntityManager = new ItemEntityManager(
      this.entityManager,
      this.inventory,
      blockRegistry,
    );
    this.lastTotalTicks = this.worldTime.getTotalTicks();

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
    );
    this.blockHighlight = new BlockHighlight(this.renderer.scene);
    this.destroyOverlayRenderer = new DestroyOverlayRenderer(
      this.renderer.scene,
      atlas,
      blockRegistry,
      this.blockUpdateWorld,
    );

    // After atlas and materials are ready
    this.heldItemRenderer = new FirstPersonHeldItemRenderer(this.firstPersonArmRenderer, this.inventory, blockRegistry, this.atlas, this.itemAtlas);
    this.firstPersonHeldBlockMesh.visible = false;
    this.thirdPersonHeldBlockMesh.visible = false;
    this.hotbarHudRenderer = new HotbarHudRenderer(
      this.atlas,
      this.itemAtlas,
      blockRegistry,
      this.inventory,
    );
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
    this.inventoryInputController = new InventoryInputController(
      this.inventoryController,
      this.hotbarHudRenderer.getLayout()
    );

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
    this.craftingTableInputController = new CraftingTableInputController(
      this.craftingTableController,
      this.hotbarHudRenderer.getLayout()
    );

    this.furnaceManager = new FurnaceManager();
    this.smeltingRegistry = new SmeltingRegistry();
    this.fuelRegistry = new FuelRegistry();
    registerDefaultSmeltingAndFuels(this.smeltingRegistry, this.fuelRegistry, blockRegistry, this.hotbarHudRenderer.getSlotContentRenderer()['itemIcons']);
    this.furnaceManager.deserialize(metadata.furnaces);

    this.chestManager = new ChestManager(this.blockUpdateWorld, this.itemEntityManager);
    this.chestManager.deserialize(metadata.chests);

    registerChestBehaviour(this.blockBehaviourRegistry, this.chestManager);

    this.signManager = new SignManager();
    // this.signManager.deserialize(metadata.signs);
    
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
    this.furnaceInputController = new FurnaceInputController(
      this.furnaceController,
      this.hotbarHudRenderer.getLayout()
    );

    this.menuInputRouter = new MenuInputRouter(
      this.inventoryController,
      this.craftingTableController,
      this.furnaceController,
      this.chestController,
      this.signController,
      this.hotbarHudRenderer.getLayout()
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
      if (blockId === BlockIds.SignPost || blockId === BlockIds.WallSign) {
        this.signController.open(x, y, z);
      }
    });

    this.interactionController.breakingController.setOnBlockBrokenHandler((blockId, x, y, z) => {
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
              this.itemEntityManager.spawnThrownItem(
                x + 0.5,
                eyeY - 0.3,
                z + 0.5,
                {
                  type: s.identity.type,
                  id: s.identity.id,
                  count: s.count,
                  metadata: s.metadata,
                },
                0, 0.2, 0,
                40
              );
            }
          }
          c.clear();
        }
      }
    });

    this.contextMenuSuppressor = new ContextMenuSuppressor();
    this.fluidAnimationSystem = new FluidAnimationSystem();
    this.fireAnimationSystem = new FireAnimationSystem();

    this.chunkRenderer = new ChunkRenderer(
      this.renderer.scene,
      this.chunkManager,
      blockRegistry,
      this.atlas,
      this.fluidAnimationSystem,
      this.fireAnimationSystem,
      worldSeed,
    );
    this.chunkStreamer = new ChunkStreamer(
      this.chunkManager,
      this.worldGenerator,
      this.chunkRenderer,
      this.lightEngine,
      worldSeed,
      this.chunkPersistenceQueue,
      (chunk) => this.chestManager.synchronizeChunk(chunk.chunkX, chunk.chunkZ, chunk)
    );

    this.chestRenderer = new ChestRenderer(
      this.renderer.scene,
      this.chestManager,
      this.atlas,
      this.chunkRenderer.getOpaqueMaterial()
    );

    this.signTextRenderer = new SignTextRenderer(
      this.renderer.scene,
      this.signManager,
      this.blockUpdateWorld
    );

    this.blockTestGrid = new BlockTestGrid(blockRegistry, this.blockUpdateWorld);

    this.debugOverlay = new DebugOverlay();
    this.mobSpawnMenu = new MobSpawnMenu((type) => this.spawnMob(type));
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
      worldSeed,
      this.worldTime,
      this.performanceProfiler,
      this.worldTickScheduler,
      this.fallingBlockManager,
      this.worldEventQueue,
    );

    const validationHarness = new WorkerValidationHarness(worldSeed, this.atlas);
    (window as unknown as { __mcDebug?: Record<string, unknown> }).__mcDebug = {
      saveWorldMetadata: () => this.saveMetadata(true),
      // Compatibility alias: persists metadata + dirty chunks (chunks now carry
      // their owned entities via the EntityManager persistence hooks).
      saveWorld: () => this.saveMetadata(true),
      getSaveMetrics: () => this.saveCoordinator.getMetrics(),
      inspectWorldMetadata: () => this.saveCoordinator.getMetadata(),
      isWorldDirty: () => this.saveCoordinator.isDirty(),
      validateGenerationWorkers: () => validationHarness.validateGenerationWorker(),
      validateMeshWorkers: () => validationHarness.validateMeshWorker(),
      getTargetedEntity: () => this.interactionController.getTargetedEntity(),
      getEntityMetrics: () => ({
        active: this.entityManager.activeCount,
        parked: this.entityManager.parkedCount,
        tick: this.entityManager.currentTick,
      }),
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

    this.updateHeldItemMesh();
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
    this.mobSpawnMenu.mount();
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
    this.mobSpawnMenu.dispose();
    this.blockHighlight.dispose();
    this.destroyOverlayRenderer.dispose();
    this.hotbarHudRenderer.dispose();
    this.inventoryInputController.dispose();
    this.inventoryController.dispose();
    this.craftingTableInputController.dispose();
    this.furnaceInputController.dispose();
    this.menuInputRouter.dispose();
    this.craftingTableController.dispose();
    this.furnaceController.dispose();
    this.furnaceManager.clear();
    this.contextMenuSuppressor.dispose();
    this.heldItemRenderer.dispose();
    this.entityManager.dispose();
    this.entityParticles.dispose();
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

    if (this.input.isKeyJustPressed('KeyU')) {
      const active = this.skinManager.toggleDebugMode();
      this.playerModel.updateSkin(this.skinManager);
      this.firstPersonArmRenderer.updateSkin(this.skinManager);
      console.log(`[SkinManager] Toggled UV-debug skin diagnostic mode. Active: ${active}`);
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

    const prevTicks = Math.floor(this.lastTotalTicks);
    const currentTicks = Math.floor(this.worldTime.getTotalTicks());
    this.lastTotalTicks = this.worldTime.getTotalTicks();

    const elapsedTicks = currentTicks - prevTicks;
    if (elapsedTicks > 0) {
      for (let i = 0; i < elapsedTicks; i++) {
        // Single authoritative 20 Hz simulation clock: the Engine advances all
        // entities, resolves player↔mob pushing (through the player's velocity,
        // so the player's own physics still resolves terrain), then runs the
        // item-pickup pass (which needs the player).
        this.entityManager.tick();
        this.entityManager.collideWithPlayer(this.player);
        this.itemEntityManager.tickPickups(this.player);
      }
    }
    const now = performance.now();
    if (now - this.lastMetadataAutosaveMs >= METADATA_AUTOSAVE_MS) {
      this.lastMetadataAutosaveMs = now;
      void this.saveMetadata(false);
    }
    this.worldTickScheduler.update(deltaSeconds);
    this.chestManager.update();
    this.chestRenderer.update(deltaSeconds);
    this.signTextRenderer.update();
    this.furnaceManager.tick(this.blockUpdateWorld, this.smeltingRegistry, this.fuelRegistry);
    
    // Process block and item drops from scheduled events (like plant popping or leaf decay)
    for (const drop of this.worldEventQueue.drainBlockDrops()) {
      const drops = resolveBlockDrops(drop.blockId, drop.metadata);
      for (const d of drops) {
        this.itemEntityManager.spawnItem(drop.x + 0.5, drop.y + 0.2, drop.z + 0.5, d, 10);
      }
    }
    for (const drop of this.worldEventQueue.drainItemDrops()) {
      this.itemEntityManager.spawnItem(drop.x + 0.5, drop.y + 0.2, drop.z + 0.5, {
        type: 'item', id: drop.itemId, count: drop.count, metadata: drop.metadata
      }, 10);
    }
    this.worldEventQueue.drainNoop();

    this.fluidAnimationSystem.update(this.worldTime.getTotalTicks());
    this.fireAnimationSystem.update(this.worldTime.getTotalTicks());

    // 4. Update camera look
    if (!this.inventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && !this.signController.isOpen && !this.mobSpawnMenu.isOpen()) {
      this.cameraController.update();
    }

    // 5-6. Movement + physics: no-clip bypasses PlayerController's wish
    // velocity entirely and moves the player directly, skipping
    // PlayerPhysics (gravity, player collision, block collision) so
    // none of it runs while no-clip is active, per this stage's
    // requirements.
    if (this.noClipEnabled) {
      this.debugController.update(deltaSeconds);
    } else {
      const chunkX = Math.floor(this.player.position.x / 16);
      const chunkZ = Math.floor(this.player.position.z / 16);
      if (this.chunkManager.hasChunk(chunkX, chunkZ)) {
        if (!this.inventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && !this.signController.isOpen && !this.mobSpawnMenu.isOpen()) {
          this.playerController.update();
        } else {
          this.player.wishVelocity.x = 0;
          this.player.wishVelocity.z = 0;
        }
        this.playerPhysics.update(this.player, deltaSeconds, this.input.isActionActive('jump'));
      } else {
        // Pause physics if the containing chunk is not yet loaded
        // Ensure streamer knows this is the highest priority chunk
        this.chunkStreamer.dispatchCriticalLoad(chunkX, chunkZ);
      }
    }

    // 7. Apply Camera Mode and Transform
    this.player.updateAnimationState(deltaSeconds);
    this.cameraModeController.update();
    const camera = this.renderer.camera;
    this.cameraModeController.applyTransform(
      camera,
      this.player,
      this.cameraController.getYaw(),
      this.cameraController.getPitch()
    );

    // 7a. Update Player Model and Visibility Rules
    if (this.cameraModeController.getMode() === CameraMode.FIRST_PERSON) {
      this.playerModel.setVisible(true);
      this.playerModel.setFirstPersonMode(true);
      this.firstPersonArmRenderer.setVisible(true);

      this.firstPersonMotionController.update(camera, this.player, this.firstPersonArmRenderer, 1.0);
      const hasHeldContent = this.heldItemRenderer.update(this.selectedSlot, deltaSeconds);
      this.firstPersonArmRenderer.setArmMeshVisible(!hasHeldContent);

      this.playerAnimator.update(
        this.player,
        this.playerModel,
        this.cameraController.getYaw(),
        this.cameraController.getPitch(),
        1.0
      );
    } else {
      this.playerModel.setVisible(true);
      this.playerModel.setFirstPersonMode(false);
      this.firstPersonArmRenderer.setVisible(false);
      this.heldItemRenderer.update(this.selectedSlot, deltaSeconds);

      this.playerAnimator.update(
        this.player,
        this.playerModel,
        this.cameraController.getYaw(),
        this.cameraController.getPitch(),
        1.0
      );
    }

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
    if (!this.inventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && !this.signController.isOpen && !this.mobSpawnMenu.isOpen()) {
      this.interactionController.update(deltaSeconds);
    }

    // 10a. Update held item selection and slot HUD if changed
    const currentSlot = this.interactionController.getSelectedSlotIndex();
    const currentStack = this.inventory.getStack(currentSlot);
    const currentStackKey = currentStack === null ? 'empty' : `${currentStack.identity.id}_${currentStack.count}`;
    if (this.selectedSlot !== currentSlot || this.lastSelectedStackKey !== currentStackKey) {
      this.selectedSlot = currentSlot;
      this.lastSelectedStackKey = currentStackKey;
      this.updateHeldItemMesh();
    }

    // Transactional Q-key dropped item throw (Beta 1.7.3)
    if (!this.inventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && this.input.isKeyJustPressed('KeyQ')) {
      const selectedSlotIndex = this.interactionController.getSelectedSlotIndex();
      const stack = this.inventory.getStack(selectedSlotIndex);
      if (stack !== null) {
        // Player eye coordinates (X, Y - 0.3 + 1.62 = Y + 1.32, Z)
        const spawnX = this.player.position.x;
        const spawnY = this.player.position.y + 1.32;
        const spawnZ = this.player.position.z;

        // Compute exact Beta 1.7.3 launch velocities based on look pitch/yaw
        const yaw = this.cameraController.getYaw();
        const pitch = this.cameraController.getPitch();
        
        const throwStrength = 0.3;
        let motionX = -Math.sin(yaw) * Math.cos(pitch) * throwStrength;
        let motionZ = Math.cos(yaw) * Math.cos(pitch) * throwStrength;
        let motionY = -Math.sin(pitch) * throwStrength + 0.1;

        // Add minor randomized deviance matching original source
        const randAngle = Math.random() * Math.PI * 2;
        const randForce = Math.random() * 0.02;
        motionX += Math.cos(randAngle) * randForce;
        motionZ += Math.sin(randAngle) * randForce;
        motionY += (Math.random() - Math.random()) * 0.1;

        // Single drop representation
        const singleDrop = {
          type: stack.identity.type,
          id: stack.identity.id,
          count: 1,
          metadata: stack.metadata,
        };

        // Spawn the thrown item with a 40-tick pickup delay (2.0s)
        this.itemEntityManager.spawnThrownItem(spawnX, spawnY, spawnZ, singleDrop, motionX, motionY, motionZ, 40);

        // Transactional: Consume exactly 1 item from the stack only after successful spawn
        this.inventory.decrementSlot(selectedSlotIndex, 1);
      }
    }

    // 10b. Query and update static player and arm lighting defensively
    const px = Math.floor(this.player.position.x);
    const pey = Math.floor(this.player.position.y + FIRST_PERSON_CAMERA_OFFSET_Y); // Sample lighting at eye/body level
    const pz = Math.floor(this.player.position.z);
    const skyLight = this.blockUpdateWorld.getSkylight(px, pey, pz);
    const blockLight = this.blockUpdateWorld.getBlocklight(px, pey, pz);

    this.firstPersonArmRenderer.updateLighting(skyLight, blockLight, atmos.effectiveSkylightSubtracted, atmos.sunBrightnessFactor);
    this.heldItemRenderer.updateLighting(skyLight, blockLight, atmos.effectiveSkylightSubtracted, atmos.sunBrightnessFactor);

    if (this.playerModelUniforms && this.playerModelUniforms.uStaticSkyLight && this.playerModelUniforms.uStaticBlockLight) {
      this.playerModelUniforms.uStaticSkyLight.value = skyLight;
      this.playerModelUniforms.uStaticBlockLight.value = blockLight;
      this.playerModelUniforms.uSkylightSubtracted.value = atmos.effectiveSkylightSubtracted;
      this.playerModelUniforms.uSunBrightnessFactor.value = atmos.sunBrightnessFactor;
    }

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
    this.blockHighlight.setTarget(this.interactionController.getCurrentHit());

    // Update the block breaking destroy crack overlay
    const activeMiningPos = this.interactionController.breakingController.getMiningBlockPos();
    const progress = this.interactionController.breakingController.getProgress();
    this.destroyOverlayRenderer.update(activeMiningPos, progress);

    // Update dropped item visuals (rotation and bobbing)
    // Interpolate entity transforms between the last two simulation ticks
    // using the authoritative world clock's fractional tick as alpha.
    const totalTicksForAlpha = this.worldTime.getTotalTicks();
    this.entityManager.render(totalTicksForAlpha - Math.floor(totalTicksForAlpha));
    this.entityParticles.update(deltaSeconds);

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

    // Clear whole buffer before world render
    this.renderer.renderer.clear();

    // Render world
    this.renderer.render();

    // Render first-person arm layer over the world (no depth clash)
    if (this.cameraModeController.getMode() === CameraMode.FIRST_PERSON) {
      this.renderer.renderer.clearDepth();
      this.renderer.renderer.render(this.firstPersonArmRenderer.scene, camera);
    }

    // Render WebGL HUD slots icons pass cleanly on top of everything
    this.hotbarHudRenderer.update(this.selectedSlot);
    const layoutScale = this.hotbarHudRenderer.getLayout().scale;
    this.inventoryController.updateScale(layoutScale);
    this.craftingTableController.updateScale(layoutScale);
    this.furnaceController.updateScale(layoutScale);
    this.chestController.updateScale(layoutScale);
    if (this.inventoryController.isOpen) {
      this.inventoryController.renderAll();
    }
    if (this.craftingTableController.isOpen) {
      this.craftingTableController.renderAll();
    }
    if (this.furnaceController.isOpen) {
      this.furnaceController.renderAll();
    }
    if (this.chestController.isOpen) {
      this.chestController.renderAll();
    }
    this.hotbarHudRenderer.render();

    this.performanceProfiler.endRender();
    this.performanceProfiler.endFrame();
  };
  private snapshotMetadata(): WorldMetadata {
    const current = this.saveCoordinator.getMetadata();
    const weather = this.weatherController.getState();
    const serialized = InventorySerializer.serialize(this.inventory, this.selectedSlot);

    return {
      ...current,
      player: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
        yaw: this.cameraController.getYaw(),
        pitch: this.cameraController.getPitch()
      },
      timeTicks: this.worldTime.getTotalTicks(),
      weather: {
        raining: weather.raining,
        thundering: weather.thundering,
        rainTime: weather.rainTime,
        thunderTime: weather.thunderTime
      },
      inventory: serialized.inventory,
      selectedHotbarSlot: serialized.selectedHotbarSlot,
      furnaces: this.furnaceManager.serialize(),
      chests: this.chestManager.serialize(),
    };
  }

  private async saveMetadata(force: boolean): Promise<void> {
    if (this.metadataSaveInFlight !== null) return this.metadataSaveInFlight;
    this.saveCoordinator.update(this.snapshotMetadata());
    this.metadataSaveInFlight = this.saveCoordinator.save(force).finally(() => { this.metadataSaveInFlight = null; });
    return this.metadataSaveInFlight;
  }

  private updateHeldItemMesh(): void {
    const stack = this.inventory.getStack(this.selectedSlot);

    if (stack === null) {
      this.firstPersonHeldBlockMesh.visible = false;
      this.thirdPersonHeldBlockMesh.visible = false;
    } else {
      const category = classifyItemRender(stack.identity, this.blockRegistry);
      const def = this.blockRegistry.getById(stack.identity.id as number);

      if (category === 'unsupported') {
        const newGeo = BlockItemModelBuilder.buildDebugPlaceholder();

        this.firstPersonHeldBlockMesh.geometry.dispose();
        this.firstPersonHeldBlockMesh.geometry = newGeo;
        this.firstPersonHeldBlockMesh.material = this.heldBlockMaterial;

        this.thirdPersonHeldBlockMesh.geometry.dispose();
        this.thirdPersonHeldBlockMesh.geometry = newGeo.clone();
        this.thirdPersonHeldBlockMesh.material = this.heldBlockMaterial;
      } else if (category === 'block_3d' && def !== undefined) {
        const newGeo = BlockItemModelBuilder.build3DGeometry(def, this.atlas);

        this.firstPersonHeldBlockMesh.geometry.dispose();
        this.firstPersonHeldBlockMesh.geometry = newGeo;
        this.firstPersonHeldBlockMesh.material = this.heldBlockMaterial;

        this.thirdPersonHeldBlockMesh.geometry.dispose();
        this.thirdPersonHeldBlockMesh.geometry = newGeo.clone();
        this.thirdPersonHeldBlockMesh.material = this.heldBlockMaterial;
      } else if (category === 'block_flat' && def !== undefined) {
        const newGeo = BlockItemModelBuilder.buildFlatGeometry(def, this.atlas);

        this.firstPersonHeldBlockMesh.geometry.dispose();
        this.firstPersonHeldBlockMesh.geometry = newGeo;
        this.firstPersonHeldBlockMesh.material = this.heldBlockMaterial;

        this.thirdPersonHeldBlockMesh.geometry.dispose();
        this.thirdPersonHeldBlockMesh.geometry = newGeo.clone();
        this.thirdPersonHeldBlockMesh.material = this.heldBlockMaterial;
      } else {
        const uvRect = this.itemAtlas.getUvRect(stack.identity.id as string);
        const u0 = uvRect?.u0 ?? 0;
        const v0 = uvRect?.v0 ?? 0;
        const u1 = uvRect?.u1 ?? 1;
        const v1 = uvRect?.v1 ?? 1;

        const newGeo = this.createBillboardGeometry(u0, v0, u1, v1, uvRect === undefined);

        this.firstPersonHeldBlockMesh.geometry.dispose();
        this.firstPersonHeldBlockMesh.geometry = newGeo;
        this.firstPersonHeldBlockMesh.material = this.itemHeldMaterial;

        this.thirdPersonHeldBlockMesh.geometry.dispose();
        this.thirdPersonHeldBlockMesh.geometry = newGeo.clone();
        this.thirdPersonHeldBlockMesh.material = this.itemHeldMaterial;
      }

      // Legacy Engine-held meshes are intentionally disabled: HeldItemRenderer owns first-person content.
      this.firstPersonHeldBlockMesh.visible = false;
      this.thirdPersonHeldBlockMesh.visible = false;
    }
  }

  private createBillboardGeometry(u0: number, v0: number, u1: number, v1: number, isMissing = false): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry();
    const half = 0.25; // Compact size for held item
    
    // 8 vertices: 4 for front quad, 4 for back quad
    const positions = new Float32Array([
      // Front quad
      -half,  half,  0.001,
       half,  half,  0.001,
      -half, -half,  0.001,
       half, -half,  0.001,

      // Back quad (offset slightly backward)
      -half,  half, -0.001,
       half,  half, -0.001,
      -half, -half, -0.001,
       half, -half, -0.001,
    ]);

    const uvs = new Float32Array([
      // Front face standard UVs
      u0, v0,
      u1, v0,
      u0, v1,
      u1, v1,

      // Back face horizontally-flipped UVs so they render unmirrored from behind
      u1, v0,
      u0, v0,
      u1, v1,
      u0, v1,
    ]);

    const colors = new Float32Array(24);
    const r = isMissing ? 1.0 : 1.0;
    const g = isMissing ? 0.0 : 1.0;
    const b = isMissing ? 1.0 : 1.0;
    for (let i = 0; i < 8; i++) {
      colors[i * 3 + 0] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    const indices = [
      // Front face (Counter-clockwise winding)
      0, 2, 1,
      1, 2, 3,

      // Back face (Clockwise winding from front, but counter-clockwise from back)
      5, 6, 4,
      7, 6, 5
    ];

    geom.setIndex(indices);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    return geom;
  }

  /** Spawns a validation pig a couple of blocks in front of the player. */
  /** Spawns the selected passive mob a couple of blocks in front of the player (debug only). */
  private spawnMob(type: MobType): void {
    const yawRad = (this.cameraController.getYaw() * Math.PI) / 180;
    const forwardX = -Math.sin(yawRad);
    const forwardZ = Math.cos(yawRad);
    const x = this.player.position.x + forwardX * 2;
    const z = this.player.position.z + forwardZ * 2;
    const y = this.player.position.y + 0.5;
    const ctx = this.entityManager.context;
    const mob =
      type === 'cow' ? new CowEntity(ctx, x, y, z)
      : type === 'sheep' ? new SheepEntity(ctx, x, y, z)
      : type === 'chicken' ? new ChickenEntity(ctx, x, y, z)
      : new PigEntity(ctx, x, y, z);
    mob.yaw = this.cameraController.getYaw();
    this.entityManager.add(mob);
    console.log(`[Debug] Spawned ${type} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
  }

}
