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
import type { AudioManager } from '../audio/AudioManager';
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
import { RedstonePowerEngine } from '../world/redstone/RedstonePowerEngine';
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
import { registerRedstoneWireBehaviour } from '../world/behaviours/RedstoneWireBehaviour';
import { registerRedstoneTorchBehaviour } from '../world/behaviours/RedstoneTorchBehaviour';
import { registerTntBehaviour } from '../world/behaviours/TntBehaviour';
import { registerPoweredRailBehaviour } from '../world/behaviours/PoweredRailBehaviour';
import { registerRailBehaviour } from '../world/behaviours/RailBehaviour';
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
import { MinecartRenderSystem } from '../rendering/MinecartRenderer';
import { FirstPersonHeldItemRenderer } from '../rendering/FirstPersonHeldItemRenderer.ts';
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
  private readonly itemEntityManager: ItemEntityManager;
  private readonly entityManager: EntityManager;
  private readonly naturalMobSpawner: NaturalMobSpawner;
  private readonly explosionService: ExplosionService;
  private readonly entityParticles: SimpleEntityParticleSink;
  private readonly minecartRenderSystem: MinecartRenderSystem;
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
  private readonly blockTestGrid: BlockTestGrid;
  private readonly performanceProfiler = new PerformanceProfiler();
  private rawLightDebugMode = false;
  private ambientOcclusionDebugMode = false;

  private simulationPaused = false;
  private running = false;
  private animationFrameId: number | null = null;
  private readonly regionCoordinator: RegionCoordinator;
  private readonly chunkPersistenceQueue: ChunkPersistenceQueue;
  private lastFrameTimeMs: number | null = null;
  private lastMetadataAutosaveMs = 0;
  private metadataSaveInFlight:Promise<void>|null=null;
  private deathSavePending=false;
  private readonly playerModel: PlayerModel;
  private readonly playerAnimator: PlayerAnimator;
  private readonly armourGeometryCache: ArmourGeometryCache;
  private readonly armourMaterialCache: ArmourMaterialCache;
  private readonly playerArmourRenderer: PlayerArmourRenderer;
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
    private readonly entityTextures: EntityTextureAssets,
    armourTextures: ArmourTextureAssets,
    private readonly saveCoordinator: WorldSaveCoordinator,
    private readonly storage: WorldStorage,
    skinManager: PlayerSkinManager,
    private settings: GameSettings,
    private readonly audioManager: AudioManager,
    private readonly onPauseRequested: (() => void) | undefined = undefined,
  ) {
    const metadata = saveCoordinator.getMetadata();
    const worldSeed = BigInt(metadata.seed);
    this.atlas = atlas;
    this.itemAtlas = itemAtlas;
    this.blockRegistry = blockRegistry;
    this.skinManager = skinManager;
    this.armourGeometryCache = new ArmourGeometryCache(skinManager);
    this.armourMaterialCache = new ArmourMaterialCache(armourTextures);
    this.chunkManager = new ChunkManager();
    this.worldGenerator = new BetaWorldGenerator(worldSeed);
    this.regionCoordinator = new RegionCoordinator(this.storage, metadata.worldId);
    this.chunkPersistenceQueue = new ChunkPersistenceQueue(this.regionCoordinator);
    this.saveCoordinator.attachPersistence(this.chunkManager, this.chunkPersistenceQueue);
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

    this.player=new Player(metadata.player.x,metadata.player.y,metadata.player.z);this.player.setDamageListener((event)=>{const kind=event.source.category==='fall'?(event.amount>4?'fall-big':'fall-small'):'hurt';this.audioManager.play({type:'player.damage',kind,x:this.player.position.x,y:this.player.position.y,z:this.player.position.z});});this.player.viewBobbingEnabled=this.settings.video.viewBobbing;this.player.setGameMode(metadata.gameMode ?? GameMode.Creative);this.player.setMaxHealth(metadata.playerHealth?.maxHealth??20);this.player.setHealth(metadata.playerHealth?.health??20);this.player.recentHealth=this.player.health;this.player.setFoodState(metadata.playerFood?.hunger??20,metadata.playerFood?.saturation??5,metadata.playerFood?.exhaustion??0);
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
    this.playerPhysics=new PlayerPhysics(blockRegistry,this.blockBehaviourRegistry,this.blockUpdateWorld);
    this.playerSurvivalController=new PlayerSurvivalController(this.player,this.blockUpdateWorld,blockRegistry,()=>metadata.difficulty);
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
    this.explosionService = new ExplosionService(this.blockUpdateWorld, blockRegistry, this.entityManager, this.player, worldRng, (x, y, z) => this.audioManager.play({ type: 'random.explode', x, y, z }));

    this.chunkPersistenceQueue.setEntityHooks({
      serializeChunkEntities: (cx, cz) => this.entityManager.serializeChunkEntities(cx, cz),
      loadChunkEntities: (tags) => this.entityManager.loadChunkEntities(tags),
      hasParkedEntities: (cx, cz) => this.entityManager.hasParkedEntities(cx, cz),
    });

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
    registerTntBehaviour(this.blockBehaviourRegistry);
    registerRailBehaviour(this.blockBehaviourRegistry);
    registerPoweredRailBehaviour(this.blockBehaviourRegistry);
    this.blockBehaviourRegistry.register(BlockIds.Slab, new SlabBehaviour());
    this.weatherController = new WeatherController(worldSeed);
    this.weatherController.restore(metadata.weather);
    this.precipitationSimulator = new PrecipitationSimulator(worldSeed);
    registerFireBehaviour(this.blockBehaviourRegistry, blockRegistry, this.weatherController, this.chunkManager);
    registerSnowIceBehaviours(this.blockBehaviourRegistry);
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
    this.blockUpdateWorld.setEventQueue(this.worldEventQueue);
    this.blockUpdateWorld.setGameTickProvider(() => this.worldTickScheduler.getGameTick());
    this.blockUpdateWorld.setNextIntProvider((bound: number) => randomTickScheduler.nextInt(bound));
    this.chunkPersistenceQueue.setSimulationTickProvider(() => this.worldTickScheduler.getGameTick());

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
    });
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
    );
    this.blockHighlight = new BlockHighlight(this.renderer.scene);
    this.destroyOverlayRenderer = new DestroyOverlayRenderer(
      this.renderer.scene,
      atlas,
      blockRegistry,
      this.blockUpdateWorld,
    );

    this.heldItemRenderer = new FirstPersonHeldItemRenderer(this.firstPersonArmRenderer, this.inventory, blockRegistry, this.atlas, this.itemAtlas);
    this.firstPersonHeldBlockMesh.visible = false;
    this.thirdPersonHeldBlockMesh.visible = false;
    this.hotbarHudRenderer = new HotbarHudRenderer(this.atlas, this.itemAtlas, blockRegistry, this.inventory, this.settings.video.guiScale);
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

    this.chestManager = new ChestManager(this.blockUpdateWorld, this.itemEntityManager);
    this.chestManager.deserialize(metadata.chests);

    registerChestBehaviour(this.blockBehaviourRegistry, this.chestManager);

    this.signManager = new SignManager();
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

    this.chunkRenderer = new ChunkRenderer(this.renderer.scene, this.chunkManager, blockRegistry, this.atlas, this.fluidAnimationSystem, this.fireAnimationSystem, worldSeed);
    this.chunkStreamer = new ChunkStreamer(this.chunkManager, this.worldGenerator, this.chunkRenderer, this.lightEngine, worldSeed, this.chunkPersistenceQueue, (chunk) => {
        this.chestManager.synchronizeChunk(chunk.chunkX, chunk.chunkZ, chunk);
        this.worldTickScheduler.indexLoadedChunkTicks(chunk);
        this.worldTickScheduler.reconcileChunkBoundaries(chunk);
    });
    this.deathScreen=new DeathScreen(()=>this.respawnController.request());
    this.playerDeathController=new PlayerDeathController(this.player,this.inventory,this.itemEntityManager,worldRng,this.deathScreen,()=>{this.deathSavePending=true;});
    this.respawnController=new RespawnController(this.player,this.chunkManager,this.chunkStreamer,this.blockUpdateWorld,blockRegistry,metadata.spawn,this.deathScreen,this.playerDeathController,()=>{this.cameraHurtController.reset(this.renderer.camera);this.sprintFovController.reset(this.renderer.camera);this.foodUseController.cancel();void this.saveMetadata(true);});

    this.chestRenderer = new ChestRenderer(this.renderer.scene, this.chestManager, this.atlas, this.chunkRenderer.getOpaqueMaterial());
    this.signTextRenderer = new SignTextRenderer(this.renderer.scene, this.signManager, this.blockUpdateWorld);
    this.blockTestGrid = new BlockTestGrid(blockRegistry, this.blockUpdateWorld);
    this.debugOverlay = new DebugOverlay();
    this.debugStatsCollector = new DebugStatsCollector(this.player, this.chunkManager, this.chunkRenderer, this.renderer, this.skyRenderer, this.cloudRenderer, this.weatherController, this.precipitationRenderer, this.rainSplashRenderer, this.lightningRenderer, this.renderer.renderer, worldSeed, this.worldTime, this.performanceProfiler, this.worldTickScheduler, this.fallingBlockManager, this.worldEventQueue);

    const validationHarness = new WorkerValidationHarness(worldSeed, this.atlas);
    (window as unknown as { __mcDebug?: Record<string, unknown> }).__mcDebug = {
      saveWorldMetadata: () => this.saveMetadata(true),
      saveWorld: () => this.saveMetadata(true),
      getSaveMetrics: () => this.saveCoordinator.getMetrics(),
      inspectWorldMetadata: () => this.saveCoordinator.getMetadata(),
      isWorldDirty: () => this.saveCoordinator.isDirty(),
      validateGenerationWorkers: () => validationHarness.validateGenerationWorker(),
      validateMeshWorkers: () => validationHarness.validateMeshWorker(),
      getTargetedEntity: () => this.interactionController.getTargetedEntity(),
      getEntityMetrics: () => ({ active: this.entityManager.activeCount, parked: this.entityManager.parkedCount, tick: this.entityManager.currentTick }),
      getTickMetrics: () => this.worldTickScheduler.getMetrics(),
      getRedstoneMetrics: () => ({ ...this.worldTickScheduler.getMetrics(), powerQueries: this.redstonePowerEngine.getMetrics() }),
      getFallingBlockMetrics: () => ({ simulationTick: this.fallingBlockManager.getSimulationTick(), interpolationAlpha: this.fallingBlockManager.getInterpolationAlpha(), active: this.fallingBlockManager.getCount(), persisted: this.fallingBlockManager.getPersistedCount(), meshCount: this.fallingBlockManager.getMeshCount(), entities: this.fallingBlockManager.getDebugEntities(), pendingDrops: this.worldEventQueue.getBlockDropCount() }),
      getFluidMetrics: () => ({ ...this.fluidAnimationSystem.getDebugInfo(), lavaIgnitionAttempts: this.worldEventQueue.getTotalLavaIgnitionAttempts(), worldEventQueueDepth: this.worldEventQueue.getQueueDepth() }),
      getFireMetrics: () => ({ ...this.fireAnimationSystem.getDebugInfo(), tntIgniteAttempts: this.worldEventQueue.getTotalTntIgniteAttempts(), pendingTntIgnitions: this.worldEventQueue.getTntIgniteAttemptCount() }),
      getBlockTestGrid: () => ({ grid: this.blockTestGrid.getGridState(), blocks: this.blockTestGrid.getInfo(), totalBlocks: this.blockTestGrid.getInfo().length, origin: this.blockTestGrid.getGridState() ? { x: this.blockTestGrid.getGridState()!.originX, y: this.blockTestGrid.getGridState()!.originY, z: this.blockTestGrid.getGridState()!.originZ } : null }),
      getWeatherMetrics: () => ({ ...this.precipitationSimulator.getMetrics(), activeSnowfall: this.weatherController.getState().raining, weatherMode: this.weatherController.getState().getEffectiveMode(this.weatherController.getState().partialTick) }),
      getLeafDecayMetrics: () => {
        return { pendingItemDrops: this.worldEventQueue.getItemDropCount(), totalItemDrops: this.worldEventQueue.getTotalItemDrops(), discardedItemDrops: this.worldEventQueue.getDiscardedItemDropCount(), queueDepth: this.worldEventQueue.getQueueDepth() };
      },
      drainLeafDecayDrops: () => this.worldEventQueue.drainItemDrops(),
      resetLeafDecayMetrics: () => {},
      inspectLeafDecayArea: (x: number, y: number, z: number, radius = 4) => {
        const results: any[] = [];
        const cx = Math.floor(x); const cy = Math.floor(y); const cz = Math.floor(z);
        let guardPass = true;
        const minCX = Math.floor((cx - radius - 1) / 16); const maxCX = Math.floor((cx + radius + 1) / 16);
        const minCZ = Math.floor((cz - radius - 1) / 16); const maxCZ = Math.floor((cz + radius + 1) / 16);
        for (let cxx = minCX; cxx <= maxCX; cxx++) for (let czz = minCZ; czz <= maxCZ; czz++) if (!this.chunkManager.hasChunk(cxx, czz)) guardPass = false;
        for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) for (let dz = -radius; dz <= radius; dz++) {
          const wx = cx + dx; const wy = cy + dy; const wz = cz + dz;
          if (wy < 0 || wy >= 128) continue;
          const bid = this.blockUpdateWorld.getBlock(wx, wy, wz);
          const isLeaf = bid === 18 || bid === 250 || bid === 253; const isLog = bid === 17 || bid === 251 || bid === 252;
          if (!isLeaf && !isLog) continue;
          const meta = this.blockUpdateWorld.getBlockMetadata(wx, wy, wz);
          const hasFlag = (meta & 8) !== 0; const species = meta & 3;
          results.push({ x: wx, y: wy, z: wz, blockId: bid, blockName: isLeaf ? 'leaves' : 'log', metadata: meta, hasDecayFlag: hasFlag, species, guardPass });
        }
        return { center: { x: cx, y: cy, z: cz }, radius, guardPass, leaves: results.filter((r) => r.blockName === 'leaves'), logs: results.filter((r) => r.blockName === 'log'), all: results };
      },
      inspectFluid: (x: number, y: number, z: number) => {
        const blockId = this.blockUpdateWorld.getBlock(x, y, z); const metadata = this.blockUpdateWorld.getBlockMetadata(x, y, z);
        const flow = computeFluidFlowVector({ getBlock: (wx, wy, wz) => this.blockUpdateWorld.getBlock(wx, wy, wz), getMetadata: (wx, wy, wz) => this.blockUpdateWorld.getBlockMetadata(wx, wy, wz), isSolid: (id) => blockRegistry.getById(id)?.solid ?? false }, x, y, z, blockId);
        const isWater = blockId === 8 || blockId === 9; const isLava = blockId === 10 || blockId === 11;
        const moving = Math.hypot(flow.x, flow.z) > 1e-6;
        const textureSelector = isWater ? (isFallingFluid(metadata) || moving || blockId === 8 ? 'WaterFlow' : 'WaterStill') : isLava ? (isFallingFluid(metadata) || moving || blockId === 10 ? 'LavaFlow' : 'LavaStill') : 'None';
        return { blockId, metadata, flowLevel: getFluidLevel(metadata), falling: isFallingFluid(metadata), flow, surfaceHeight: fluidSurfaceHeight(metadata), textureSelector, currentFrames: this.fluidAnimationSystem.getDebugInfo() };
      },
    };

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
    this.debugOverlay.mount();
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

  public async saveAndStop(): Promise<void> {
    await this.saveMetadata(true);
    this.stop();
  }

  public stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.animationFrameId !== null) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
    this.lastFrameTimeMs = null;
    this.renderer.stop();
    this.input.stop();
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
    this.entityManager.dispose();
    this.entityParticles.dispose();
    this.chunkStreamer.dispose();
    this.chunkPersistenceQueue.dispose();
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
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
    if (this.input.isDebugKeyJustPressed('F2')) this.blockTestGrid.generate(this.player.position.x, this.player.position.z);
    if (this.input.isDebugKeyJustPressed('F3')) this.debugOverlay.toggle();
    if (this.input.isKeyJustPressed('KeyU')) {
      const active = this.skinManager.toggleDebugMode();
      this.playerModel.updateSkin(this.skinManager);
      this.firstPersonArmRenderer.updateSkin(this.skinManager);
      console.log(`[SkinManager] Toggled UV-debug skin diagnostic mode. Active: ${active}`);
    }
    if (this.input.isDebugKeyJustPressed('F4')) { this.rawLightDebugMode = !this.rawLightDebugMode; if (this.rawLightDebugMode) { this.ambientOcclusionDebugMode = false; this.chunkRenderer.setAmbientOcclusionDebugMode(false); } this.chunkRenderer.setRawLightDebugMode(this.rawLightDebugMode); }
    if (this.input.isDebugKeyJustPressed('F7')) { this.ambientOcclusionDebugMode = !this.ambientOcclusionDebugMode; if (this.ambientOcclusionDebugMode) { this.rawLightDebugMode = false; this.chunkRenderer.setRawLightDebugMode(false); } this.chunkRenderer.setAmbientOcclusionDebugMode(this.ambientOcclusionDebugMode); }
    if (this.input.isDebugKeyJustPressed('F5')) this.weatherController.setAuto();
    if (this.input.isDebugKeyJustPressed('F8')) this.weatherController.forceMode('clear');
    if (this.input.isDebugKeyJustPressed('F9')) this.weatherController.forceMode('rain');
    if (this.input.isDebugKeyJustPressed('F10')) this.weatherController.forceMode('thunder');
    if (this.input.isKeyJustPressed('ArrowLeft')) this.worldTime.addTicks(-1000);
    if (this.input.isKeyJustPressed('ArrowRight')) this.worldTime.addTicks(1000);
    if (this.input.isKeyJustPressed('ArrowUp')) this.worldTime.setDay();
    if (this.input.isKeyJustPressed('ArrowDown')) this.worldTime.setNight();

    this.worldTime.update(deltaSeconds);
    this.simulationAccumulatorTicks += deltaSeconds * 20;
    while (this.simulationAccumulatorTicks >= 1) {
      this.simulationTick++;
      this.worldTickScheduler.beginTick(this.simulationTick);
      this.player.tickCombatState(); this.playerController.tickSprintWindow(); this.foodUseController.tick();
      this.playerSurvivalController.tick(); this.interactionController.breakingController.tick();
      this.playerDeathController.update(); this.respawnController.update(); this.naturalMobSpawner.tick();
      this.entityManager.tick(); this.entityManager.collideWithPlayer(this.player); this.itemEntityManager.tickPickups(this.player);
      if(this.deathSavePending){this.deathSavePending=false;void this.saveMetadata(true);}
      this.worldTickScheduler.endTick();
      this.simulationAccumulatorTicks--;
    }
    const now = performance.now();
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
    if (!this.inventoryController.isOpen && !this.creativeInventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && !this.signController.isOpen && this.player.isAlive() && !this.deathScreen.isOpen) this.cameraController.update();
    if(!this.player.isAlive()){this.player.wishVelocity.x=this.player.wishVelocity.z=0;}
    else {
      const chunkX = Math.floor(this.player.position.x / 16);
      const chunkZ = Math.floor(this.player.position.z / 16);
      if (this.chunkManager.hasChunk(chunkX, chunkZ)) {
        if (!this.inventoryController.isOpen && !this.creativeInventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && !this.signController.isOpen && this.player.isAlive() && !this.deathScreen.isOpen) {
          this.playerController.update(deltaSeconds);
        } else { this.player.wishVelocity.x = 0; this.player.wishVelocity.z = 0; }
        const movement=this.playerPhysics.update(this.player,deltaSeconds,this.input.isActionActive('jump'),this.input.isActionActive('sprint'));
        this.playerSurvivalController.recordMovement(movement);
        if (movement.splashVolume !== undefined) this.audioManager.play({ type: 'random.splash', x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, volume: movement.splashVolume });
        this.updatePlayerFootsteps(movement);
      } else { this.chunkStreamer.dispatchCriticalLoad(chunkX, chunkZ); }
    }

    this.player.updateAnimationState(deltaSeconds);
    this.cameraModeController.update();
    const camera = this.renderer.camera;
    this.cameraModeController.applyTransform(camera, this.player, this.cameraController.getYaw(), this.cameraController.getPitch());
    this.cameraHurtController.update(camera,this.player,deltaSeconds);
    const survivalUiSuppressed=this.inventoryController.isOpen||this.creativeInventoryController.isOpen||this.craftingTableController.isOpen||this.furnaceController.isOpen||this.chestController.isOpen||this.signController.isOpen||this.deathScreen.isOpen;
    if(survivalUiSuppressed){this.player.isSprinting=false;this.foodUseController.cancel();this.interactionController.breakingController.reset();}
    this.sprintFovController.update(camera,this.player,deltaSeconds,survivalUiSuppressed);

    if (this.cameraModeController.getMode() === CameraMode.FIRST_PERSON) {
      this.playerModel.setVisible(true); this.playerModel.setFirstPersonMode(true); this.firstPersonArmRenderer.setVisible(true);
      this.firstPersonMotionController.update(camera, this.player, this.firstPersonArmRenderer, 1.0);
      const hasHeldContent = this.heldItemRenderer.update(this.selectedSlot, deltaSeconds);
      this.firstPersonArmRenderer.setArmMeshVisible(!hasHeldContent);
      this.playerAnimator.update(this.player, this.playerModel, this.cameraController.getYaw(), this.cameraController.getPitch(), 1.0, deltaSeconds);
    } else {
      this.playerModel.setVisible(true); this.playerModel.setFirstPersonMode(false); this.firstPersonArmRenderer.setVisible(false);
      this.heldItemRenderer.update(this.selectedSlot, deltaSeconds);
      this.playerAnimator.update(this.player, this.playerModel, this.cameraController.getYaw(), this.cameraController.getPitch(), 1.0, deltaSeconds);
    }
    this.playerArmourRenderer.sync();

    this.weatherController.update(deltaSeconds);
    const weatherState = this.weatherController.getState();
    const previewFade = previewWeatherFade(weatherState.getRainStrength(weatherState.partialTick), weatherState.getThunderStrength(weatherState.partialTick));
    this.skyRenderer.update(camera, this.worldTime, previewFade);

    const atmos = buildAtmosphericState(this.skyRenderer.getCurrentColorState(), weatherState, this.lightningManager.getState().getFlashStrength(weatherState.partialTick));
    this.skyRenderer.applyAtmosphericState(atmos);
    this.audioManager.updateListener(camera.position.x, camera.position.y, camera.position.z, this.cameraController.getYaw(), this.cameraController.getPitch());
    this.audioManager.setRain(weatherState.getRainStrength(weatherState.partialTick));
    this.rainCoverSampleSeconds -= deltaSeconds;
    if (this.rainCoverSampleSeconds <= 0) { this.rainCoverSampleSeconds = 0.25; this.audioManager.setRainCover(this.sampleRainCover(camera.position.x, camera.position.y, camera.position.z)); }
    this.chunkRenderer.setSkylightSubtracted(atmos.effectiveSkylightSubtracted);
    this.chunkRenderer.setSunBrightnessFactor(atmos.sunBrightnessFactor);
    this.debugStatsCollector.setStormReadout({ weatherSkylightPenalty: atmos.weatherSkylightPenalty, effectiveSkylightSubtracted: atmos.effectiveSkylightSubtracted, windX: atmos.wind.x, windZ: atmos.wind.z });
    const cloudColor = { r: atmos.cloud.r, g: atmos.cloud.g, b: atmos.cloud.b, hex: atmos.cloud.hex };
    this.cloudRenderer.update(camera.position.x, camera.position.z, deltaSeconds, cloudColor, atmos.cloudFogStrength);

    const preStreamMeshingStats = this.chunkRenderer.getMeshingStats();
    this.chunkStreamer.update(camera.position.x, camera.position.z, this.cameraController.getYaw(), this.player.velocity.x, this.player.velocity.z, preStreamMeshingStats.queued, preStreamMeshingStats.pendingUploads);
    const generationStats = this.chunkStreamer.getGenerationStats();
    const meshingStats = this.chunkRenderer.getMeshingStats();
    this.performanceProfiler.setQueues(generationStats.queued, meshingStats.queued + meshingStats.pendingUploads, generationStats.activeWorkers + meshingStats.activeWorkers, generationStats.oldestCriticalAgeMs);
    this.performanceProfiler.setWorkerCounters(generationStats.completed, generationStats.stale, generationStats.errors);

    if (!this.inventoryController.isOpen && !this.creativeInventoryController.isOpen && !this.craftingTableController.isOpen && !this.furnaceController.isOpen && !this.chestController.isOpen && !this.signController.isOpen && this.player.isAlive() && !this.deathScreen.isOpen) this.interactionController.update(deltaSeconds);

    const currentSlot = this.interactionController.getSelectedSlotIndex();
    const currentStack = this.inventory.getStack(currentSlot);
    const currentStackKey = currentStack === null ? 'empty' : `${currentStack.identity.id}_${currentStack.count}`;
    if (this.selectedSlot !== currentSlot || this.lastSelectedStackKey !== currentStackKey) { this.selectedSlot = currentSlot; this.lastSelectedStackKey = currentStackKey; this.updateHeldItemMesh(); }

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
    this.heldItemRenderer.updateLighting(skyLight, blockLight, atmos.effectiveSkylightSubtracted, atmos.sunBrightnessFactor);
    this.armourMaterialCache.updateLighting(skyLight, blockLight, atmos.effectiveSkylightSubtracted, atmos.sunBrightnessFactor);

    if (this.playerModelUniforms && this.playerModelUniforms.uStaticSkyLight && this.playerModelUniforms.uStaticBlockLight) {
      this.playerModelUniforms.uStaticSkyLight.value = skyLight; this.playerModelUniforms.uStaticBlockLight.value = blockLight;
      this.playerModelUniforms.uSkylightSubtracted.value = atmos.effectiveSkylightSubtracted; this.playerModelUniforms.uSunBrightnessFactor.value = atmos.sunBrightnessFactor;
    }

    this.chunkRenderer.update(this.performanceProfiler.getSnapshot().frameTimeMs, camera.position.x, camera.position.z);
    this.precipitationRenderer.update(camera.position.x, camera.position.y, camera.position.z, deltaSeconds, atmos, this.worldTime);
    this.rainSplashRenderer.update(camera, deltaSeconds, atmos, this.precipitationRenderer);
    this.lightningManager.setAudioHook((x, y, z, distance) => this.audioManager.play({ type: 'weather.thunder', x, y, z, distance }));
    this.lightningManager.update(deltaSeconds, weatherState, camera.position.x, camera.position.y, camera.position.z);
    this.lightningRenderer.update(this.lightningManager.getState());

    const fogState = this.fogController.compute({ eyeX: camera.position.x, eyeY: camera.position.y, eyeZ: camera.position.z, rawLightDebugMode: this.rawLightDebugMode, ambientOcclusionDebugMode: this.ambientOcclusionDebugMode, overworldColorHex: atmos.horizon.hex, overworldDensityMultiplier: atmos.fogDensityMultiplier });
    this.renderer.setFogState(fogState);
    this.blockHighlight.setTarget(this.interactionController.getCurrentHit());
    const activeMiningPos = this.interactionController.breakingController.getMiningBlockPos(); const progress = this.interactionController.breakingController.getProgress();
    this.destroyOverlayRenderer.update(activeMiningPos, progress);
    const totalTicksForAlpha = this.worldTime.getTotalTicks();
    const entityAlpha = totalTicksForAlpha - Math.floor(totalTicksForAlpha);
    this.entityManager.render(entityAlpha);
    this.minecartRenderSystem.update(entityAlpha);
    this.entityParticles.update(deltaSeconds);
    this.debugStatsCollector.recordFrame(deltaSeconds);
    if (this.debugOverlay.isVisible()) this.debugOverlay.render(this.debugStatsCollector.collect(false));
    for (const system of this.updatables) system.update(deltaSeconds);

    this.performanceProfiler.recordMeshUpload(this.chunkRenderer.getMeshUploadsThisFrame());
    this.performanceProfiler.setApproximateGeometryMemoryMb(this.chunkRenderer.getApproximateGeometryMemoryBytes() / (1024 * 1024));
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
    for (const ox of [-2, 0, 2]) for (const oz of [-2, 0, 2]) {
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

  private snapshotMetadata(): WorldMetadata {
    const weather = this.weatherController.getState(); const serialized = InventorySerializer.serialize(this.inventory, this.selectedSlot);
    return { ...this.saveCoordinator.getMetadata(), player: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, yaw: this.cameraController.getYaw(), pitch: this.cameraController.getPitch() }, playerHealth:{health:this.player.health,maxHealth:this.player.maxHealth},playerFood:{hunger:this.player.hunger,saturation:this.player.saturation,exhaustion:this.player.exhaustion}, gameMode:this.player.gameMode, timeTicks: this.worldTime.getTotalTicks(), weather: { raining: weather.raining, thundering: weather.thundering, rainTime: weather.rainTime, thunderTime: weather.thunderTime }, inventory: serialized.inventory, armour: serialized.armour, selectedHotbarSlot: serialized.selectedHotbarSlot, furnaces: this.furnaceManager.serialize(), chests: this.chestManager.serialize() };
  }

  private async saveMetadata(force: boolean): Promise<void> { if (this.metadataSaveInFlight !== null) return this.metadataSaveInFlight; this.saveCoordinator.update(this.snapshotMetadata()); this.metadataSaveInFlight = this.saveCoordinator.save(force).finally(() => { this.metadataSaveInFlight = null; }); return this.metadataSaveInFlight; }

  private updateHeldItemMesh(): void {
    const stack = this.inventory.getStack(this.selectedSlot);
    if (stack === null) { this.firstPersonHeldBlockMesh.visible = false; this.thirdPersonHeldBlockMesh.visible = false; } else {
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
        const uvRect = this.itemAtlas.getUvRect(stack.identity.id as string); const u0 = uvRect?.u0 ?? 0; const v0 = uvRect?.v0 ?? 0; const u1 = uvRect?.u1 ?? 1; const v1 = uvRect?.v1 ?? 1;
        const newGeo = this.createBillboardGeometry(u0, v0, u1, v1, uvRect === undefined);
        this.firstPersonHeldBlockMesh.geometry.dispose(); this.firstPersonHeldBlockMesh.geometry = newGeo; this.firstPersonHeldBlockMesh.material = this.itemHeldMaterial;
        this.thirdPersonHeldBlockMesh.geometry.dispose(); this.thirdPersonHeldBlockMesh.geometry = newGeo.clone(); this.thirdPersonHeldBlockMesh.material = this.itemHeldMaterial;
      }
      this.firstPersonHeldBlockMesh.visible = false; this.thirdPersonHeldBlockMesh.visible = false;
    }
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
}
