/**
 * Versioned, self-describing on-disk record for a single chunk.
 *
 * Binary envelope (big-endian):
 *   u32  magic            "MC17" (0x4D433137)
 *   u16  formatVersion    current = 1
 *   i32  chunkX
 *   i32  chunkZ
 *   u32  persistenceRevision   (drives correctness with executor sequence numbers)
 *   u32  checksum         CRC32 of the compressed payload
 *   f64  savedAtMs        DIAGNOSTIC ONLY — never used for correctness
 *   u32  payloadLength
 *   u8[] payload          deflate-compressed serialized chunk NBT
 *
 * `savedAtMs` is informational; persistence revisions and executor acceptance
 * sequence numbers determine correctness. Callers inject the clock so timestamp
 * behaviour is testable.
 */

import { crc32 } from './Checksum.ts';
import { RecordCorruptionError, type CorruptionStage } from './PersistenceError.ts';

export const CHUNK_RECORD_MAGIC = 0x4d433137; // "MC17"
export const CHUNK_RECORD_FORMAT_VERSION = 1;
export const CHUNK_RECORD_HEADER_SIZE = 34;

export interface ChunkRecord {
  formatVersion: number;
  chunkX: number;
  chunkZ: number;
  persistenceRevision: number;
  checksum: number;
  /** Diagnostic only; not used for correctness. */
  savedAtMs: number;
  /** Deflate-compressed serialized chunk NBT. */
  payload: Uint8Array;
}

/** Caller-supplied hint for richer corruption diagnostics (no stage — the codec determines the stage). */
export interface ChunkDecodeContext {
  worldId: string | undefined;
  chunkX: number | undefined;
  chunkZ: number | undefined;
}

export function encodeChunkRecord(record: ChunkRecord): Uint8Array {
  const bytes = new Uint8Array(CHUNK_RECORD_HEADER_SIZE + record.payload.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, CHUNK_RECORD_MAGIC, false);
  view.setUint16(4, record.formatVersion, false);
  view.setInt32(6, record.chunkX, false);
  view.setInt32(10, record.chunkZ, false);
  view.setUint32(14, record.persistenceRevision, false);
  view.setUint32(18, record.checksum, false);
  view.setFloat64(22, record.savedAtMs, false);
  view.setUint32(30, record.payload.byteLength, false);
  bytes.set(record.payload, CHUNK_RECORD_HEADER_SIZE);
  return bytes;
}

/** Builds a record from an already-compressed payload, computing the checksum. */
export function buildChunkRecord(fields: {
  chunkX: number;
  chunkZ: number;
  persistenceRevision: number;
  savedAtMs: number;
  compressedPayload: Uint8Array;
}): ChunkRecord {
  return {
    formatVersion: CHUNK_RECORD_FORMAT_VERSION,
    chunkX: fields.chunkX,
    chunkZ: fields.chunkZ,
    persistenceRevision: fields.persistenceRevision,
    checksum: crc32(fields.compressedPayload),
    savedAtMs: fields.savedAtMs,
    payload: fields.compressedPayload,
  };
}

function corruption(detail: string, stage: CorruptionStage, record: Partial<ChunkRecord>, context: ChunkDecodeContext | undefined): RecordCorruptionError {
  return new RecordCorruptionError('chunk', detail, {
    worldId: context?.worldId,
    chunkX: record.chunkX ?? context?.chunkX,
    chunkZ: record.chunkZ ?? context?.chunkZ,
    stage,
  });
}

/**
 * Decodes and validates a chunk record. Throws `RecordCorruptionError` (with the
 * failing validation `stage`) on any structural/validation failure. Does NOT
 * validate that (chunkX,chunkZ) match an expected key — the caller does that.
 */
export function decodeChunkRecord(bytes: Uint8Array, context?: ChunkDecodeContext): ChunkRecord {
  if (bytes.byteLength < CHUNK_RECORD_HEADER_SIZE) {
    throw corruption(`record too small (${bytes.byteLength} < ${CHUNK_RECORD_HEADER_SIZE} bytes)`, 'header', {}, context);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, false);
  if (magic !== CHUNK_RECORD_MAGIC) {
    throw corruption(`bad magic 0x${magic.toString(16)}`, 'header', {}, context);
  }
  const formatVersion = view.getUint16(4, false);
  const chunkX = view.getInt32(6, false);
  const chunkZ = view.getInt32(10, false);
  const persistenceRevision = view.getUint32(14, false);
  const checksum = view.getUint32(18, false);
  const savedAtMs = view.getFloat64(22, false);
  const payloadLength = view.getUint32(30, false);

  if (formatVersion !== CHUNK_RECORD_FORMAT_VERSION) {
    throw corruption(
      `unsupported format version ${formatVersion} (current ${CHUNK_RECORD_FORMAT_VERSION})`,
      'version',
      { chunkX, chunkZ },
      context,
    );
  }
  if (bytes.byteLength !== CHUNK_RECORD_HEADER_SIZE + payloadLength) {
    throw corruption(
      `payload length mismatch (header says ${payloadLength}, record has ${bytes.byteLength - CHUNK_RECORD_HEADER_SIZE})`,
      'length',
      { chunkX, chunkZ },
      context,
    );
  }
  const payload = bytes.slice(CHUNK_RECORD_HEADER_SIZE, CHUNK_RECORD_HEADER_SIZE + payloadLength);
  const actual = crc32(payload);
  if (actual !== checksum) {
    throw corruption(
      `checksum mismatch (stored 0x${checksum.toString(16)}, computed 0x${actual.toString(16)})`,
      'checksum',
      { chunkX, chunkZ },
      context,
    );
  }
  return { formatVersion, chunkX, chunkZ, persistenceRevision, checksum, savedAtMs, payload };
}
