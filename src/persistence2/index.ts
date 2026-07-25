/**
 * Public surface of the replacement persistence system (Stage 1, isolated —
 * not wired into production gameplay).
 */

export { WorldPersistenceService, WRITE_PRIORITY_BACKGROUND, WRITE_PRIORITY_FORCED } from './WorldPersistenceService';
export type {
  WorldPersistenceServiceOptions,
  WorldPersistenceStats,
  ServiceDiagnostics,
  PersistenceErrorInfo,
  PersistenceEntityHooks,
} from './WorldPersistenceService.ts';

export type { StorageBackend, WorldSummary } from './backend/StorageBackend.ts';
export { chunkRecordKey, worldRecordKey } from './backend/StorageBackend.ts';
export { MemoryStorageBackend } from './backend/MemoryStorageBackend.ts';
export type { FailureInjector, MemoryOp } from './backend/MemoryStorageBackend.ts';
export { IdbStorageBackend, DEFAULT_IDB_DB_NAME, IDB_DB_VERSION } from './backend/IdbStorageBackend.ts';
export type { IdbStorageBackendOptions } from './backend/IdbStorageBackend.ts';

export { PrioritySerialExecutor } from './exec/PrioritySerialExecutor.ts';
export type { ExecutorDiagnostics } from './exec/PrioritySerialExecutor.ts';
export { BoundedExecutor } from './exec/BoundedExecutor.ts';

export { compressDeflate, decompressDeflate } from './codec/Compression.ts';
export { crc32 } from './codec/Checksum.ts';
export {
  buildChunkRecord,
  decodeChunkRecord,
  encodeChunkRecord,
  CHUNK_RECORD_FORMAT_VERSION,
  CHUNK_RECORD_HEADER_SIZE,
  CHUNK_RECORD_MAGIC,
} from './codec/ChunkRecord.ts';
export type { ChunkRecord } from './codec/ChunkRecord.ts';
export { RecordCorruptionError, BackendError } from './codec/PersistenceError.ts';
export type { RecordKind, CorruptionContext, CorruptionStage } from './codec/PersistenceError.ts';
export type { ChunkDecodeContext } from './codec/ChunkRecord.ts';
