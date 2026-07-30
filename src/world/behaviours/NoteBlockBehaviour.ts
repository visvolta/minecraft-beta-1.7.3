import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { NeighbourUpdateEvent } from '../updates/BlockMutation';

/** Beta note value range (0-24, 2 octaves). */
const MAX_NOTE = 25;

/**
 * Beta `BlockNote`: right-click cycles the note (metadata 0-24), redstone
 * rising-edge triggers playback, and the instrument is chosen from the block
 * below. Pitch = `2^((note - 12) / 12)`.
 *
 * NOTE: authentic instrument sounds (`note.harp`, `note.bass`, `note.bd`,
 * `note.snare`, `note.hat`) are not yet present. The logic (pitch, instrument,
 * trigger) is complete; a `click` sound plays as a fallback until the assets
 * are provided and mapped in `AudioManifest.ts` + `AudioManager.mapLegacy`.
 */
export class NoteBlockBehaviour implements BlockBehaviour {
  public readonly requiresNeighbourReconciliation = true;
  /** Per-position rising-edge power tracking (not persisted). */
  private readonly poweredSet = new Set<string>();

  public onInteract(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    const meta = ctx.world.getBlockMetadata(x, y, z);
    ctx.world.setBlockMetadataWithNotify(x, y, z, (meta + 1) % MAX_NOTE);
    this.playNote(ctx, x, y, z);
    return true;
  }

  public neighborChanged(
    ctx: BlockBehaviourContext, x: number, y: number, z: number,
    _sx: number, _sy: number, _sz: number, _event?: NeighbourUpdateEvent,
  ): void {
    const key = `${x},${y},${z}`;
    const powered = (ctx.power?.isBlockIndirectlyPowered({ x, y, z }) ?? false);
    const wasPowered = this.poweredSet.has(key);
    if (powered && !wasPowered) {
      this.playNote(ctx, x, y, z);
      this.poweredSet.add(key);
    } else if (!powered && wasPowered) {
      this.poweredSet.delete(key);
    }
  }

  private playNote(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const note = ctx.world.getBlockMetadata(x, y, z) & 0x1F;
    const pitch = Math.pow(2, (note - 12) / 12);
    // Determine instrument from block below.
    const instrument = this.getInstrumentFromBlockBelow(ctx, x, y, z);
    void instrument;
    // Fallback: 'click' sound at the note's pitch (until note assets are added).
    ctx.playBlockSound?.('click', x + 0.5, y + 0.5, z + 0.5, pitch, 0.3);
  }

  private getInstrumentFromBlockBelow(ctx: BlockBehaviourContext, x: number, y: number, z: number): string {
    const belowId = ctx.world.getBlock(x, y - 1, z);
    if (this.isWoodBlock(belowId)) return 'note.bass';
    if (belowId === BlockIds.Sand || belowId === BlockIds.SandStone || belowId === BlockIds.Gravel) return 'note.snare';
    if (belowId === BlockIds.Glass) return 'note.hat';
    if (this.isStoneBlock(belowId)) return 'note.bd';
    return 'note.harp';
  }

  private isWoodBlock(id: number): boolean {
    return id === BlockIds.Planks || id === BlockIds.Log || id === BlockIds.SpruceLog || id === BlockIds.BirchLog
      || id === BlockIds.Bookshelf || id === BlockIds.Chest || id === BlockIds.CraftingTable
      || id === BlockIds.Fence || id === BlockIds.WoodStairs || id === BlockIds.WoodDoor || id === BlockIds.NoteBlock;
  }

  private isStoneBlock(id: number): boolean {
    return id === BlockIds.Stone || id === BlockIds.Cobblestone || id === BlockIds.MossyCobblestone
      || id === BlockIds.SandStone || id === BlockIds.BrickBlock || id === BlockIds.CobblestoneStairs
      || id === BlockIds.Bedrock || id === BlockIds.Obsidian || id === BlockIds.Netherrack
      || id === BlockIds.IronBlock || id === BlockIds.GoldBlock || id === BlockIds.DiamondBlock || id === BlockIds.LapisBlock;
  }
}

export function registerNoteBlockBehaviour(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.NoteBlock, new NoteBlockBehaviour());
}
