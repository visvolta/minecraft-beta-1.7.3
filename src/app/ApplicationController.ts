
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
import type { Screen } from '../ui/menu/MenuWidgets';
import { BetaWorldGenerator } from '../world/generation/BetaWorldGenerator';
import { Chunk } from '../world/Chunk';

export type ApplicationState = 'boot' | 'main_menu' | 'world_select' | 'world_create' | 'world_loading' | 'in_game' | 'options' | 'confirm_delete' | 'error';

export class ApplicationController {
  private state: ApplicationState = 'boot';
  private screen: Screen | null = null;
  private engine: Engine | null = null;
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

  public async start(): Promise<void> { await this.showMainMenu(); }
  public getState(): ApplicationState { return this.state; }
  public hasEngine(): boolean { return this.engine !== null; }

  private setScreen(screen: Screen | null, state: ApplicationState): void {
    this.screen?.dispose();
    this.screen = screen;
    this.state = state;
    if (screen) screen.mount();
  }

  private async showMainMenu(): Promise<void> {
    await this.unloadWorld();
    this.setScreen(new MainMenuScreen({ singleplayer: () => void this.showWorldSelect(), options: () => this.showOptions(), quit: () => this.showError('Quit Game', 'You can close this browser tab when ready.') }), 'main_menu');
  }

  private showOptions(): void { this.setScreen(new OptionsScreen(() => void this.showMainMenu()), 'options'); }

  private async showWorldSelect(): Promise<void> {
    const storage = await this.storagePromise;
    const index = await readWorldIndex(storage);
    this.setScreen(new WorldSelectScreen(index.worlds, { play: (id) => void this.loadExistingWorld(id), create: () => this.showWorldCreate(), rename: (id) => void this.showRename(id), delete: (id) => void this.showDelete(id), back: () => void this.showMainMenu() }), 'world_select');
  }

  private showWorldCreate(): void {
    this.setScreen(new WorldCreateScreen((result) => void this.createAndLoadWorld(result), () => void this.showWorldSelect()), 'world_create');
  }

  private async createAndLoadWorld(result: WorldCreateResult): Promise<void> {
    const storage = await this.storagePromise;
    await this.withLoading(async (loading) => {
      loading.update({ stage: 'metadata', completed: 0, total: undefined, primaryMessage: 'Creating world', secondaryMessage: result.name });
      const opened = await createWorld(result, storage);
      await this.prepareSpawn(opened.coordinator.getMetadata().seed, loading.update);
      loading.update({ stage: 'finalizing', completed: 1, total: 1, primaryMessage: 'Finalizing', secondaryMessage: 'Starting game' });
      this.engine = new Engine(this.blockRegistry, this.atlas, this.itemAtlas, this.entityTextures, this.armourTextures, opened.coordinator, opened.storage, this.skinManager);
      this.setScreen(null, 'in_game');
      this.engine.start();
      await upsertWorldIndexEntry(storage, metadataToIndexEntry(opened.coordinator.getMetadata()));
    });
  }

  private async loadExistingWorld(worldId: string): Promise<void> {
    const storage = await this.storagePromise;
    await this.withLoading(async (loading) => {
      loading.update({ stage: 'metadata', completed: 0, total: undefined, primaryMessage: 'Loading world', secondaryMessage: worldId });
      const opened = await openWorld(worldId, storage);
      await this.prepareSpawn(opened.coordinator.getMetadata().seed, loading.update);
      loading.update({ stage: 'finalizing', completed: 1, total: 1, primaryMessage: 'Finalizing', secondaryMessage: 'Starting game' });
      this.engine = new Engine(this.blockRegistry, this.atlas, this.itemAtlas, this.entityTextures, this.armourTextures, opened.coordinator, opened.storage, this.skinManager);
      this.setScreen(null, 'in_game');
      this.engine.start();
      await upsertWorldIndexEntry(storage, metadataToIndexEntry(opened.coordinator.getMetadata()));
    });
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
    catch (error) { console.error(error); this.showError('Loading failed', error instanceof Error ? error.message : String(error)); }
  }

  private async prepareSpawn(seed: string, update: (progress: LoadingProgress) => void): Promise<void> {
    const generator = new BetaWorldGenerator(BigInt(seed));
    const radius = 4;
    const coords: Array<readonly [number, number]> = [];
    for (let z = -radius; z <= radius; z++) for (let x = -radius; x <= radius; x++) coords.push([x, z]);
    for (let i = 0; i < coords.length; i++) {
      const [x, z] = coords[i]!;
      update({ stage: 'terrain', completed: i, total: coords.length, primaryMessage: 'Preparing spawn area', secondaryMessage: `Chunk ${i + 1}/${coords.length}` });
      generator.populate(new Chunk(x, z));
      if (i % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  private showError(title: string, message: string): void {
    const screen = new OptionsScreen(() => void this.showMainMenu());
    screen.root.querySelector('div')!.textContent = title;
    const msg = document.createElement('div'); msg.textContent = message; msg.style.cssText='position:absolute;left:10%;right:10%;top:140px;text-align:center;color:#ff8080;font:14px monospace'; screen.root.append(msg);
    this.setScreen(screen, 'error');
  }

  private async unloadWorld(): Promise<void> {
    if (this.engine === null) return;
    await this.engine.saveAndStop();
    this.engine = null;
  }
}
