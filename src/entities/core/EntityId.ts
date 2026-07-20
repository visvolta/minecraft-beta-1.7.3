/**
 * Runtime entity identity helpers.
 *
 * Two distinct identifiers exist, mirroring Beta:
 *  - a monotonically increasing **runtime id** assigned by the EntityManager
 *    when an entity joins the world (Beta's `Entity.entityId` from the static
 *    `nextEntityID` counter). Unique only within a running session.
 *  - an optional **persistent UUID** string used to recognise the same logical
 *    entity across save/load cycles and to de-duplicate loads.
 *
 * The runtime id allocator is intentionally tiny and dependency-free so it can
 * be reused by every entity system without pulling in the manager.
 */

/** Allocates strictly increasing runtime entity ids within a session. */
export class EntityIdAllocator {
  private next = 1;

  /** Returns the next unused id, guaranteeing it is greater than `atLeast`. */
  public allocate(atLeast = 0): number {
    if (atLeast >= this.next) {
      this.next = atLeast + 1;
    }
    const id = this.next;
    this.next += 1;
    return id;
  }

  /** Raises the watermark so a reloaded id is never re-handed-out this session. */
  public reserve(id: number): void {
    if (id >= this.next) {
      this.next = id + 1;
    }
  }

  public get watermark(): number {
    return this.next - 1;
  }
}

const HEX = '0123456789abcdef';

/**
 * Generates a RFC-4122-shaped version-4 UUID string. Uses the platform CSPRNG
 * when available (browser + modern Node), otherwise falls back to Math.random
 * so entity persistence still works in bare validation environments.
 */
export function generateEntityUuid(): string {
  const bytes = new Uint8Array(16);

  const cryptoRef: { getRandomValues?: (b: Uint8Array) => Uint8Array } | undefined =
    typeof globalThis !== 'undefined' ? (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto : undefined;

  if (cryptoRef?.getRandomValues) {
    cryptoRef.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Set the version (4) and variant (10xx) bits per RFC 4122.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  let out = '';
  for (let i = 0; i < 16; i++) {
    const b = bytes[i]!;
    out += HEX[b >> 4]! + HEX[b & 0x0f]!;
    if (i === 3 || i === 5 || i === 7 || i === 9) {
      out += '-';
    }
  }
  return out;
}

/** Encodes a chunk coordinate pair as a stable bucket key. */
export function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

/** Derives the owning chunk coordinates for a world-space X/Z position. */
export function chunkCoordsOf(worldX: number, worldZ: number): { chunkX: number; chunkZ: number } {
  return { chunkX: Math.floor(worldX / 16), chunkZ: Math.floor(worldZ / 16) };
}
