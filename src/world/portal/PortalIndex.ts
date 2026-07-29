import { BlockIds } from '../../blocks/BlockId';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';
import type { Chunk } from '../Chunk';

/**
 * Dimension-local index of known portal anchors.
 *
 * Why this exists
 * ---------------
 * Beta's `Teleporter` scans +/-128 blocks horizontally and the full column for
 * an existing portal before it will build a new one. In Beta that is cheap: the
 * server already has those chunks resident. Here it is not — the destination
 * dimension is streamed, and only a small critical ring is guaranteed loaded
 * when a transition resolves. Searching just the resident ring found nothing,
 * so every single trip built a brand-new portal and return travel never linked
 * back to the portal the player originally came from.
 *
 * Loading a 257x257-block region (roughly 289 chunks) purely to answer "is
 * there a portal here?" is not viable in a browser, so the anchors are indexed
 * instead:
 *
 *   portal created / chunk loaded -> register anchor
 *   portal destroyed / chunk edit -> re-scan that chunk and reconcile
 *   dimension activated           -> load the persisted index
 *
 * The index is a CACHE, never the source of truth. A candidate returned from
 * it is always re-verified against live blocks before use, and a stale entry
 * simply falls through to the normal Beta scan. That keeps nearest-portal
 * selection Beta-equivalent while making the query affordable.
 *
 * Anchors are stored per dimension. `PortalIndexStore` handles the namespacing
 * so an Overworld anchor can never satisfy a Nether search.
 */

/** One portal column: the BOTTOM block of the portal, as Beta anchors it. */
export interface PortalAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Serialized index payload. Versioned so the format can evolve. */
interface SerializedPortalIndex {
  readonly version: 1;
  readonly anchors: ReadonlyArray<readonly [number, number, number]>;
}

const INDEX_VERSION = 1;

/** Persistence sub-key; `dimensionScopedKey` namespaces it per dimension. */
export const PORTAL_INDEX_RECORD_KEY = 'portal-index';

function anchorKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function chunkKeyOf(x: number, z: number): string {
  return `${Math.floor(x / CHUNK_SIZE_X)},${Math.floor(z / CHUNK_SIZE_Z)}`;
}

/**
 * Scans one chunk for portal columns and returns their bottom anchors.
 *
 * Only the BOTTOM of each column is recorded, matching Beta's teleporter,
 * which walks down to the lowest portal block before measuring distance.
 */
export function scanChunkForPortals(chunk: Chunk): PortalAnchor[] {
  const anchors: PortalAnchor[] = [];
  const baseX = chunk.chunkX * CHUNK_SIZE_X;
  const baseZ = chunk.chunkZ * CHUNK_SIZE_Z;

  for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let y = 0; y < CHUNK_SIZE_Y; y++) {
        if (chunk.getBlock(lx, y, lz) !== BlockIds.Portal) continue;
        // Only record the bottom of a column: skip if the cell below is also
        // portal, so a 3-tall portal yields one anchor rather than three.
        if (y > 0 && chunk.getBlock(lx, y - 1, lz) === BlockIds.Portal) continue;
        anchors.push({ x: baseX + lx, y, z: baseZ + lz });
      }
    }
  }

  return anchors;
}

/**
 * In-memory portal anchor index for ONE dimension.
 *
 * Anchors are bucketed by chunk so a chunk edit or unload can reconcile just
 * that chunk's entries without touching the rest of the index.
 */
export class PortalIndex {
  private readonly byChunk = new Map<string, Map<string, PortalAnchor>>();
  private dirty = false;

  public register(anchor: PortalAnchor): void {
    const bucketKey = chunkKeyOf(anchor.x, anchor.z);
    let bucket = this.byChunk.get(bucketKey);
    if (bucket === undefined) {
      bucket = new Map();
      this.byChunk.set(bucketKey, bucket);
    }
    const key = anchorKey(anchor.x, anchor.y, anchor.z);
    if (bucket.has(key)) return;
    bucket.set(key, anchor);
    this.dirty = true;
  }

  public unregister(x: number, y: number, z: number): void {
    const bucketKey = chunkKeyOf(x, z);
    const bucket = this.byChunk.get(bucketKey);
    if (bucket === undefined) return;
    if (bucket.delete(anchorKey(x, y, z))) {
      this.dirty = true;
      if (bucket.size === 0) this.byChunk.delete(bucketKey);
    }
  }

  /**
   * Replaces every anchor recorded for one chunk.
   *
   * Called after a chunk is loaded or its portal blocks change, so destroyed
   * portals are dropped and newly built ones picked up in a single pass.
   */
  public reconcileChunk(chunkX: number, chunkZ: number, anchors: readonly PortalAnchor[]): void {
    const bucketKey = `${chunkX},${chunkZ}`;
    const existing = this.byChunk.get(bucketKey);

    if (anchors.length === 0) {
      if (existing !== undefined) {
        this.byChunk.delete(bucketKey);
        this.dirty = true;
      }
      return;
    }

    const replacement = new Map<string, PortalAnchor>();
    for (const anchor of anchors) replacement.set(anchorKey(anchor.x, anchor.y, anchor.z), anchor);

    if (existing !== undefined && existing.size === replacement.size) {
      let identical = true;
      for (const key of replacement.keys()) {
        if (!existing.has(key)) { identical = false; break; }
      }
      if (identical) return;
    }

    this.byChunk.set(bucketKey, replacement);
    this.dirty = true;
  }

  /**
   * Candidate anchors within `radius` blocks of (x, z), NEAREST FIRST by
   * squared 3D distance — the same ordering Beta's raw scan produces.
   *
   * The caller must still verify each candidate against live blocks; this only
   * narrows the search.
   */
  public findNear(x: number, y: number, z: number, radius: number): PortalAnchor[] {
    const found: Array<{ anchor: PortalAnchor; distance: number }> = [];
    const radiusSquared = radius * radius;

    for (const bucket of this.byChunk.values()) {
      for (const anchor of bucket.values()) {
        // Beta measures from the block centre.
        const dx = anchor.x + 0.5 - x;
        const dz = anchor.z + 0.5 - z;
        if (dx * dx + dz * dz > radiusSquared) continue;
        const dy = anchor.y + 0.5 - y;
        found.push({ anchor, distance: dx * dx + dy * dy + dz * dz });
      }
    }

    found.sort((a, b) => a.distance - b.distance);
    return found.map((entry) => entry.anchor);
  }

  public size(): number {
    let total = 0;
    for (const bucket of this.byChunk.values()) total += bucket.size;
    return total;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public clearDirty(): void {
    this.dirty = false;
  }

  public clear(): void {
    this.byChunk.clear();
    this.dirty = false;
  }

  public serialize(): Uint8Array {
    const anchors: Array<readonly [number, number, number]> = [];
    for (const bucket of this.byChunk.values()) {
      for (const anchor of bucket.values()) anchors.push([anchor.x, anchor.y, anchor.z]);
    }
    const payload: SerializedPortalIndex = { version: INDEX_VERSION, anchors };
    return new TextEncoder().encode(JSON.stringify(payload));
  }

  /**
   * Restores anchors from a persisted record.
   *
   * A malformed or future-versioned record is treated as "no index" rather
   * than an error: the index is only a cache, so the worst case is that the
   * teleporter falls back to scanning resident chunks.
   */
  public deserialize(bytes: Uint8Array | undefined): void {
    this.clear();
    if (bytes === undefined || bytes.byteLength === 0) return;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SerializedPortalIndex>;
      if (parsed.version !== INDEX_VERSION || !Array.isArray(parsed.anchors)) return;
      for (const entry of parsed.anchors) {
        if (!Array.isArray(entry) || entry.length !== 3) continue;
        const [x, y, z] = entry;
        if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) continue;
        this.register({ x, y, z });
      }
      this.dirty = false;
    } catch {
      this.clear();
    }
  }
}
