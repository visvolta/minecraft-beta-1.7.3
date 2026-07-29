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
  readonly uvs: ArrayBuffer;
  readonly tintColors: ArrayBuffer;
  /** Normalized uint8x4: skylight, blockR, blockG, blockB (each 0..15 -> 0..1). */
  readonly packedLight: ArrayBuffer;
  /** Normalized uint8x2: ambient occlusion, face brightness (each 0..1). */
  readonly surfaceShade: ArrayBuffer;
  /** Fluid/fire passes only; zero-length for the general layout. */
  readonly fluidTextureKinds: ArrayBuffer;
  readonly fluidFrameUvs: ArrayBuffer;
  readonly indices: ArrayBuffer;
  readonly indexType: 'uint16' | 'uint32';
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
  readonly leaves: MeshAttributeBuffers;
  readonly fire: MeshAttributeBuffers;
  readonly translucent: MeshAttributeBuffers;
  readonly portal: MeshAttributeBuffers;
  readonly durationMs: number;
  readonly voxelVisits?: number;
}

export interface ChunkMeshWorkerError {
  readonly type: 'meshError';
  readonly jobId: number;
  readonly message: string;
}
