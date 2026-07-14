import * as THREE from 'three';
import type { BlockId } from '../blocks/BlockId';
import { BlockIds } from '../blocks/BlockId';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { Chunk } from '../world/Chunk';
import type { ChunkManager } from '../world/ChunkManager';
import {
  AIR_BLOCK_ID,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
} from '../world/chunkConstants';

/** Temporary solid colours until textures arrive. */
const BLOCK_COLORS: Record<number, readonly [number, number, number]> = {
  [BlockIds.Stone]: [0.5, 0.5, 0.5],
  [BlockIds.Grass]: [0.36, 0.61, 0.24],
  [BlockIds.Dirt]: [0.55, 0.35, 0.17],
  [BlockIds.Cobblestone]: [0.42, 0.42, 0.42],
  [BlockIds.Bedrock]: [0.18, 0.18, 0.18],
};

const DEFAULT_COLOR: readonly [number, number, number] = [1, 0, 1];

/** Face: axis normal + four local corners (CCW when viewed from outside). */
interface FaceDef {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly corners: ReadonlyArray<readonly [number, number, number]>;
}

const FACES: readonly FaceDef[] = [
  // +X (east)
  {
    nx: 1,
    ny: 0,
    nz: 0,
    dx: 1,
    dy: 0,
    dz: 0,
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  // -X (west)
  {
    nx: -1,
    ny: 0,
    nz: 0,
    dx: -1,
    dy: 0,
    dz: 0,
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  // +Y (up)
  {
    nx: 0,
    ny: 1,
    nz: 0,
    dx: 0,
    dy: 1,
    dz: 0,
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  // -Y (down)
  {
    nx: 0,
    ny: -1,
    nz: 0,
    dx: 0,
    dy: -1,
    dz: 0,
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  // +Z (south)
  {
    nx: 0,
    ny: 0,
    nz: 1,
    dx: 0,
    dy: 0,
    dz: 1,
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  // -Z (north)
  {
    nx: 0,
    ny: 0,
    nz: -1,
    dx: 0,
    dy: 0,
    dz: -1,
    corners: [
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ],
  },
];

/**
 * Builds culled face geometry for one chunk.
 * Missing neighbour chunks are treated as Air.
 */
export class ChunkMesher {
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;

  public constructor(chunkManager: ChunkManager, blockRegistry: BlockRegistry) {
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
  }

  public build(chunk: Chunk): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);

          if (blockId === AIR_BLOCK_ID || !this.isSolidOpaque(blockId)) {
            continue;
          }

          const color = BLOCK_COLORS[blockId] ?? DEFAULT_COLOR;

          for (const face of FACES) {
            const neighbourId = this.getNeighbourBlock(
              chunk,
              x + face.dx,
              y + face.dy,
              z + face.dz,
            );

            if (this.hidesFace(neighbourId)) {
              continue;
            }

            const vertexOffset = positions.length / 3;

            for (const [cx, cy, cz] of face.corners) {
              positions.push(x + cx, y + cy, z + cz);
              normals.push(face.nx, face.ny, face.nz);
              colors.push(color[0], color[1], color[2]);
            }

            indices.push(
              vertexOffset,
              vertexOffset + 1,
              vertexOffset + 2,
              vertexOffset,
              vertexOffset + 2,
              vertexOffset + 3,
            );
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3),
    );
    geometry.setIndex(indices);

    return geometry;
  }

  private getNeighbourBlock(
    chunk: Chunk,
    localX: number,
    localY: number,
    localZ: number,
  ): BlockId {
    if (localY < 0 || localY >= CHUNK_SIZE_Y) {
      return AIR_BLOCK_ID;
    }

    if (chunk.isInBounds(localX, localY, localZ)) {
      return chunk.getBlock(localX, localY, localZ);
    }

    let chunkX = chunk.chunkX;
    let chunkZ = chunk.chunkZ;
    let x = localX;
    let z = localZ;

    if (x < 0) {
      chunkX -= 1;
      x += CHUNK_SIZE_X;
    } else if (x >= CHUNK_SIZE_X) {
      chunkX += 1;
      x -= CHUNK_SIZE_X;
    }

    if (z < 0) {
      chunkZ -= 1;
      z += CHUNK_SIZE_Z;
    } else if (z >= CHUNK_SIZE_Z) {
      chunkZ += 1;
      z -= CHUNK_SIZE_Z;
    }

    const neighbour = this.chunkManager.getChunk(chunkX, chunkZ);
    if (neighbour === undefined) {
      return AIR_BLOCK_ID;
    }

    return neighbour.getBlock(x, localY, z);
  }

  private hidesFace(blockId: BlockId): boolean {
    if (blockId === AIR_BLOCK_ID) {
      return false;
    }

    return this.isSolidOpaque(blockId);
  }

  private isSolidOpaque(blockId: BlockId): boolean {
    const definition = this.blockRegistry.getById(blockId);
    if (definition === undefined) {
      return false;
    }

    return definition.solid && !definition.transparent;
  }
}
