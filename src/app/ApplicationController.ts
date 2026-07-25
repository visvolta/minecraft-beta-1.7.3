import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../assets/ItemTextureAtlas';
import type { EntityTextureAssets } from '../assets/EntityTextureAssets';
import type { ArmourTextureAssets } from '../assets/ArmourTextureAssets';
import { Engine } from '../engine/Engine';
import type { PlayerSkinManager } from '../player/PlayerSkinManager';
// New persistence system owns all world data (list/create/load/delete/rename/save)
// and the application-owned backend that also stores app settings.
import { IdbStorageBackend } from '../persistence2/backend/IdbStorageBackend';
import type { WorldSummary } from '../persistence2/backend/StorageBackend';
import { WorldPersistenceService, WRITE_PRIORITY_FORCED } from '../persistence2/WorldPersistenceService';
import { RecordCorruptionError } from '../persistence2/codec/PersistenceError';
// Kept primitives.
import { createDefaultMetadata, type WorldMetadata } from '../world/WorldMetadata';
import { parseWorldSeed } from '../world/SeedParser';
// Pure helper (temporary import until the legacy index module is removed in Stage 4).
import { uniqueWorldId } from '../persistence2/worldId';
import { findBetaSpawn, getSafePlayerY } from '../world/generation/WorldSpawnFinder';
import { CHUNK_SIZE_X } from '../world/chunkConstants';
import { chunkKey } from '../world/chunkKey';
import type { LoadingProgress } from './LoadingProgress';
import { MainMenuScreen } from '../ui/menu/MainMenuScreen';
import { WorldSelectScreen } from '../ui/menu/WorldSelectScreen';
import { WorldCreateScreen, type WorldCreateResult } from '../ui/menu/WorldCreateScreen';
import { LoadingScreen } from '../ui/menu/LoadingScreen';
import { OptionsScreen } from '../ui/menu/OptionsScreen';
import { ConfirmDeleteScreen } from '../ui/menu/ConfirmDeleteScreen';
import { RenameWorldScreen } from '../ui/menu/RenameWorldScreen';
import { ErrorScreen } from '../ui/menu/ErrorScreen';
import { PersistenceErrorScreen } from '../ui/menu/PersistenceErrorScreen';
import { SaveExitController, type SaveExitState, type SaveExitDiagnostics } from './SaveExitController';
import { DirtyWarningController } from './DirtyWarningController';
import { PauseMenuScreen } from '../ui/menu/PauseMenuScreen';
import { VideoSettingsScreen } from '../ui/menu/VideoSettingsScreen';
import { ControlsScreen } from '../ui/menu/ControlsScreen';
import type { Screen } from '../ui/menu/MenuWidgets';
import { loadGameSettings, saveGameSettings } from '../settings/SettingsStorage';
import { DEFAULT_GAME_SETTINGS, type GameSettings } from '../settings/GameSettings';
import { AudioManager } from '../audio/AudioManager';
import { GameMode } from '../player/GameMode';
import { BetaWorldGenerator } from '../world/generation/BetaWorldGenerator';
import { Chunk } from '../world/Chunk';
import { applyGuiScaleCssVariables, setGlobalGuiScaleSetting } from '../ui/GuiScale';
import {
  beginLoadPerformanceSession,
  finishLoadPerformanceSession,
  recordLoadGenerationRequest,
  recordLoadPerformanceMark,
  type LoadPerformanceStatus,
} from '../debug/LoadPerformanceMetrics';

export type ApplicationState = 'boot' | 'main_menu' | 'world_select' | 'world_create' | 'world_loading' | 'in_game' | 'pause_menu' | 'options' | 'video_settings' | 'controls' | 'confirm_delete' | 'error';

class SpawnPreparationCancelled extends Error {
  public constructor() { super('Spawn preparation was cancelled.'); }
}

interface SpawnPreparationState {
  readonly token: number;
  aborted: boolean;
  timeoutId: number | null;
}

/** Number of chunks (Chebyshev radius) generated and durably saved at world creation. */
const CREATION_SPAWN_PERSIST_RADIUS = 2;

export class ApplicationController {
  private state: ApplicationState = 'boot';
  private screen: Screen | null = null;
  private engine: Engine | null = null;
  private saveExitController: SaveExitController | null = null;
  private readonly dirtyWarning = new DirtyWarningController();
  private settings: GameSettings = DEFAULT_GAME_SETTINGS;
  private readonly audio = new AudioManager();
  private optionsParent: 'main' | 'pause' = 'main';
  private pauseEscapeArmed = true;
  private activeLoadToken = 0;
  private loadInProgress = false;

  private spawnPreparation: SpawnPreparationState | null = null;
  private readonly resize = (): void => applyGuiScaleCssVariables();
  private readonly audioActivation = (): void => { void this.audio.activate(); };
  private started = false;
  private readonly keydown = (event: KeyboardEvent): void => {
    if (!this.settings.controls.bindings.pause.includes(event.code)) return;
    if (this.state === 'pause_menu') {
      event.preventDefault();
      if (this.pauseEscapeArmed) this.resumeGame();
    } else if (this.state === 'options') {
      event.preventDefault();
      this.optionsParent === 'pause' ? void this.showPauseMenu() : void this.showMainMenu();
    } else if (this.state === 'video_settings' || this.state === 'controls') {
      event.preventDefault();
      this.showOptions(this.optionsParent);
    }
  };
  private readonly keyup = (event: KeyboardEvent): void => { if (this.settings.controls.bindings.pause.includes(event.code)) this.pauseEscapeArmed = true; };
  /** Application-owned backend (new system); opened in start(), closed in dispose(). Stores worlds and app settings. */
  private backend: IdbStorageBackend | null = null;

  public constructor(
    private readonly blockRegistry: BlockRegistry,
    private readonly atlas: TextureAtlas,
    private readonly itemAtlas: ItemTextureAtlas,
    private readonly entityTextures: EntityTextureAssets,
    private readonly armourTextures: ArmourTextureAssets,
    private readonly skinManager: PlayerSkinManager,
  ) {}

  public async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    // Open the application-owned backend first; worlds and app settings use it.
    try {
      const backend = new IdbStorageBackend();
      await backend.open();
      this.backend = backend;
      this.settings = await loadGameSettings(backend);
    } catch (error) {
      console.error('[ApplicationController] Failed to open world storage backend:', error);
      this.backend = null; // showWorldSelect will surface a storage error
      this.settings = DEFAULT_GAME_SETTINGS;
    }
    setGlobalGuiScaleSetting(this.settings.video.guiScale);
    this.audio.applySettings(this.settings);
    this.installAudioActivation();
    await this.loadFont();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    await this.showMainMenu();
  }

  public async dispose(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.cancelActiveLoadOperation();
    this.screen?.dispose();
    this.screen = null;
    await this.unloadWorld();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('pointerdown', this.audioActivation, { capture: true });
    window.removeEventListener('keydown', this.audioActivation, { capture: true });
    await this.audio.dispose();
    // Close the application-owned backend after all world services are closed.
    if (this.backend !== null) {
      await this.backend.close();
      this.backend = null;
    }
  }

  public getState(): ApplicationState { return this.state; }
  public hasEngine(): boolean { return this.engine !== null; }

  private setScreen(screen: Screen | null, state: ApplicationState): void {
    this.screen?.dispose();
    this.screen = screen;
    this.state = state;
    if (screen) screen.mount();
  }

  private async showMainMenu(): Promise<void> {
    this.cancelActiveLoadOperation();
    this.audio.setMusicContext('menu');
    this.setScreen(new MainMenuScreen({ singleplayer: () => void this.showWorldSelect(), options: () => this.showOptions('main'), quit: () => this.showError('Quit Game', 'You can close this browser tab when ready.') }), 'main_menu');
  }

  private showOptions(parent: 'main' | 'pause' = 'main'): void { this.optionsParent = parent; this.setScreen(new OptionsScreen(this.settings, { done: () => parent === 'pause' ? this.showPauseMenu() : void this.showMainMenu(), video: () => this.showVideoSettings(parent), controls: () => this.showControls(parent), setSettings: (settings) => void this.updateSettings(settings) }), 'options'); }

  private showVideoSettings(parent: 'main' | 'pause'): void { this.setScreen(new VideoSettingsScreen(this.settings, (settings) => void this.updateSettings(settings), () => this.showOptions(parent)), 'video_settings'); }

  private showControls(parent: 'main' | 'pause'): void { this.setScreen(new ControlsScreen(this.settings, (settings) => void this.updateSettings(settings), () => this.showOptions(parent)), 'controls'); }

  private async showWorldSelect(): Promise<void> {
    const backend = this.backend;
    if (backend === null) {
      this.showError('Storage unavailable', 'World storage could not be opened, so worlds cannot be listed, created or loaded.');
      return;
    }
    // The world list is populated EXCLUSIVELY from the new backend's index;
    // legacy worlds are never scanned, opened or shown.
    const worlds = await backend.listWorlds();
    this.setScreen(new WorldSelectScreen(worlds, { play: (id) => void this.loadExistingWorld(id), create: () => this.showWorldCreate(), rename: (id) => void this.showRename(id), delete: (id) => void this.showDelete(id), back: () => void this.showMainMenu() }), 'world_select');
  }

  private showWorldCreate(): void {
    this.setScreen(new WorldCreateScreen((result) => void this.createAndLoadWorld(result), () => void this.showWorldSelect()), 'world_create');
  }

  private async createAndLoadWorld(result: WorldCreateResult): Promise<void> {
    const token = this.beginLoadOperation('create world');
    if (token === null) return;
    const backend = this.backend;
    if (backend === null) {
      this.finishLoadOperation(token);
      this.showError('Storage unavailable', 'World storage could not be opened.');
      return;
    }
    this.screen?.dispose();
    const loading = new LoadingScreen();
    this.setScreen(loading, 'world_loading');
    const update = (progress: LoadingProgress): void => loading.update(progress);
    let service: WorldPersistenceService | null = null;
    let worldId: string | null = null;
    let published = false;
    const loadPerfToken = beginLoadPerformanceSession('create', result.name);
    let loadPerfStatus: LoadPerformanceStatus = 'failed';
    try {
      const displayName = result.name.trim();
      if (displayName.length === 0) throw new Error('World name cannot be empty.');
      update({ stage: 'metadata', completed: 0, total: undefined, primaryMessage: 'Creating world', secondaryMessage: displayName });
      recordLoadPerformanceMark(loadPerfToken, 'metadata-start');
      // Derive a unique id from existing NEW-format worlds only.
      const existing = await backend.listWorlds();
      worldId = uniqueWorldId(displayName, existing.map((w) => w.worldId));
      // Build initial metadata (parse seed, find Beta spawn).
      const parsed = parseWorldSeed(result.seedText);
      const generator = new BetaWorldGenerator(BigInt(parsed.seed));
      const spawn = findBetaSpawn(generator, BigInt(parsed.seed));
      const playerY = getSafePlayerY(generator, spawn.x, spawn.z);
      const now = Date.now();
      const metadata: WorldMetadata = {
        ...createDefaultMetadata(),
        worldId,
        name: displayName,
        displayName,
        seed: parsed.seed,
        seedText: parsed.seedText,
        createdAt: now,
        lastPlayedAt: 0,
        gameMode: result.gameMode,
        spawn,
        player: { x: spawn.x + 0.5, y: playerY, z: spawn.z + 0.5, yaw: 0, pitch: 0 },
      };
      // Open the world service and write creation metadata — but DO NOT publish
      // to the visible index yet (amendment 2).
      service = new WorldPersistenceService({ backend });
      await service.open(worldId);
      await service.saveMetadata(metadata, WRITE_PRIORITY_FORCED);
      recordLoadPerformanceMark(loadPerfToken, 'metadata-saved');
      this.assertLoadActive(token);
      const preparedSpawnChunks = await this.prepareSpawn(metadata.seed, update, token, loadPerfToken, true);
      this.assertLoadActive(token);
      // Required spawn persistence: generate and durably save the spawn area so
      // the world is initialized before it becomes selectable (amendment 2).
      update({ stage: 'terrain', completed: 0, total: undefined, primaryMessage: 'Saving spawn area', secondaryMessage: '' });
      recordLoadPerformanceMark(loadPerfToken, 'spawn-persist-start');
      await this.persistSpawnArea(service, generator, spawn, loadPerfToken, preparedSpawnChunks);
      recordLoadPerformanceMark(loadPerfToken, 'spawn-persist-complete');
      this.assertLoadActive(token);
      update({ stage: 'finalizing', completed: 1, total: 1, primaryMessage: 'Finalizing', secondaryMessage: 'Starting game' });
      this.audio.beginWorldSession(result.gameMode === GameMode.Creative ? 'creative' : 'survival');
      this.engine = new Engine(this.blockRegistry, this.atlas, this.itemAtlas, this.entityTextures, this.armourTextures, service, this.skinManager, this.settings, this.audio, () => void this.showPauseMenu(), (error) => void this.handlePersistenceError(error));
      this.setScreen(null, 'in_game');
      this.engine.start();
      recordLoadPerformanceMark(loadPerfToken, 'engine-started');
      this.attachSessionControllers();
      // PUBLISH to the visible index only after initialization + spawn persistence
      // succeeded (amendment 2).
      await backend.upsertWorld(this.summaryFromMetadata(metadata));
      recordLoadPerformanceMark(loadPerfToken, 'world-published');
      published = true;
      loadPerfStatus = 'completed';
      service = null; // ownership transferred to the engine; do not clean up on success
    } catch (error) {
      // Failed creation must not leave a selectable partial world: clean up any
      // partial new-format records (amendment 2).
      if (!published && worldId !== null) {
        try { await backend.deleteWorld(worldId); } catch (cleanupError) { console.warn('[ApplicationController] cleanup of partial world failed:', cleanupError); }
      }
      if (service !== null) { try { await service.close(); } catch { /* best effort */ } }
      this.engine = null;
      if (error instanceof SpawnPreparationCancelled) loadPerfStatus = 'cancelled';
      if (!(error instanceof SpawnPreparationCancelled)) {
        console.error('[ApplicationController] Create world failed:', error);
        this.showError('Create world failed', error instanceof Error ? error.message : String(error));
      }
    } finally {
      finishLoadPerformanceSession(loadPerfToken, loadPerfStatus);
      this.finishLoadOperation(token);
    }
  }

  private async loadExistingWorld(worldId: string): Promise<void> {
    const token = this.beginLoadOperation(`load world ${worldId}`);
    if (token === null) return;
    const backend = this.backend;
    if (backend === null) {
      this.finishLoadOperation(token);
      this.showError('Storage unavailable', 'World storage could not be opened.');
      return;
    }
    this.screen?.dispose();
    const loading = new LoadingScreen();
    this.setScreen(loading, 'world_loading');
    const update = (progress: LoadingProgress): void => loading.update(progress);
    let service: WorldPersistenceService | null = null;
    const loadPerfToken = beginLoadPerformanceSession('load', worldId);
    let loadPerfStatus: LoadPerformanceStatus = 'failed';
    try {
      update({ stage: 'metadata', completed: 0, total: undefined, primaryMessage: 'Loading world', secondaryMessage: worldId });
      recordLoadPerformanceMark(loadPerfToken, 'metadata-start');
      service = new WorldPersistenceService({ backend });
      await service.open(worldId);
      // loadMetadata fails loud (RecordCorruptionError) on corrupt metadata.
      const metadata = await service.loadMetadata();
      recordLoadPerformanceMark(loadPerfToken, 'metadata-loaded');
      if (metadata === undefined) throw new Error('World metadata not found (the world may be missing or was never fully created).');
      this.assertLoadActive(token);
      await this.prepareSpawn(metadata.seed, update, token, loadPerfToken);
      this.assertLoadActive(token);
      update({ stage: 'finalizing', completed: 1, total: 1, primaryMessage: 'Finalizing', secondaryMessage: 'Starting game' });
      this.audio.beginWorldSession(metadata.gameMode === GameMode.Creative ? 'creative' : 'survival');
      this.engine = new Engine(this.blockRegistry, this.atlas, this.itemAtlas, this.entityTextures, this.armourTextures, service, this.skinManager, this.settings, this.audio, () => void this.showPauseMenu(), (error) => void this.handlePersistenceError(error));
      this.setScreen(null, 'in_game');
      this.engine.start();
      recordLoadPerformanceMark(loadPerfToken, 'engine-started');
      this.attachSessionControllers();
      service = null; // ownership transferred to the engine
      // Refresh last-played in the index.
      await backend.upsertWorld(this.summaryFromMetadata({ ...metadata, lastPlayedMs: Date.now() }));
      recordLoadPerformanceMark(loadPerfToken, 'world-index-updated');
      loadPerfStatus = 'completed';
    } catch (error) {
      if (service !== null) { try { await service.close(); } catch { /* best effort */ } }
      this.engine = null;
      if (error instanceof SpawnPreparationCancelled) {
        loadPerfStatus = 'cancelled';
        // cancelled; no error screen
      } else if (error instanceof RecordCorruptionError) {
        console.error('[ApplicationController] Load world failed (corruption):', error);
        this.showPersistenceError(error);
      } else {
        console.error('[ApplicationController] Load world failed:', error);
        this.showError('Loading failed', error instanceof Error ? error.message : String(error));
      }
    } finally {
      finishLoadPerformanceSession(loadPerfToken, loadPerfStatus);
      this.finishLoadOperation(token);
    }
  }

  private async showPauseMenu(): Promise<void> {
    if (this.engine === null) return;
    this.pauseEscapeArmed = false;
    this.engine.setPaused(true);
    this.setScreen(new PauseMenuScreen({ resume: () => this.resumeGame(), options: () => this.showOptions('pause'), saveQuit: () => void this.saveQuitToTitle() }), 'pause_menu');
  }

  private resumeGame(): void {
    if (this.engine === null) return;
    this.pauseEscapeArmed = false;
    this.setScreen(null, 'in_game');
    this.engine.setPaused(false);
  }

  /** Attach the Save-and-Quit controller + dirty-warning subscription to the active session. */
  private attachSessionControllers(): void {
    if (this.engine === null) return;
    this.dirtyWarning.attach(this.engine);
    this.saveExitController = new SaveExitController(this.engine, {
      onStateChange: (state, diag) => this.onSaveExitStateChange(state, diag),
      onCompleted: () => void this.onSaveExitCompleted(),
    });
  }

  private async saveQuitToTitle(): Promise<void> {
    if (this.engine === null || this.saveExitController === null) return;
    if (!this.saveExitController.isSettled) return; // no overlap/re-entrancy
    this.showSavingScreen();
    // The controller owns the operation + watchdogs; UI reacts via onStateChange.
    this.saveExitController.start();
  }

  private showSavingScreen(): void {
    this.screen?.dispose();
    const loading = new LoadingScreen();
    this.setScreen(loading, 'world_loading');
    loading.update({ stage: 'finalizing', completed: 0, total: undefined, primaryMessage: 'Saving world', secondaryMessage: 'Please wait' });
  }

  private onSaveExitStateChange(state: SaveExitState, diag: SaveExitDiagnostics): void {
    if (state === 'quiescing' || state === 'saving') {
      if (this.state !== 'world_loading') this.showSavingScreen();
    } else if (state === 'waiting_after_timeout') {
      this.showSaveTimeoutScreen(diag);
    } else if (state === 'failed') {
      this.showSaveFailedScreen(diag);
    } else if (state === 'idle') {
      // Returned to the world after a failed attempt: gameplay resumed, paused.
      void this.showPauseMenu();
    }
  }

  private async onSaveExitCompleted(): Promise<void> {
    // Fully successful save + service close: tear down the session and go to title.
    this.dirtyWarning.detach();
    this.saveExitController = null;
    this.engine = null; // engine already stopped by the controller
    this.audio.endWorldSession();
    await this.showMainMenu();
  }

  private retrySaveAndQuit(): void {
    if (this.saveExitController === null) return;
    this.showSavingScreen();
    this.saveExitController.start(); // failed -> quiescing (Retry); guarded to settled-only
  }

  private returnToWorld(): void {
    if (this.saveExitController === null) return;
    this.saveExitController.returnToWorld(); // failed -> idle; onSaveExitStateChange shows the pause menu
  }

  private continueWaiting(): void {
    // The operation is still running; return to the saving screen.
    this.showSavingScreen();
  }

  private showSaveFailedScreen(diag: SaveExitDiagnostics): void {
    this.setScreen(new PersistenceErrorScreen(
      'Save Failed',
      'The world could not be saved. Nothing was reported as saved. The world is still open.',
      this.formatSaveDiagnostics(diag),
      [
        { label: 'Retry Save & Quit', onClick: () => this.retrySaveAndQuit() },
        { label: 'Return to World', onClick: () => this.returnToWorld() },
      ],
    ), 'error');
  }

  private showSaveTimeoutScreen(diag: SaveExitDiagnostics): void {
    this.setScreen(new PersistenceErrorScreen(
      'Save Is Taking A While',
      'The save is still running and has not finished. The result is not yet known. Do not close the page.',
      this.formatSaveDiagnostics(diag),
      [
        { label: 'Continue Waiting', onClick: () => this.continueWaiting() },
        { label: 'Reload App', onClick: () => window.location.reload() },
      ],
    ), 'error');
  }

  private formatSaveDiagnostics(diag: SaveExitDiagnostics): string {
    const e = diag.engine;
    return [
      `State: ${diag.state}`,
      `Stalled stage: ${diag.stalledStage ?? '(none)'}`,
      `Elapsed: ${diag.elapsedMs}ms`,
      `Escalated: ${diag.escalated}`,
      `Error: ${diag.error ?? '(none)'}`,
      `World: ${e.service.worldId ?? '(none)'}`,
      `Dirty chunks: ${e.dirtyChunks}`,
      `Write lane: accepted=${e.service.writeLane.accepted} completed=${e.service.writeLane.completed} active=${e.service.writeLane.active} pending=${e.service.writeLane.pending}`,
      `Queued by priority: ${JSON.stringify(e.service.writeLane.queuedByPriority)}`,
      `Pending reads: ${e.pendingReads}`,
      `Pending unloads: ${e.pendingUnloads} (service: ${e.service.pendingUnloads})`,
      `Metadata write in flight: ${e.service.metadataWriteInFlight}`,
      `Quiescing: ${e.quiescing}  Save active: ${e.saveExitActive}  Autosave paused: ${e.autosavePaused}`,
      `Last persistence error: ${e.service.lastError?.message ?? '(none)'}`,
      `Autosave last failure: ${e.autosaveStats.lastFailure ?? '(none)'}`,
    ].join('\n');
  }

  private async updateSettings(settings: GameSettings): Promise<void> {
    this.settings = settings;
    setGlobalGuiScaleSetting(settings.video.guiScale);
    window.dispatchEvent(new Event('resize'));
    this.audio.applySettings(settings);
    this.engine?.applySettings(settings);
    if (this.backend !== null) {
      await saveGameSettings(this.backend, settings);
    }
  }

  private installAudioActivation(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('pointerdown', this.audioActivation, { capture: true });
    window.addEventListener('keydown', this.audioActivation, { capture: true });
  }

  private async loadFont(): Promise<void> {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    try {
      await Promise.race([document.fonts.load('16px Minecraft'), new Promise((_, reject) => setTimeout(() => reject(new Error('Minecraft font load timed out')), 1500))]);
    } catch (error) {
      console.warn('[ApplicationController] Failed to load public/Minecraft.ttf; using fallback font.', error);
    }
  }

  private async showDelete(worldId: string): Promise<void> {
    const backend = this.backend;
    if (backend === null) return this.showError('Storage unavailable', 'World storage could not be opened.');
    const world = (await backend.listWorlds()).find((entry) => entry.worldId === worldId);
    if (!world) return this.showError('Delete failed', 'World no longer exists.');
    this.setScreen(new ConfirmDeleteScreen(world.displayName, () => void this.deleteWorld(world.worldId), () => void this.showWorldSelect()), 'confirm_delete');
  }

  private async deleteWorld(worldId: string): Promise<void> {
    const backend = this.backend;
    if (backend === null) return this.showError('Storage unavailable', 'World storage could not be opened.');
    // Removes the index entry and all of the world's chunk/record data.
    await backend.deleteWorld(worldId);
    await this.showWorldSelect();
  }

  private async showRename(worldId: string): Promise<void> {
    const backend = this.backend;
    if (backend === null) return this.showError('Storage unavailable', 'World storage could not be opened.');
    const world = (await backend.listWorlds()).find((entry) => entry.worldId === worldId);
    if (!world) return this.showError('Rename failed', 'World no longer exists.');
    this.setScreen(new RenameWorldScreen(world.displayName, (name) => void this.renameWorld(world.worldId, name), () => void this.showWorldSelect()), 'world_select');
  }

  private async renameWorld(worldId: string, displayName: string): Promise<void> {
    const backend = this.backend;
    if (backend === null) return this.showError('Storage unavailable', 'World storage could not be opened.');
    const service = new WorldPersistenceService({ backend });
    try {
      await service.open(worldId);
      const metadata = await service.loadMetadata();
      if (metadata === undefined) throw new Error('World metadata not found.');
      const renamed: WorldMetadata = { ...metadata, name: displayName, displayName };
      await service.saveMetadata(renamed, WRITE_PRIORITY_FORCED);
      await backend.upsertWorld(this.summaryFromMetadata(renamed));
    } catch (error) {
      console.error('[ApplicationController] Rename world failed:', error);
      this.showError('Rename failed', error instanceof Error ? error.message : String(error));
    } finally {
      await service.close();
    }
    await this.showWorldSelect();
  }

  /** Generate and durably save the spawn area so a new world is initialized before publishing. */
  private async persistSpawnArea(
    service: WorldPersistenceService,
    generator: BetaWorldGenerator,
    spawn: { x: number; y: number; z: number },
    loadPerfToken: number | null = null,
    preparedChunks: ReadonlyMap<number, Chunk> = new Map(),
  ): Promise<void> {
    const spawnChunkX = Math.floor(spawn.x / CHUNK_SIZE_X);
    const spawnChunkZ = Math.floor(spawn.z / CHUNK_SIZE_X);
    for (let dz = -CREATION_SPAWN_PERSIST_RADIUS; dz <= CREATION_SPAWN_PERSIST_RADIUS; dz++) {
      for (let dx = -CREATION_SPAWN_PERSIST_RADIUS; dx <= CREATION_SPAWN_PERSIST_RADIUS; dx++) {
        const chunkX = spawnChunkX + dx;
        const chunkZ = spawnChunkZ + dz;
        let chunk = preparedChunks.get(chunkKey(chunkX, chunkZ));
        if (chunk === undefined) {
          chunk = new Chunk(chunkX, chunkZ);
          recordLoadGenerationRequest(loadPerfToken, 'persistSpawnArea', chunk.chunkX, chunk.chunkZ);
          generator.populate(chunk);
        }
        await service.saveChunk(chunk, WRITE_PRIORITY_FORCED);
      }
    }
    await service.flushBarrier();
  }

  private summaryFromMetadata(metadata: WorldMetadata): WorldSummary {
    return {
      worldId: metadata.worldId,
      name: metadata.name,
      displayName: metadata.displayName ?? metadata.name,
      formatVersion: metadata.formatVersion,
      gameMode: metadata.gameMode ?? GameMode.Survival,
      seed: metadata.seed,
      generatorVersion: metadata.generatorVersion ?? 'beta-browser-1',
      saveVersion: metadata.saveVersion ?? 1,
      createdAtMs: metadata.createdAt ?? 0,
      lastPlayedMs: metadata.lastPlayedMs ?? 0,
    };
  }

  /** Fail-loud handler invoked by the Engine when a mid-stream chunk read is corrupt. */
  private async handlePersistenceError(error: RecordCorruptionError): Promise<void> {
    console.error('[ApplicationController] Persistence corruption detected; halting world session:', error);
    this.dirtyWarning.detach();
    this.saveExitController = null;
    const engine = this.engine;
    this.engine = null;
    if (engine !== null) {
      try { await engine.abortForCorruption(); } catch (shutdownError) { console.warn('[ApplicationController] error during corruption shutdown:', shutdownError); }
    }
    this.audio.endWorldSession();
    this.showPersistenceError(error);
  }

  private showPersistenceError(error: RecordCorruptionError): void {
    const lines = [
      `Record kind: ${error.kind}`,
      `Validation stage: ${error.stage}`,
      error.worldId !== undefined ? `World: ${error.worldId}` : null,
      error.chunkX !== undefined && error.chunkZ !== undefined ? `Chunk: ${error.chunkX}, ${error.chunkZ}` : null,
      `Detail: ${error.message}`,
    ].filter((line): line is string => line !== null);
    this.setScreen(new PersistenceErrorScreen(
      'World Data Corrupted',
      'A stored record failed validation and was preserved unchanged. Loading was stopped to protect your data.',
      lines.join('\n'),
      [
        { label: 'World List', onClick: () => void this.showWorldSelect() },
        { label: 'Reload App', onClick: () => window.location.reload() },
      ],
    ), 'error');
  }

  private showError(title: string, message: string): void {
    this.setScreen(new ErrorScreen(title, message, () => void this.showMainMenu()), 'error');
  }

  private beginLoadOperation(label: string): number | null {
    if (this.loadInProgress) {
      console.warn(`[ApplicationController] Ignoring duplicate world load request while another load is in progress: ${label}`);
      return null;
    }
    this.loadInProgress = true;
    this.cancelSpawnPreparation();
    return ++this.activeLoadToken;
  }

  private finishLoadOperation(token: number): void {
    if (token === this.activeLoadToken) this.loadInProgress = false;
  }

  private cancelActiveLoadOperation(): void {
    this.loadInProgress = false;
    this.cancelSpawnPreparation();
  }

  private assertLoadActive(token: number): void {
    if (token !== this.activeLoadToken) throw new SpawnPreparationCancelled();
  }

  private cancelSpawnPreparation(): void {
    this.activeLoadToken++;
    if (this.spawnPreparation !== null) {
      this.spawnPreparation.aborted = true;
      if (this.spawnPreparation.timeoutId !== null) window.clearTimeout(this.spawnPreparation.timeoutId);
      this.spawnPreparation.timeoutId = null;
      this.spawnPreparation = null;
    }
  }

  private async prepareSpawn(
    seed: string,
    update: (progress: LoadingProgress) => void,
    token: number,
    loadPerfToken: number | null = null,
    retainChunks = false,
  ): Promise<Map<number, Chunk>> {
    this.cancelSpawnPreparation();
    this.activeLoadToken = token;
    const state: SpawnPreparationState = { token, aborted: false, timeoutId: null };
    this.spawnPreparation = state;
    const generator = new BetaWorldGenerator(BigInt(seed));
    const radius = 4;
    const coords: Array<readonly [number, number]> = [];
    const preparedChunks = new Map<number, Chunk>();
    const maxDurationMs = 120_000;
    const startMs = performance.now();
    for (let z = -radius; z <= radius; z++) for (let x = -radius; x <= radius; x++) coords.push([x, z]);
    try {
      for (let i = 0; i < coords.length; i++) {
        if (state.aborted || token !== this.activeLoadToken) throw new SpawnPreparationCancelled();
        if (performance.now() - startMs > maxDurationMs) throw new Error(`Preparing spawn area timed out after ${maxDurationMs / 1000}s.`);
        const [x, z] = coords[i]!;
        update({ stage: 'terrain', completed: i, total: coords.length, primaryMessage: 'Preparing spawn area', secondaryMessage: `Chunk ${i + 1}/${coords.length}` });
        recordLoadGenerationRequest(loadPerfToken, 'prepareSpawn', x, z);
        const chunk = new Chunk(x, z);
        generator.populate(chunk);
        if (retainChunks) preparedChunks.set(chunkKey(x, z), chunk);
        if (i % 4 === 0) await this.spawnPreparationDelay(state, 0);
      }
      update({ stage: 'terrain', completed: coords.length, total: coords.length, primaryMessage: 'Preparing spawn area', secondaryMessage: 'Complete' });
      return preparedChunks;
    } finally {
      if (this.spawnPreparation === state) {
        if (state.timeoutId !== null) window.clearTimeout(state.timeoutId);
        this.spawnPreparation = null;
      }
    }
  }

  private spawnPreparationDelay(state: SpawnPreparationState, ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (state.aborted || state.token !== this.activeLoadToken) {
        reject(new SpawnPreparationCancelled());
        return;
      }
      state.timeoutId = window.setTimeout(() => {
        state.timeoutId = null;
        if (state.aborted || state.token !== this.activeLoadToken) reject(new SpawnPreparationCancelled());
        else resolve();
      }, ms);
    });
  }

  private async unloadWorld(): Promise<void> {
    this.cancelSpawnPreparation();
    this.dirtyWarning.detach();
    this.saveExitController = null;
    if (this.engine === null) return;
    // Application disposal: save, close the service (not the backend), stop the engine.
    await this.engine.saveAndQuit();
    this.engine = null;
    this.audio.endWorldSession();
  }
}
