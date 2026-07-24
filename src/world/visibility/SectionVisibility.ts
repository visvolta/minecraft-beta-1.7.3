import * as THREE from 'three';
import type { BlockId } from '../../blocks/BlockId';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { Chunk } from '../Chunk';
import type { ChunkManager } from '../ChunkManager';
import { CHUNK_SECTION_COUNT, CHUNK_SECTION_HEIGHT, CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';
import { classifyBlockPassMask } from '../../rendering/meshing/ChunkPassMask';

const FACE_NEG_X = 0;
const FACE_POS_X = 1;
const FACE_NEG_Y = 2;
const FACE_POS_Y = 3;
const FACE_NEG_Z = 4;
const FACE_POS_Z = 5;
const FACE_COUNT = 6;
const ALL_FACE_MASK = (1 << FACE_COUNT) - 1;

interface SectionVisibilityMeta {
  readonly renderMask: number;
  readonly openFaceMask: number;
  readonly reachableFaceMasks: Uint8Array;
}

interface ChunkVisibilityCache {
  readonly blockRevision: number;
  readonly sections: readonly SectionVisibilityMeta[];
}

export interface SectionVisibilityStats {
  readonly loadedSections: number;
  readonly renderableSections: number;
  readonly emptySections: number;
  readonly frustumVisibleSections: number;
  readonly frustumRejectedSections: number;
  readonly reachableSections: number;
  readonly portalVisibleSections: number;
  readonly portalCulledSections: number;
  readonly frustumVisibleChunks: number;
  readonly portalVisibleChunks: number;
  readonly occlusionCpuMs: number;
}

function sectionKey(chunkX: number, sectionIndex: number, chunkZ: number): string {
  return `${chunkX},${sectionIndex},${chunkZ}`;
}

function isReliableOccluder(blockId: BlockId, registry: BlockRegistry): boolean {
  const definition = registry.getById(blockId);
  return definition !== undefined
    && definition.solid
    && !definition.transparent
    && definition.renderType === 'opaque';
}

function localIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
}

export class SectionVisibilityAnalyzer {
  private readonly cache = new WeakMap<Chunk, ChunkVisibilityCache>();
  private readonly sectionBox = new THREE.Box3();
  private readonly projectionMatrix = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();

  public constructor(
    private readonly chunkManager: ChunkManager,
    private readonly blockRegistry: BlockRegistry,
  ) {}

  public analyze(camera: THREE.PerspectiveCamera): SectionVisibilityStats {
    const start = performance.now();
    this.projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionMatrix);

    const cameraChunkX = Math.floor(camera.position.x / CHUNK_SIZE_X);
    const cameraChunkZ = Math.floor(camera.position.z / CHUNK_SIZE_Z);
    const cameraSectionY = Math.max(0, Math.min(CHUNK_SECTION_COUNT - 1, Math.floor(camera.position.y / CHUNK_SECTION_HEIGHT)));

    const loaded = [] as Array<{ chunk: Chunk; sectionIndex: number; meta: SectionVisibilityMeta; inFrustum: boolean }>;
    let emptySections = 0;
    let renderableSections = 0;
    let frustumVisibleSections = 0;
    const frustumVisibleChunks = new Set<string>();

    for (const chunk of this.chunkManager) {
      const metas = this.getChunkSectionMetadata(chunk);
      for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
        const meta = metas[sectionIndex]!;
        const sectionIsEmpty = chunk.isSectionEmpty(sectionIndex);
        if (sectionIsEmpty) emptySections++;
        const inFrustum = this.intersectsFrustum(chunk.chunkX, sectionIndex, chunk.chunkZ);
        loaded.push({ chunk, sectionIndex, meta, inFrustum });
        if (meta.renderMask !== 0) {
          renderableSections++;
          if (inFrustum) {
            frustumVisibleSections++;
            frustumVisibleChunks.add(`${chunk.chunkX},${chunk.chunkZ}`);
          }
        }
      }
    }

    const fallbackVisibleAll = !this.chunkManager.hasChunk(cameraChunkX, cameraChunkZ);
    const reachableSectionKeys = fallbackVisibleAll
      ? new Set(loaded.map((entry) => sectionKey(entry.chunk.chunkX, entry.sectionIndex, entry.chunk.chunkZ)))
      : this.traverseReachableSections(cameraChunkX, cameraSectionY, cameraChunkZ);

    let portalVisibleSections = 0;
    const portalVisibleChunks = new Set<string>();
    for (const entry of loaded) {
      if (entry.meta.renderMask === 0 || !entry.inFrustum) continue;
      if (!reachableSectionKeys.has(sectionKey(entry.chunk.chunkX, entry.sectionIndex, entry.chunk.chunkZ))) continue;
      portalVisibleSections++;
      portalVisibleChunks.add(`${entry.chunk.chunkX},${entry.chunk.chunkZ}`);
    }

    const frustumRejectedSections = renderableSections - frustumVisibleSections;
    const reachableSections = reachableSectionKeys.size;
    const portalCulledSections = frustumVisibleSections - portalVisibleSections;

    return {
      loadedSections: loaded.length,
      renderableSections,
      emptySections,
      frustumVisibleSections,
      frustumRejectedSections,
      reachableSections,
      portalVisibleSections,
      portalCulledSections,
      frustumVisibleChunks: frustumVisibleChunks.size,
      portalVisibleChunks: portalVisibleChunks.size,
      occlusionCpuMs: performance.now() - start,
    };
  }

  private traverseReachableSections(startChunkX: number, startSectionY: number, startChunkZ: number): Set<string> {
    const reached = new Set<string>();
    const queue: Array<{ chunkX: number; sectionY: number; chunkZ: number }> = [];
    const push = (chunkX: number, sectionY: number, chunkZ: number): void => {
      const key = sectionKey(chunkX, sectionY, chunkZ);
      if (reached.has(key)) return;
      const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
      if (chunk === undefined) return;
      if (sectionY < 0 || sectionY >= CHUNK_SECTION_COUNT) return;
      reached.add(key);
      queue.push({ chunkX, sectionY, chunkZ });
    };

    push(startChunkX, startSectionY, startChunkZ);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const chunk = this.chunkManager.getChunk(current.chunkX, current.chunkZ);
      if (chunk === undefined) continue;
      const meta = this.getChunkSectionMetadata(chunk)[current.sectionY]!;
      for (let face = 0; face < FACE_COUNT; face++) {
        if ((meta.openFaceMask & (1 << face)) === 0) continue;
        let nextChunkX = current.chunkX;
        let nextChunkZ = current.chunkZ;
        let nextSectionY = current.sectionY;
        let oppositeFace = face;
        if (face === FACE_NEG_X) { nextChunkX -= 1; oppositeFace = FACE_POS_X; }
        else if (face === FACE_POS_X) { nextChunkX += 1; oppositeFace = FACE_NEG_X; }
        else if (face === FACE_NEG_Y) { nextSectionY -= 1; oppositeFace = FACE_POS_Y; }
        else if (face === FACE_POS_Y) { nextSectionY += 1; oppositeFace = FACE_NEG_Y; }
        else if (face === FACE_NEG_Z) { nextChunkZ -= 1; oppositeFace = FACE_POS_Z; }
        else if (face === FACE_POS_Z) { nextChunkZ += 1; oppositeFace = FACE_NEG_Z; }

        const nextChunk = this.chunkManager.getChunk(nextChunkX, nextChunkZ);
        if (nextChunk === undefined || nextSectionY < 0 || nextSectionY >= CHUNK_SECTION_COUNT) {
          continue;
        }
        const nextMeta = this.getChunkSectionMetadata(nextChunk)[nextSectionY]!;
        if ((nextMeta.openFaceMask & (1 << oppositeFace)) === 0) {
          continue;
        }
        push(nextChunkX, nextSectionY, nextChunkZ);
      }
    }

    return reached;
  }

  private getChunkSectionMetadata(chunk: Chunk): readonly SectionVisibilityMeta[] {
    const cached = this.cache.get(chunk);
    if (cached !== undefined && cached.blockRevision === chunk.getBlockRevision()) {
      return cached.sections;
    }

    const sections: SectionVisibilityMeta[] = [];
    const blocks = chunk.getBlockDataView();
    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      sections.push(this.buildSectionMeta(blocks, sectionIndex));
    }
    this.cache.set(chunk, { blockRevision: chunk.getBlockRevision(), sections });
    return sections;
  }

  private buildSectionMeta(blocks: Uint8Array, sectionIndex: number): SectionVisibilityMeta {
    let renderMask = 0;
    if (sectionIndex < 0 || sectionIndex >= CHUNK_SECTION_COUNT) {
      return { renderMask, openFaceMask: ALL_FACE_MASK, reachableFaceMasks: new Uint8Array(FACE_COUNT).fill(ALL_FACE_MASK) };
    }

    const traversable = new Uint8Array(CHUNK_SECTION_HEIGHT * CHUNK_SIZE_X * CHUNK_SIZE_Z);
    const faceSeeds: number[][] = [[], [], [], [], [], []];
    const baseY = sectionIndex * CHUNK_SECTION_HEIGHT;
    let traversableCount = 0;

    for (let localY = 0; localY < CHUNK_SECTION_HEIGHT; localY++) {
      const worldY = baseY + localY;
      if (worldY >= CHUNK_SIZE_Y) break;
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const chunkIndex = x + z * CHUNK_SIZE_X + worldY * CHUNK_SIZE_X * CHUNK_SIZE_Z;
          const blockId = blocks[chunkIndex] as BlockId;
          renderMask |= classifyBlockPassMask(blockId, this.blockRegistry);
          const sectionCellIndex = localIndex(x, localY, z);
          if (!isReliableOccluder(blockId, this.blockRegistry)) {
            traversable[sectionCellIndex] = 1;
            traversableCount++;
            if (x === 0) faceSeeds[FACE_NEG_X]!.push(sectionCellIndex);
            if (x === CHUNK_SIZE_X - 1) faceSeeds[FACE_POS_X]!.push(sectionCellIndex);
            if (localY === 0) faceSeeds[FACE_NEG_Y]!.push(sectionCellIndex);
            if (localY === CHUNK_SECTION_HEIGHT - 1) faceSeeds[FACE_POS_Y]!.push(sectionCellIndex);
            if (z === 0) faceSeeds[FACE_NEG_Z]!.push(sectionCellIndex);
            if (z === CHUNK_SIZE_Z - 1) faceSeeds[FACE_POS_Z]!.push(sectionCellIndex);
          }
        }
      }
    }

    if (traversableCount === traversable.length) {
      return {
        renderMask,
        openFaceMask: ALL_FACE_MASK,
        reachableFaceMasks: new Uint8Array(FACE_COUNT).fill(ALL_FACE_MASK),
      };
    }

    let openFaceMask = 0;
    const reachableFaceMasks = new Uint8Array(FACE_COUNT);
    for (let face = 0; face < FACE_COUNT; face++) {
      if (faceSeeds[face]!.length === 0) continue;
      openFaceMask |= 1 << face;
      reachableFaceMasks[face] = this.computeFaceReachability(face, traversable, faceSeeds);
    }

    return { renderMask, openFaceMask, reachableFaceMasks };
  }

  private computeFaceReachability(face: number, traversable: Uint8Array, faceSeeds: readonly number[][]): number {
    const visited = new Uint8Array(traversable.length);
    const queue = [...faceSeeds[face]!];
    let head = 0;
    let reachedMask = 0;

    while (head < queue.length) {
      const index = queue[head++]!;
      if (visited[index] !== 0 || traversable[index] === 0) continue;
      visited[index] = 1;
      const y = Math.floor(index / (CHUNK_SIZE_X * CHUNK_SIZE_Z));
      const rem = index - y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
      const z = Math.floor(rem / CHUNK_SIZE_X);
      const x = rem - z * CHUNK_SIZE_X;
      if (x === 0) reachedMask |= 1 << FACE_NEG_X;
      if (x === CHUNK_SIZE_X - 1) reachedMask |= 1 << FACE_POS_X;
      if (y === 0) reachedMask |= 1 << FACE_NEG_Y;
      if (y === CHUNK_SECTION_HEIGHT - 1) reachedMask |= 1 << FACE_POS_Y;
      if (z === 0) reachedMask |= 1 << FACE_NEG_Z;
      if (z === CHUNK_SIZE_Z - 1) reachedMask |= 1 << FACE_POS_Z;

      if (x > 0) queue.push(localIndex(x - 1, y, z));
      if (x + 1 < CHUNK_SIZE_X) queue.push(localIndex(x + 1, y, z));
      if (y > 0) queue.push(localIndex(x, y - 1, z));
      if (y + 1 < CHUNK_SECTION_HEIGHT) queue.push(localIndex(x, y + 1, z));
      if (z > 0) queue.push(localIndex(x, y, z - 1));
      if (z + 1 < CHUNK_SIZE_Z) queue.push(localIndex(x, y, z + 1));
    }

    return reachedMask;
  }

  private intersectsFrustum(chunkX: number, sectionIndex: number, chunkZ: number): boolean {
    const minX = chunkX * CHUNK_SIZE_X;
    const minY = sectionIndex * CHUNK_SECTION_HEIGHT;
    const minZ = chunkZ * CHUNK_SIZE_Z;
    this.sectionBox.min.set(minX, minY, minZ);
    this.sectionBox.max.set(minX + CHUNK_SIZE_X, minY + CHUNK_SECTION_HEIGHT, minZ + CHUNK_SIZE_Z);
    return this.frustum.intersectsBox(this.sectionBox);
  }
}
