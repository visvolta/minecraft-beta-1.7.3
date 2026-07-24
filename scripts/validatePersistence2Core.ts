/**
 * Stage 1 core primitives validation:
 *   - deadlock-safe compression/decompression at FULL chunk size (>= 64 KB)
 *   - CRC32 correctness + tamper detection
 *   - versioned chunk-record framing round-trip
 *   - fail-loud corruption (magic / version / checksum / length / too-small)
 *   - savedAt is carried as a diagnostic via an injectable clock
 */
import { assert, assertEqual, runSuite, withTimeout, type TestCase } from './persistence2Harness.ts';
import { compressDeflate, decompressDeflate } from '../src/persistence2/codec/Compression.ts';
import { crc32 } from '../src/persistence2/codec/Checksum.ts';
import {
  buildChunkRecord,
  decodeChunkRecord,
  encodeChunkRecord,
  CHUNK_RECORD_FORMAT_VERSION,
  CHUNK_RECORD_HEADER_SIZE,
} from '../src/persistence2/codec/ChunkRecord.ts';
import { RecordCorruptionError } from '../src/persistence2/codec/PersistenceError.ts';

function makeBytes(size: number, seed = 1): Uint8Array {
  const out = new Uint8Array(size);
  let s = seed >>> 0;
  for (let i = 0; i < size; i++) {
    // Mix compressible and incompressible runs so neither path is trivial.
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = i % 4096 < 2048 ? (s & 0xff) : (i & 0xff);
  }
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

function assertThrowsCorruption(fn: () => unknown, label: string): RecordCorruptionError {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof RecordCorruptionError, `${label}: expected RecordCorruptionError, got ${String(thrown)}`);
  return thrown;
}

const tests: TestCase[] = [
  {
    name: 'deflate round-trips full-size (>=64KB) payloads without deadlock',
    run: async () => {
      for (const size of [2000, 16000, 40000, 65536, 200000]) {
        const input = makeBytes(size, size);
        // Each direction is independently guarded so a deadlock fails loudly.
        const compressed = await withTimeout(compressDeflate(input), 5000, `compress ${size}`);
        assert(compressed.byteLength > 0, `compressed output non-empty for ${size}`);
        const decompressed = await withTimeout(decompressDeflate(compressed), 5000, `decompress ${size}`);
        assert(bytesEqual(decompressed, input), `round-trip preserves bytes for ${size}`);
      }
    },
  },
  {
    name: 'deflate round-trips highly-compressible payloads without deadlock',
    run: async () => {
      const input = new Uint8Array(120000); // all zeros — compresses very small
      const compressed = await withTimeout(compressDeflate(input), 5000, 'compress zeros');
      assert(compressed.byteLength < input.byteLength, 'compressible input shrinks');
      const decompressed = await withTimeout(decompressDeflate(compressed), 5000, 'decompress zeros');
      assert(bytesEqual(decompressed, input), 'zeros round-trip');
    },
  },
  {
    name: 'crc32 matches the IEEE check value and detects tampering',
    run: async () => {
      assertEqual(crc32(new Uint8Array([])), 0, 'crc32 of empty input');
      const check = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]); // "123456789"
      assertEqual(crc32(check), 0xcbf43926, 'crc32 IEEE check value');
      const a = makeBytes(1000, 7);
      const b = a.slice();
      b[500] = (b[500]! ^ 0xff) & 0xff;
      assert(crc32(a) !== crc32(b), 'crc32 changes when a byte is flipped');
    },
  },
  {
    name: 'chunk record encode/decode round-trips and carries savedAt (diagnostic)',
    run: async () => {
      const payload = makeBytes(3000, 11);
      const injectedClockValue = 1_234_567_890;
      const record = buildChunkRecord({
        chunkX: -3,
        chunkZ: 17,
        persistenceRevision: 5,
        savedAtMs: injectedClockValue,
        compressedPayload: payload,
      });
      assertEqual(record.checksum, crc32(payload), 'checksum computed over payload');
      assertEqual(record.formatVersion, CHUNK_RECORD_FORMAT_VERSION, 'format version is current');
      const encoded = encodeChunkRecord(record);
      assertEqual(encoded.byteLength, CHUNK_RECORD_HEADER_SIZE + payload.byteLength, 'encoded length');
      const decoded = decodeChunkRecord(encoded, { worldId: 'w', chunkX: -3, chunkZ: 17 });
      assertEqual(decoded.chunkX, -3, 'chunkX round-trips');
      assertEqual(decoded.chunkZ, 17, 'chunkZ round-trips');
      assertEqual(decoded.persistenceRevision, 5, 'revision round-trips');
      assertEqual(decoded.savedAtMs, injectedClockValue, 'savedAt (diagnostic) round-trips from injected clock');
      assert(bytesEqual(decoded.payload, payload), 'payload round-trips');
    },
  },
  {
    name: 'corrupt records fail loud: bad magic',
    run: async () => {
      const encoded = encodeChunkRecord(buildChunkRecord({ chunkX: 0, chunkZ: 0, persistenceRevision: 1, savedAtMs: 0, compressedPayload: makeBytes(100) }));
      encoded[0] = 0x00; // break magic
      const err = assertThrowsCorruption(() => decodeChunkRecord(encoded), 'bad magic');
      assert(err.message.includes('magic'), 'error mentions magic');
    },
  },
  {
    name: 'corrupt records fail loud: unsupported format version',
    run: async () => {
      const encoded = encodeChunkRecord(buildChunkRecord({ chunkX: 0, chunkZ: 0, persistenceRevision: 1, savedAtMs: 0, compressedPayload: makeBytes(100) }));
      const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
      view.setUint16(4, 99, false); // unsupported version
      const err = assertThrowsCorruption(() => decodeChunkRecord(encoded), 'bad version');
      assert(err.message.includes('version'), 'error mentions version');
    },
  },
  {
    name: 'corrupt records fail loud: checksum mismatch on tampered payload',
    run: async () => {
      const encoded = encodeChunkRecord(buildChunkRecord({ chunkX: 2, chunkZ: 3, persistenceRevision: 1, savedAtMs: 0, compressedPayload: makeBytes(500, 5) }));
      encoded[CHUNK_RECORD_HEADER_SIZE + 10] = (encoded[CHUNK_RECORD_HEADER_SIZE + 10]! ^ 0xff) & 0xff;
      const err = assertThrowsCorruption(() => decodeChunkRecord(encoded, { worldId: 'w', chunkX: 2, chunkZ: 3 }), 'checksum');
      assert(err.message.includes('checksum'), 'error mentions checksum');
      assertEqual(err.kind, 'chunk', 'error kind is chunk');
      assertEqual(err.chunkX, 2, 'error carries chunkX');
      assertEqual(err.chunkZ, 3, 'error carries chunkZ');
    },
  },
  {
    name: 'corrupt records fail loud: payload length mismatch (truncated)',
    run: async () => {
      const encoded = encodeChunkRecord(buildChunkRecord({ chunkX: 0, chunkZ: 0, persistenceRevision: 1, savedAtMs: 0, compressedPayload: makeBytes(400) }));
      const truncated = encoded.slice(0, encoded.byteLength - 5);
      assertThrowsCorruption(() => decodeChunkRecord(truncated), 'truncated');
    },
  },
  {
    name: 'corrupt records fail loud: record too small',
    run: async () => {
      assertThrowsCorruption(() => decodeChunkRecord(new Uint8Array(10)), 'too small');
    },
  },
];

await runSuite('validatePersistence2Core', tests);
