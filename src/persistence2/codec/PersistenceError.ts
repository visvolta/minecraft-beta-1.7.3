/**
 * Typed persistence errors for fail-loud handling.
 *
 * `RecordCorruptionError` is thrown when a stored record exists but fails
 * validation. A corrupt record is never silently deleted, overwritten,
 * regenerated, or marked valid; the error propagates to the owning operation.
 * A *missing* record is not corruption — it is reported as `undefined` so
 * terrain may generate.
 *
 * `stage` identifies the validation step that failed, for structured diagnostics
 * (header / version / checksum / length / decompression / schema / coordinate).
 */

export type RecordKind = 'chunk' | 'metadata' | 'player' | 'world';

export type CorruptionStage =
  | 'header'
  | 'version'
  | 'checksum'
  | 'length'
  | 'decompression'
  | 'schema'
  | 'coordinate';

export interface CorruptionContext {
  worldId: string | undefined;
  chunkX: number | undefined;
  chunkZ: number | undefined;
  stage: CorruptionStage;
}

export class RecordCorruptionError extends Error {
  public readonly kind: RecordKind;
  public readonly worldId: string | undefined;
  public readonly chunkX: number | undefined;
  public readonly chunkZ: number | undefined;
  public readonly stage: CorruptionStage;

  public constructor(kind: RecordKind, detail: string, context: CorruptionContext) {
    const where: string[] = [];
    if (context.worldId !== undefined) where.push(`world=${context.worldId}`);
    if (context.chunkX !== undefined && context.chunkZ !== undefined) {
      where.push(`chunk=${context.chunkX},${context.chunkZ}`);
    }
    const suffix = where.length > 0 ? ` (${where.join(', ')})` : '';
    super(`Corrupt ${kind} record [${context.stage}]${suffix}: ${detail}`);
    this.name = 'RecordCorruptionError';
    this.kind = kind;
    this.worldId = context.worldId;
    this.chunkX = context.chunkX;
    this.chunkZ = context.chunkZ;
    this.stage = context.stage;
  }
}

/** A storage-backend I/O failure (open/read/write/delete/flush/close). */
export class BackendError extends Error {
  public readonly innerError: unknown;

  public constructor(message: string, innerError?: unknown) {
    super(message);
    this.name = 'BackendError';
    this.innerError = innerError;
  }
}
