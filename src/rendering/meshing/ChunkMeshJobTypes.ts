import type { AtlasUvRect } from '../../assets/TextureAtlas';

export interface ChunkSnapshotPayload {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly revision: number;
  readonly blocks: ArrayBuffer;
  readonly metadata: ArrayBuffer;
  readonly light: ArrayBuffer;
}

export interface AtlasUvPayload {
  readonly name: string;
  readonly rect: AtlasUvRect;
}

export interface ChunkMeshInitJob {
  readonly type: 'init';
  readonly atlasUvs: readonly AtlasUvPayload[];
  readonly worldSeed: string;
}

export interface ChunkMeshJob {
  readonly type: 'mesh';
  readonly jobId: number;
  readonly targetChunkX: number;
  readonly targetChunkZ: number;
  readonly targetRevision: number;
  readonly chunks: readonly ChunkSnapshotPayload[];
  /** Backward-compatible fallback. Production workers receive this once via ChunkMeshInitJob. */
  readonly atlasUvs?: readonly AtlasUvPayload[];
  /** Backward-compatible fallback. Production workers receive this once via ChunkMeshInitJob. */
  readonly worldSeed?: string;
}

export type ChunkMeshWorkerMessage = ChunkMeshInitJob | ChunkMeshJob;

export interface EmptyMeshAttributeBuffers {
  readonly empty: true;
  readonly vertexCount: 0;
  readonly indexCount: 0;
}

export interface PopulatedMeshAttributeBuffers {
  readonly empty?: false;
  readonly positions: ArrayBuffer;
  readonly normals: ArrayBuffer;
  readonly uvs: ArrayBuffer;
  readonly normalColors: ArrayBuffer;
  readonly debugColors: ArrayBuffer;
  readonly aoColors: ArrayBuffer;
  readonly tintColors: ArrayBuffer;
  readonly skyLightLevels: ArrayBuffer;
  readonly blockLightLevels: ArrayBuffer;
  readonly aoFactorScalars: ArrayBuffer;
  readonly faceBrightness: ArrayBuffer;
  readonly fluidTextureKinds: ArrayBuffer;
  readonly fluidFrameUvs: ArrayBuffer;
  readonly indices: ArrayBuffer;
  readonly vertexCount: number;
  readonly indexCount: number;
}

export type MeshAttributeBuffers = EmptyMeshAttributeBuffers | PopulatedMeshAttributeBuffers;

export interface ChunkMeshResult {
  readonly type: 'meshResult';
  readonly jobId: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly targetRevision: number;
  readonly terrain: MeshAttributeBuffers;
  readonly water: MeshAttributeBuffers;
  readonly lava: MeshAttributeBuffers;
  readonly cutout: MeshAttributeBuffers;
  readonly fire: MeshAttributeBuffers;
  readonly translucent: MeshAttributeBuffers;
  readonly durationMs: number;
}

export interface ChunkMeshWorkerError {
  readonly type: 'meshError';
  readonly jobId: number;
  readonly message: string;
}
