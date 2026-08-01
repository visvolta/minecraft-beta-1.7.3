import { DIMENSION_OVERWORLD, type DimensionId } from '../world/dimension/DimensionId';

/**
 * The twelve discs supported by the Jukebox. The first two (`13`, `cat`) are
 * authentic Beta 1.7.3; the remaining ten are an intentional extension
 * (documented in the Wave 5 report).
 */
export const JUKEBOX_DISCS: readonly string[] = [
  '13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', '11', 'wait',
];

/** Maps a disc's canonical name to the item id a player holds (e.g. `record_cat`). */
export function discToItemId(disc: string): string {
  return `record_${disc}`;
}

/** Maps a held item id (e.g. `record_cat`) or numeric id string to a disc name. */
export function itemIdToDisc(itemId: string): string | undefined {
  const name = itemId.replace(/^record_/, '');
  return JUKEBOX_DISCS.includes(name) ? name : undefined;
}

/** Serialized jukebox record for persistence. */
export interface SerializedJukeboxRecord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly dimension: number;
  readonly disc: string;
}

/**
 * Per-dimension storage of inserted jukebox discs.
 *
 * Follows the chest/furnace block-entity pattern: records are keyed and
 * namespaced by dimension, serialized to a list, and merged into world
 * metadata on save. This deliberately avoids the previous global per-position
 * `Map` so records persist, survive chunk unload/reload, and stay correct
 * across dimensions.
 */
export class JukeboxManager {
  private readonly records = new Map<string, string>();
  private dimension = DIMENSION_OVERWORLD;

  public setDimension(dimension: DimensionId): void {
    this.dimension = dimension;
  }

  public getDimension(): DimensionId {
    return this.dimension;
  }

  private key(x: number, y: number, z: number): string {
    return `${this.dimension}:${x},${y},${z}`;
  }

  /** Disc name inserted at a position, or null if empty. */
  public getDisc(x: number, y: number, z: number): string | null {
    return this.records.get(this.key(x, y, z)) ?? null;
  }

  public hasDisc(x: number, y: number, z: number): boolean {
    return this.records.has(this.key(x, y, z));
  }

  /** Inserts a disc. Returns false if one is already present. */
  public insert(x: number, y: number, z: number, disc: string): boolean {
    const key = this.key(x, y, z);
    if (this.records.has(key)) return false;
    this.records.set(key, disc);
    return true;
  }

  /** Removes and returns the disc at a position, or null if empty. */
  public remove(x: number, y: number, z: number): string | null {
    const key = this.key(x, y, z);
    const disc = this.records.get(key);
    this.records.delete(key);
    return disc ?? null;
  }

  public serialize(): SerializedJukeboxRecord[] {
    const list: SerializedJukeboxRecord[] = [];
    for (const [key, disc] of this.records) {
      const coords = key.split(':')[1]!.split(',').map((v) => parseInt(v, 10));
      list.push({ x: coords[0] ?? 0, y: coords[1] ?? 0, z: coords[2] ?? 0, dimension: this.dimension, disc });
    }
    return list;
  }

  public deserialize(data?: SerializedJukeboxRecord[]): void {
    this.records.clear();
    if (!data) return;
    for (const d of data) {
      if (Number.isInteger(d.dimension) && (d.dimension as number) !== this.dimension) continue;
      if (!JUKEBOX_DISCS.includes(d.disc)) continue;
      this.records.set(this.key(d.x, d.y, d.z), d.disc);
    }
  }

  public serializeForDimension(): { readonly dimension: DimensionId; readonly records: SerializedJukeboxRecord[] } {
    return { dimension: this.dimension, records: this.serialize() };
  }
}
