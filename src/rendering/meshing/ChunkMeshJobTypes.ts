import type { BlockId } from '../../blocks/BlockId';
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

export interface ChunkMeshJob {
  readonly type: 'mesh';
  readonly jobId: number;
  readonly targetChunkX: number;
  readonly targetChunkZ: number;
  readonly targetRevision: number;
  readonly chunks: readonly ChunkSnapshotPayload[];
  readonly atlasUvs: readonly AtlasUvPayload[];
}

export interface MeshAttributeBuffers {
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

export interface ChunkMeshResult {
  readonly type: 'meshResult';
  readonly jobId: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly targetRevision: number;
  readonly terrain: MeshAttributeBuffers;
  readonly fluid: MeshAttributeBuffers;
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

export interface WorkerBlockDefinitionPayload {
  readonly id: BlockId;
  readonly name: string;
}
