import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../assets/ItemTextureAtlas';
import type { EntityTextureAssets } from '../assets/EntityTextureAssets';
import type { ArmourTextureAssets } from '../assets/ArmourTextureAssets';
import { Engine } from '../engine/Engine';
import type { PlayerSkinManager } from '../player/PlayerSkinManager';
import { IndexedDbWorldStorage } from '../persistence/storage/IndexedDbWorldStorage';
import type { WorldStorage } from '../persistence/storage/WorldStorage';
import { createWorld, metadataToIndexEntry, openWorld } from '../persistence/WorldPersistence';
import { readWorldIndex, removeWorldIndexEntry, upsertWorldIndexEntry } from '../persistence/world/WorldIndex';
import type { LoadingProgress } from './LoadingProgress';
import { MainMenuScreen } from '../ui/menu/MainMenuScreen';
import { WorldSelectScreen } from '../ui/menu/WorldSelectScreen';
import { WorldCreateScreen, type WorldCreateResult } from '../ui/menu/WorldCreateScreen';
import { LoadingScreen } from '../ui/menu/LoadingScreen';
import { OptionsScreen } from '../ui/menu/OptionsScreen';
import { ConfirmDeleteScreen } from '../ui/menu/ConfirmDeleteScreen';
import { RenameWorldScreen } from '../ui/menu/RenameWorldScreen';
import { ErrorScreen } from '../ui/menu/ErrorScreen';
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
  private spawnPreparation: SpawnPreparationState | null = null;
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
  private readonly storagePromise: Promise<WorldStorage>;

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

  public async start(): Promise<void> { const storage = await this.storagePromise; this.settings = await loadGameSettings(storage); setGlobalGuiScaleSetting(this.settings.video.guiScale); this.audio.applySettings(this.settings); this.installAudioActivation(); await this.loadFont(); window.addEventListener('resize', () => applyGuiScaleCssVariables()); window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup); await this.showMainMenu(); }
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
    await this.unloadWorld();
    this.audio.setMusicContext('menu');
    this.setScreen(new MainMenuScreen({ singleplayer: () => void this.showWorldSelect(), options: () => this.showOptions('main'), quit: () => this.showError('Quit Game', 'You can close this browser tab when ready.') }), 'main_menu');
  }

  private showOptions(parent: 'main' | 'pause' = 'main'): void { this.optionsParent = parent; this.setScreen(new OptionsScreen(this.settings, { done: () => parent === 'pause' ? this.showPauseMenu() : void this.showMainMenu(), video: () => this.showVideoSettings(parent), controls: () => this.showControls(parent), setSettings: (settings) => void this.updateSettings(settings) }), 'options'); }

  private showVideoSettings(parent: 'main' | 'pause'): void { this.setScreen(new VideoSettingsScreen(this.settings, (settings) => void this.updateSettings(settings), () => this.showOptions(parent)), 'video_settings'); }

  private showControls(parent: 'main' | 'pause'): void { this.setScreen(new ControlsScreen(this.settings, (settings) => void this.updateSettings(settings), () => this.showOptions(parent)), 'controls'); }

  private async showWorldSelect(): Promise<void> {
    const storage = await this.storagePromise;
    const index = await readWorldIndex(storage);
    this.setScreen(new WorldSelectScreen(index.worlds, { play: (id) => void this.loadExistingWorld(id), create: () => this.showWorldCreate(), rename: (id) => void this.showRename(id), delete: (id) => void this.showDelete(id), back: () => void this.showMainMenu() }), 'world_select');
  }

  private showWorldCreate(): void {
    this.setScreen(new WorldCreateScreen((result) => void this.createAndLoadWorld(result), () => void this.showWorldSelect()), 'world_create');
  }

  private async createAndLoadWorld(result: WorldCreateResult): Promise<void> {
    const token = this.beginLoadOperation('create world');
    if (token === null) return;
    const storage = await this.storagePromise;
    try {
      await this.withLoading(async (loading) => {
        this.assertLoadActive(token);
        loading.update({ stage: 'metadata', completed: 0, total: undefined, primaryMessage: 'Creating world', secondaryMessage: result.name });
        const opened = await createWorld(result, storage);
        this.assertLoadActive(token);
        await this.prepareSpawn(opened.coordinator.getMetadata().seed, loading.update, token);
        this.assertLoadActive(token);
        loading.update({ stage: 'finalizing', completed: 1, total: 1, primaryMessage: 'Finalizing', secondaryMessage: 'Starting game' });
        this.audio.beginWorldSession(opened.coordinator.getMetadata().gameMode === GameMode.Creative ? 'creative' : 'survival');
        this.engine = new Engine(this.blockRegistry, this.atlas, this.itemAtlas, this.entityTextures, this.armourTextures, opened.coordinator, opened.storage, this.skinManager, this.settings, this.audio, () => void this.showPauseMenu());
        this.setScreen(null, 'in_game');
        this.engine.start();
        await upsertWorldIndexEntry(storage, metadataToIndexEntry(opened.coordinator.getMetadata()));
      });
    } finally {
      this.finishLoadOperation(token);
    }
  }

  private async loadExistingWorld(worldId: string): Promise<void> {
    const token = this.beginLoadOperation(`load world ${worldId}`);
    if (token === null) return;
    const storage = await this.storagePromise;
    try {
      await this.withLoading(async (loading) => {
        this.assertLoadActive(token);
        loading.update({ stage: 'metadata', completed: 0, total: undefined, primaryMessage: 'Loading world', secondaryMessage: worldId });
        const opened = await openWorld(worldId, storage);
        this.assertLoadActive(token);
        await this.prepareSpawn(opened.coordinator.getMetadata().seed, loading.update, token);
        this.assertLoadActive(token);
        loading.update({ stage: 'finalizing', completed: 1, total: 1, primaryMessage: 'Finalizing', secondaryMessage: 'Starting game' });
        this.audio.beginWorldSession(opened.coordinator.getMetadata().gameMode === GameMode.Creative ? 'creative' : 'survival');
        this.engine = new Engine(this.blockRegistry, this.atlas, this.itemAtlas, this.entityTextures, this.armourTextures, opened.coordinator, opened.storage, this.skinManager, this.settings, this.audio, () => void this.showPauseMenu());
        this.setScreen(null, 'in_game');
        this.engine.start();
        await upsertWorldIndexEntry(storage, metadataToIndexEntry(opened.coordinator.getMetadata()));
      });
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
    try {
      this.screen?.dispose();
      const loading = new LoadingScreen();
      this.setScreen(loading, 'world_loading');
      loading.update({ stage: 'finalizing', completed: 0, total: undefined, primaryMessage: 'Saving world', secondaryMessage: 'Please wait' });
      await this.unloadWorld();
      await this.showMainMenu();
    } catch (error) {
      console.error(error);
      if (this.engine !== null) this.engine.setPaused(true);
      this.showError('Save failed', error instanceof Error ? error.message : String(error));
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
    const activate = (): void => { void this.audio.activate(); };
    window.addEventListener('pointerdown', activate, { capture: true });
    window.addEventListener('keydown', activate, { capture: true });
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
    const storage = await this.storagePromise;
    const world = (await readWorldIndex(storage)).worlds.find((entry) => entry.worldId === worldId);
    if (!world) return this.showError('Delete failed', 'World no longer exists.');
    this.setScreen(new ConfirmDeleteScreen(world.displayName, () => void this.deleteWorld(world.worldId), () => void this.showWorldSelect()), 'confirm_delete');
  }

  private async deleteWorld(worldId: string): Promise<void> {
    const storage = await this.storagePromise;
    await storage.deleteWorld?.(worldId);
    await removeWorldIndexEntry(storage, worldId);
    await this.showWorldSelect();
  }

  private async showRename(worldId: string): Promise<void> {
    const storage = await this.storagePromise;
    const world = (await readWorldIndex(storage)).worlds.find((entry) => entry.worldId === worldId);
    if (!world) return this.showError('Rename failed', 'World no longer exists.');
    this.setScreen(new RenameWorldScreen(world.displayName, (name) => void this.renameWorld(world.worldId, name), () => void this.showWorldSelect()), 'world_select');
  }

  private async renameWorld(worldId: string, displayName: string): Promise<void> {
    const storage = await this.storagePromise;
    const opened = await openWorld(worldId, storage);
    const current = opened.coordinator.getMetadata();
    opened.coordinator.update({ ...current, name: displayName, displayName });
    await opened.coordinator.save(true);
    await upsertWorldIndexEntry(storage, metadataToIndexEntry(opened.coordinator.getMetadata()));
    await this.showWorldSelect();
  }

  private async withLoading(work: (loading: { update: (progress: LoadingProgress) => void }) => Promise<void>): Promise<void> {
    const screen = new LoadingScreen();
    this.setScreen(screen, 'world_loading');
    try { await work({ update: (progress) => screen.update(progress) }); }
    catch (error) {
      if (error instanceof SpawnPreparationCancelled) return;
      console.error(error);
      this.showError('Loading failed', error instanceof Error ? error.message : String(error));
    }
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

  private showError(title: string, message: string): void {
    this.setScreen(new ErrorScreen(title, message, () => void this.showMainMenu()), 'error');
  }

  private async unloadWorld(): Promise<void> {
    this.cancelSpawnPreparation();
    if (this.engine === null) return;
    await this.engine.saveAndStop();
    this.engine = null;
    this.audio.endWorldSession();
  }
}
