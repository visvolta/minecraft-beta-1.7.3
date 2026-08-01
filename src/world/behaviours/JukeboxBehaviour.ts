import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { BlockIds } from '../../blocks/BlockId';
import { JUKEBOX_DISCS, discToItemId, type JukeboxManager } from '../../jukebox/JukeboxManager';

/**
 * Audio + item hooks injected by the engine so this behaviour stays decoupled
 * from the AudioManager, inventory and item-entity systems (and remains
 * headlessly testable).
 */
export interface JukeboxHooks {
  /** Plays a disc track (globally, like Beta music). */
  playRecord(disc: string): void;
  /** Stops the currently playing disc. */
  stopRecord(): void;
  /** Disc name held in the player's hand, or null. */
  getHeldDisc(): string | null;
  /** Consumes one held disc (no-op in creative). */
  consumeHeldDisc(): void;
  /** Spawns the ejected disc item in the world. */
  spawnDiscItem(x: number, y: number, z: number, itemId: string): void;
}

/**
 * Beta `BlockJukeBox`.
 *
 * Right-click with a disc while empty → insert, play, consume one disc
 * (unless creative). Right-click with a disc already inside → eject and stop
 * playback. Breaking the block ejects the disc. All 12 discs are supported.
 *
 * State lives in the per-chunk block-entity {@link JukeboxManager} (per
 * dimension, persisted) rather than a global coordinate map, so records
 * survive save/reload and chunk unload/reload.
 */
export class JukeboxBehaviour implements BlockBehaviour {
  private readonly manager: JukeboxManager;
  private readonly hooks: JukeboxHooks;

  public constructor(manager: JukeboxManager, hooks: JukeboxHooks) {
    this.manager = manager;
    this.hooks = hooks;
  }

  public onInteract(_ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const existing = this.manager.getDisc(x, y, z);

    // A disc is already inside: eject it (Beta always ejects first).
    if (existing !== null) {
      this.eject(x, y, z, existing);
      return true;
    }

    const held = this.hooks.getHeldDisc();
    if (held !== null && JUKEBOX_DISCS.includes(held)) {
      if (this.manager.insert(x, y, z, held)) {
        this.hooks.playRecord(held);
        this.hooks.consumeHeldDisc();
      }
      return true;
    }

    return false;
  }

  public onRemoved(_ctx: BlockBehaviourContext, x: number, y: number, z: number, _oldBlockId: number): void {
    const disc = this.manager.remove(x, y, z);
    if (disc !== null) this.eject(x, y, z, disc);
  }

  private eject(x: number, y: number, z: number, disc: string): void {
    this.hooks.stopRecord();
    this.hooks.spawnDiscItem(x, y + 1, z, discToItemId(disc));
  }
}

export function registerJukeboxBehaviour(registry: BlockBehaviourRegistry, manager: JukeboxManager, hooks: JukeboxHooks): void {
  registry.register(BlockIds.Jukebox, new JukeboxBehaviour(manager, hooks));
}
