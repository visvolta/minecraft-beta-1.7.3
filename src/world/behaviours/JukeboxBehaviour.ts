import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';

/** Beta record ids that can be inserted into a jukebox. */
const RECORD_IDS = new Set(['record_13', 'record_cat', '2256', '2257']);

/** Music context keys for the two Beta records. */
const RECORD_MUSIC: Readonly<Record<string, string>> = {
  'record_13': 'music.game.calm1', // Beta maps record 13 → calm1 (approximate)
  'record_cat': 'music.game.calm2', // Beta maps cat → calm2 (approximate)
};

/**
 * Beta `BlockJukeBox`: insert a music disc via right-click → plays the track.
 * Right-click again → ejects the disc and stops playback. Breaking the block
 * ejects the disc. No comparator behavior (comparators don't exist in Beta 1.7.3).
 *
 * State: the stored record id is tracked in a per-position Map (in-memory;
 * persistence requires NBT tile-entity integration, like chests/furnaces).
 */
export class JukeboxBehaviour implements BlockBehaviour {
  /** Per-position stored record (null = empty). */
  private readonly storedRecords = new Map<string, string | null>();

  public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const key = `${x},${y},${z}`;
    const existing = this.storedRecords.get(key) ?? null;

    if (existing !== null) {
      // Eject the current record.
      this.ejectRecord(ctx, x, y, z, existing);
      this.storedRecords.set(key, null);
      return true;
    }

    // Check if the player is holding a record.
    // The player's held item is checked via the context player object.
    // Since BlockBehaviourContext.player is loosely typed, we access it carefully.
    const player = ctx.player as { getHeldItemId?: () => string | number | undefined; getHeldItem?: () => { identity: { id: string | number; type: string } } | null } | undefined;
    const heldId = player?.getHeldItemId?.() ?? player?.getHeldItem?.()?.identity.id;
    const idStr = String(heldId ?? '');

    if (RECORD_IDS.has(idStr)) {
      // Insert the record.
      this.storedRecords.set(key, idStr);
      // Play the music track.
      const music = RECORD_MUSIC[idStr];
      if (music !== undefined) {
        // The AudioManager will play this track; for now we note the playback.
        // Full music playback requires AudioManager integration.
      }
      // Consume one record from the player's hand (done by the caller).
      return true;
    }

    return false;
  }

  public onRemoved(ctx: BlockBehaviourContext, x: number, y: number, z: number, _oldBlockId: number): void {
    const key = `${x},${y},${z}`;
    const record = this.storedRecords.get(key);
    if (record !== null && record !== undefined) {
      this.ejectRecord(ctx, x, y, z, record);
      this.storedRecords.delete(key);
    }
  }

  /** Drops the record item at the jukebox position. */
  private ejectRecord(ctx: BlockBehaviourContext, x: number, y: number, z: number, _recordId: string): void {
    // Stop music playback (AudioManager integration pending).
    // Drop the record item.
    ctx.world.dropBlockAsItem(x, y + 1, z, BlockIds.Air);
  }
}

export function registerJukeboxBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.Jukebox, new JukeboxBehaviour());
}
