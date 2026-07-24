import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../assets/ItemTextureAtlas';
import type { EntityTextureAssets } from '../assets/EntityTextureAssets';
import type { ArmourTextureAssets } from '../assets/ArmourTextureAssets';
import { Engine } from '../engine/Engine';
import type { PlayerSkinManager } from '../player/PlayerSkinManager';
// Legacy storage is kept ONLY for isolated app settings (approved temporarily).
import { IndexedDbWorldStorage } from '../persistence/storage/IndexedDbWorldStorage';
import type { WorldStorage } from '../persistence/storage/WorldStorage';
// New persistence system owns all world data (list/create/load/delete/rename/save).
import { IdbStorageBackend } from '../persistence2/backend/IdbStorageBackend';
import type { WorldSummary } from '../persistence2/backend/StorageBackend';
import { WorldPersistenceService, WRITE_PRIORITY_FORCED } from '../persistence2/WorldPersistenceService';
import { RecordCorruptionError } from '../persistence2/codec/PersistenceError';
// Kept primitives.
import { createDefaultMetadata, type WorldMetadata } from '../persistence/metadata/WorldMetadata';
import { parseWorldSeed } from '../persistence/world/SeedParser';
// Pure helper (temporary import until the legacy index module is removed in Stage 4).
import { uniqueWorldId } from '../persistence/world/WorldIndex';
import { findBetaSpawn, getSafePlayerY } from '../world/generation/WorldSpawnFinder';
import { CHUNK_SIZE_X } from '../world/chunkConstants';
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
  private settings: GameSettings = DEFAULT_GAME_SETTINGS;
  private readonly audio = new AudioManager();
  private optionsParent: 'main' | 'pause' = 'main';
  private pauseEscapeArmed = true;
  private activeLoadToken = 0;
  private loadInProgress = false;
  private saveExitInFlight = false;
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
  /** Legacy storage retained ONLY for isolated app settings. */
  private readonly storagePromise: Promise<WorldStorage>;
  /** Application-owned world backend (new system); opened in start(), closed in dispose(). */
  private backend: IdbStorageBackend | null = null;

  public constructor(
    private readonly blockRegistry: BlockRegistry,
    private readonly atlas: TextureAtlas,
    private readonly itemAtlas: ItemTextureAtlas,
    private readonly entityTextures: EntityTextureAssets,
    private readonly armourTextures: ArmourTextureAssets,
    private readonly skinManager: PlayerSkinManager,
  ) {
    this.storagePromise = IndexedDbWorldStorage.open();
  }

  public async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const settingsStorage = await this.storagePromise;
    this.settings = await loadGameSettings(settingsStorage);
    setGlobalGuiScaleSetting(this.settings.video.guiScale);
    this.audio.applySettings(this.settings);
    this.installAudioActivation();
    await this.loadFont();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    // Open the application-owned world backend before the world list queries it.
    try {
      const backend = new IdbStorageBackend();
      await backend.open();
      this.backend = backend;
    } catch (error) {
      console.error('[ApplicationController] Failed to open world storage backend:', error);
      this.backend = null; // showWorldSelect will surface a storage error
    }
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
    const settingsStorage = await this.storagePromise;
    await settingsStorage.close?.();
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
    try {
      const displayName = result.name.trim();
      if (displayName.length === 0) throw new Error('World name cannot be empty.');
      update({ stage: 'metadata', completed: 0, total: undefined, primaryMessage: 'Creating world', secondaryMessage: displayName });
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
      this.assertLoadActive(token);
      await this.prepareSpawn(metadata.seed, update, token);
      this.assertLoadActive(token);
      // Required spawn persistence: generate and durably save the spawn area so
      // the world is initialized before it becomes selectable (amendment 2).
      update({ stage: 'terrain', completed: 0, total: undefined, primaryMessage: 'Saving spawn area', secondaryMessage: '' });
      await this.persistSpawnArea(service, generator, spawn);
      this.assertLoadActive(token);
      update({ stage: 'finalizing', completed: 1, total: 1, primaryMessage: 'Finalizing', secondaryMessage: 'Starting game' });
      this.audio.beginWorldSession(result.gameMode === GameMode.Creative ? 'creative' : 'survival');
      this.engine = new Engine(this.blockRegistry, this.atlas, this.itemAtlas, this.entityTextures, this.armourTextures, service, this.skinManager, this.settings, this.audio, () => void this.showPauseMenu(), (error) => void this.handlePersistenceError(error));
      this.setScreen(null, 'in_game');
      this.engine.start();
      // PUBLISH to the visible index only after initialization + spawn persistence
      // succeeded (amendment 2).
      await backend.upsertWorld(this.summaryFromMetadata(metadata));
      published = true;
      service = null; // ownership transferred to the engine; do not clean up on success
    } catch (error) {
      // Failed creation must not leave a selectable partial world: clean up any
      // partial new-format records (amendment 2).
      if (!published && worldId !== null) {
        try { await backend.deleteWorld(worldId); } catch (cleanupError) { console.warn('[ApplicationController] cleanup of partial world failed:', cleanupError); }
      }
      if (service !== null) { try { await service.close(); } catch { /* best effort */ } }
      this.engine = null;
      if (!(error instanceof SpawnPreparationCancelled)) {
        console.error('[ApplicationController] Create world failed:', error);
        this.showError('Create world failed', error instanceof Error ? error.message : String(error));
      }
    } finally {
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
    try {
      update({ stage: 'metadata', completed: 0, total: undefined, primaryMessage: 'Loading world', secondaryMessage: worldId });
      service = new WorldPersistenceService({ backend });
      await service.open(worldId);
      // loadMetadata fails loud (RecordCorruptionError) on corrupt metadata.
      const metadata = await service.loadMetadata();
      if (metadata === undefined) throw new Error('World metadata not found (the world may be missing or was never fully created).');
      this.assertLoadActive(token);
      await this.prepareSpawn(metadata.seed, update, token);
      this.assertLoadActive(token);
      update({ stage: 'finalizing', completed: 1, total: 1, primaryMessage: 'Finalizing', secondaryMessage: 'Starting game' });
      this.audio.beginWorldSession(metadata.gameMode === GameMode.Creative ? 'creative' : 'survival');
      this.engine = new Engine(this.blockRegistry, this.atlas, this.itemAtlas, this.entityTextures, this.armourTextures, service, this.skinManager, this.settings, this.audio, () => void this.showPauseMenu(), (error) => void this.handlePersistenceError(error));
      this.setScreen(null, 'in_game');
      this.engine.start();
      service = null; // ownership transferred to the engine
      // Refresh last-played in the index.
      await backend.upsertWorld(this.summaryFromMetadata({ ...metadata, lastPlayedMs: Date.now() }));
    } catch (error) {
      if (service !== null) { try { await service.close(); } catch { /* best effort */ } }
      this.engine = null;
      if (error instanceof SpawnPreparationCancelled) {
        // cancelled; no error screen
      } else if (error instanceof RecordCorruptionError) {
        console.error('[ApplicationController] Load world failed (corruption):', error);
        this.showPersistenceError(error);
      } else {
        console.error('[ApplicationController] Load world failed:', error);
        this.showError('Loading failed', error instanceof Error ? error.message : String(error));
      }
    } finally {
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

  private async saveQuitToTitle(): Promise<void> {
    if (this.engine === null) return;
    if (this.saveExitInFlight) return;
    this.saveExitInFlight = true;
    try {
      this.screen?.dispose();
      const loading = new LoadingScreen();
      this.setScreen(loading, 'world_loading');
      loading.update({ stage: 'finalizing', completed: 0, total: undefined, primaryMessage: 'Saving world', secondaryMessage: 'Please wait' });
      // Stage 2 Save-and-Quit bridge (amendment 1): freeze gameplay, save dirty
      // chunks, save final metadata, await the barrier, close the service (never
      // the shared backend), dispose the engine. No legacy save pipeline.
      await this.engine.saveAndQuit();
      this.engine = null;
      this.audio.endWorldSession();
      await this.showMainMenu();
    } catch (error) {
      console.error('[ApplicationController] Save and Quit failed:', error);
      if (this.engine !== null) this.engine.setPaused(true);
      this.showError('Save failed', error instanceof Error ? error.message : String(error));
    } finally {
      this.saveExitInFlight = false;
    }
  }

  private async updateSettings(settings: GameSettings): Promise<void> {
    this.settings = settings;
    setGlobalGuiScaleSetting(settings.video.guiScale);
    window.dispatchEvent(new Event('resize'));
    this.audio.applySettings(settings);
    this.engine?.applySettings(settings);
    await saveGameSettings(await this.storagePromise, settings);
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
  private async persistSpawnArea(service: WorldPersistenceService, generator: BetaWorldGenerator, spawn: { x: number; y: number; z: number }): Promise<void> {
    const spawnChunkX = Math.floor(spawn.x / CHUNK_SIZE_X);
    const spawnChunkZ = Math.floor(spawn.z / CHUNK_SIZE_X);
    for (let dz = -CREATION_SPAWN_PERSIST_RADIUS; dz <= CREATION_SPAWN_PERSIST_RADIUS; dz++) {
      for (let dx = -CREATION_SPAWN_PERSIST_RADIUS; dx <= CREATION_SPAWN_PERSIST_RADIUS; dx++) {
        const chunk = new Chunk(spawnChunkX + dx, spawnChunkZ + dz);
        generator.populate(chunk);
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
    const engine = this.engine;
    this.engine = null;
    if (engine !== null) {
      try { await engine.abortForCorruption(); } catch (shutdownError) { console.warn('[ApplicationController] error during corruption shutdown:', shutdownError); }
    }
    this.audio.endWorldSession();
    this.showPersistenceError(error);
  }

  private showPersistenceError(error: RecordCorruptionError): void {
    this.setScreen(new PersistenceErrorScreen(error, { returnToWorldList: () => void this.showWorldSelect() }), 'error');
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

  private async prepareSpawn(seed: string, update: (progress: LoadingProgress) => void, token: number): Promise<void> {
    this.cancelSpawnPreparation();
    this.activeLoadToken = token;
    const state: SpawnPreparationState = { token, aborted: false, timeoutId: null };
    this.spawnPreparation = state;
    const generator = new BetaWorldGenerator(BigInt(seed));
    const radius = 4;
    const coords: Array<readonly [number, number]> = [];
    const maxDurationMs = 120_000;
    const startMs = performance.now();
    for (let z = -radius; z <= radius; z++) for (let x = -radius; x <= radius; x++) coords.push([x, z]);
    try {
      for (let i = 0; i < coords.length; i++) {
        if (state.aborted || token !== this.activeLoadToken) throw new SpawnPreparationCancelled();
        if (performance.now() - startMs > maxDurationMs) throw new Error(`Preparing spawn area timed out after ${maxDurationMs / 1000}s.`);
        const [x, z] = coords[i]!;
        update({ stage: 'terrain', completed: i, total: coords.length, primaryMessage: 'Preparing spawn area', secondaryMessage: `Chunk ${i + 1}/${coords.length}` });
        generator.populate(new Chunk(x, z));
        if (i % 4 === 0) await this.spawnPreparationDelay(state, 0);
      }
      update({ stage: 'terrain', completed: coords.length, total: coords.length, primaryMessage: 'Preparing spawn area', secondaryMessage: 'Complete' });
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
    if (this.engine === null) return;
    // Save-and-quit bridge: freeze, save, close the service (not the backend), stop.
    await this.engine.saveAndQuit();
    this.engine = null;
    this.audio.endWorldSession();
  }
}
