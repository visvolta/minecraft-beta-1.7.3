import * as THREE from 'three';
import type { MeshAttributeBuffers, PopulatedMeshAttributeBuffers } from './ChunkMeshJobTypes';

/**
 * The single source of truth for the chunk-mesh worker wire format.
 *
 * Extraction (worker side) and reconstruction (main-thread side) MUST agree on
 * the exact attribute set. Keeping both here means a new vertex attribute can
 * only be added once — to the mesher, to this pair of functions, and to the
 * {@link PopulatedMeshAttributeBuffers} interface together — instead of being
 * silently dropped by one side, which is what made terrain render black when
 * `surfaceShade` was introduced for coloured lighting.
 *
 * Attribute layout (mirrors {@link ChunkMesher} / the chunk shader):
 *   position        float32 x3
 *   uv              float32 x2
 *   tintColor       float32 x3
 *   packedLight     uint8   x4 (normalized) — skylight, blockR, blockG, blockB
 *   surfaceShade    uint8   x2 (normalized) — ambient occlusion, face brightness
 *   fluidTextureKind float32 x1   (fluid/fire passes only)
 *   fluidFrameUv    float32 x2   (fluid/fire passes only)
 */

function ownArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength) {
    return view.buffer as ArrayBuffer;
  }
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

function attributeBuffer(geometry: THREE.BufferGeometry, name: string): ArrayBuffer {
  const attribute = geometry.getAttribute(name);
  if (attribute === undefined) {
    return new Float32Array().buffer;
  }
  return ownArrayBuffer(attribute.array as ArrayBufferView);
}

export function createEmptyMeshAttributeBuffers(): MeshAttributeBuffers {
  return { empty: true, vertexCount: 0, indexCount: 0 };
}

export function isPopulatedMeshAttributeBuffers(
  buffers: MeshAttributeBuffers,
): buffers is PopulatedMeshAttributeBuffers {
  return buffers.empty !== true;
}

/**
 * Flattens a mesher-produced geometry into owned, transferable ArrayBuffers.
 * Used by the meshing worker; one buffer per attribute so each can be moved
 * (transferred) to the main thread without copying.
 */
export function extractGeometryBuffers(geometry: THREE.BufferGeometry): MeshAttributeBuffers {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  const vertexCount = position?.count ?? 0;
  const indexCount = index?.count ?? 0;
  if (vertexCount === 0 || indexCount === 0) return createEmptyMeshAttributeBuffers();
  return {
    positions: attributeBuffer(geometry, 'position'),
    uvs: attributeBuffer(geometry, 'uv'),
    tintColors: attributeBuffer(geometry, 'tintColor'),
    packedLight: attributeBuffer(geometry, 'packedLight'),
    surfaceShade: attributeBuffer(geometry, 'surfaceShade'),
    fluidTextureKinds: attributeBuffer(geometry, 'fluidTextureKind'),
    fluidFrameUvs: attributeBuffer(geometry, 'fluidFrameUv'),
    indices: index === null ? new Uint32Array().buffer : ownArrayBuffer(index.array as ArrayBufferView),
    indexType: index !== null && index.array instanceof Uint16Array ? 'uint16' : 'uint32',
    vertexCount,
    indexCount,
  };
}

/**
 * The ArrayBuffers a populated pass hands to `postMessage` for zero-copy
 * transfer. Listing them here (next to the extraction that produces them)
 * guarantees the transfer list can never omit an attribute that extraction
 * produced — an omission would silently fall back to structured-clone copying,
 * which works but is exactly the kind of silent drift this module exists to
 * prevent.
 */
export function transferListForBuffers(buffers: PopulatedMeshAttributeBuffers): Transferable[] {
  return [
    buffers.positions,
    buffers.uvs,
    buffers.tintColors,
    buffers.packedLight,
    buffers.surfaceShade,
    buffers.fluidTextureKinds,
    buffers.fluidFrameUvs,
    buffers.indices,
  ];
}

/**
 * Reconstructs a renderable geometry from transferred buffers. The main thread
 * adopts the ArrayBuffers without copying; ownership moves to the geometry.
 *
 * Every attribute the shader reads MUST be reconstructed here. A missing
 * attribute is not an error in three.js — WebGL substitutes the generic vertex
 * attribute (0,0,0,1) — which is why dropping `surfaceShade` here made every
 * face render at AO×faceBrightness = 0×0, i.e. pure black.
 */
export function geometryFromBuffers(buffers: MeshAttributeBuffers, fluidLayout: boolean): THREE.BufferGeometry {
  if (!isPopulatedMeshAttributeBuffers(buffers)) return emptyGeometryFromBuffers(fluidLayout);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffers.positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buffers.uvs), 2));
  geometry.setAttribute('tintColor', new THREE.BufferAttribute(new Float32Array(buffers.tintColors), 3));
  geometry.setAttribute('packedLight', new THREE.BufferAttribute(new Uint8Array(buffers.packedLight), 4, true));
  geometry.setAttribute('surfaceShade', new THREE.BufferAttribute(new Uint8Array(buffers.surfaceShade), 2, true));
  if (fluidLayout) {
    geometry.setAttribute('fluidTextureKind', new THREE.BufferAttribute(new Float32Array(buffers.fluidTextureKinds), 1));
    geometry.setAttribute('fluidFrameUv', new THREE.BufferAttribute(new Float32Array(buffers.fluidFrameUvs), 2));
  }
  geometry.setIndex(new THREE.BufferAttribute(
    buffers.indexType === 'uint16' ? new Uint16Array(buffers.indices) : new Uint32Array(buffers.indices),
    1,
  ));
  return geometry;
}

/** Empty geometry for a pass that produced no vertices, with a layout matching the pass. */
export function emptyGeometryFromBuffers(fluidLayout: boolean): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(), 2));
  geometry.setAttribute('tintColor', new THREE.Float32BufferAttribute(new Float32Array(), 3));
  geometry.setAttribute('packedLight', new THREE.Uint8BufferAttribute(new Uint8Array(), 4, true));
  geometry.setAttribute('surfaceShade', new THREE.Uint8BufferAttribute(new Uint8Array(), 2, true));
  if (fluidLayout) {
    geometry.setAttribute('fluidTextureKind', new THREE.Float32BufferAttribute(new Float32Array(), 1));
    geometry.setAttribute('fluidFrameUv', new THREE.Float32BufferAttribute(new Float32Array(), 2));
  }
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(), 1));
  return geometry;
}
