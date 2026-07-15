import * as THREE from 'three';
import type { BlockId } from '../blocks/BlockId';
import { BlockIds } from '../blocks/BlockId';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { DigitKey } from '../input/Input';
import type { Input } from '../input/Input';
import { AABB } from '../physics/AABB';
import type { Player } from './Player';
import type { ChunkManager } from '../world/ChunkManager';
import { AIR_BLOCK_ID, CHUNK_SIZE_Y } from '../world/chunkConstants';
import type { RaycastHit } from '../world/Raycaster';
import { Raycaster } from '../world/Raycaster';
import { getBoundaryNeighbourChunks, worldToChunkLocal } from '../world/worldToChunkCoords';
import type { LightEngine } from '../world/generation/lighting/LightEngine';

/** Maximum block interaction reach, in blocks. */
export const INTERACTION_REACH = 5;

/**
 * Simple digit-key -> block mapping for this stage (no hotbar UI yet).
 * Slot 6 has no block yet; pressing it is a harmless no-op.
 */
const DIGIT_KEY_BLOCKS: Record<DigitKey, BlockId | undefined> = {
  '1': BlockIds.Stone,
  '2': BlockIds.Grass,
  '3': BlockIds.Dirt,
  '4': BlockIds.Cobblestone,
  '5': BlockIds.Bedrock,
  '6': undefined,
};

/**
 * Drives block targeting (via the Raycaster), breaking, placing, and the
 * currently selected block. Does not render anything or own chunk/block
 * data — it only reads the BlockRegistry and edits chunks through
 * ChunkManager, matching how PlayerPhysics and ChunkMesher already work.
 */
export class InteractionController {
  private readonly input: Input;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly player: Player;
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly raycaster: Raycaster;
  private readonly lightEngine: LightEngine;

  private readonly lookDirection = new THREE.Vector3();

  private selectedBlockId: BlockId = BlockIds.Stone;
  private currentHit: RaycastHit | undefined;

  public constructor(
    input: Input,
    camera: THREE.PerspectiveCamera,
    player: Player,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    lightEngine: LightEngine,
  ) {
    this.input = input;
    this.camera = camera;
    this.player = player;
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
    this.raycaster = new Raycaster(chunkManager, blockRegistry);
    this.lightEngine = lightEngine;
  }

  /** Currently targeted block, if any (for BlockHighlight to render). */
  public getCurrentHit(): RaycastHit | undefined {
    return this.currentHit;
  }

  public getSelectedBlockId(): BlockId {
    return this.selectedBlockId;
  }

  /**
   * Re-casts the ray from the player's eye, then applies any break/place
   * input for this frame. Intended to run once per frame, after chunk
   * streaming (so newly loaded chunks are visible to the raycast) and
   * before dirty chunk meshes are rebuilt (so edits this frame are picked
   * up in the same frame's rebuild pass).
   */
  public update(): void {
    this.updateSelectedBlock();

    this.camera.getWorldDirection(this.lookDirection);

    this.currentHit = this.raycaster.cast(
      { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      { x: this.lookDirection.x, y: this.lookDirection.y, z: this.lookDirection.z },
      INTERACTION_REACH,
    );

    if (this.currentHit === undefined) {
      return;
    }

    if (this.input.isMouseButtonJustPressed('left')) {
      this.breakBlock(this.currentHit);
    } else if (this.input.isMouseButtonJustPressed('right')) {
      this.placeBlock(this.currentHit);
    }
  }

  private updateSelectedBlock(): void {
    for (const key of Object.keys(DIGIT_KEY_BLOCKS) as DigitKey[]) {
      if (!this.input.isDigitKeyJustPressed(key)) {
        continue;
      }

      const blockId = DIGIT_KEY_BLOCKS[key];
      if (blockId !== undefined) {
        this.selectedBlockId = blockId;
      }
    }
  }

  /** Replaces the targeted block with Air. Air itself is never a valid hit. */
  private breakBlock(hit: RaycastHit): void {
    this.setBlock(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z, AIR_BLOCK_ID);
  }

  /** Places the selected block adjacent to the hit face, if the position is valid. */
  private placeBlock(hit: RaycastHit): void {
    const targetX = hit.blockPos.x + hit.face.x;
    const targetY = hit.blockPos.y + hit.face.y;
    const targetZ = hit.blockPos.z + hit.face.z;

    if (targetY < 0 || targetY >= CHUNK_SIZE_Y) {
      return;
    }

    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(targetX, targetZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);

    if (chunk === undefined) {
      // Don't generate new chunks as a side effect of placing; only place
      // into already-loaded world, consistent with the raycast itself
      // only ever hitting loaded blocks.
      return;
    }

    const existingBlockId = chunk.getBlock(localX, targetY, localZ);
    const existingDefinition = this.blockRegistry.getById(existingBlockId);

    if (existingDefinition === undefined || !existingDefinition.replaceable) {
      return;
    }

    const targetBoxAABB = new AABB(targetX, targetY, targetZ, targetX + 1, targetY + 1, targetZ + 1);

    if (targetBoxAABB.intersects(this.player.getAABB())) {
      return;
    }

    this.setBlock(targetX, targetY, targetZ, this.selectedBlockId);
  }

  /**
   * Writes a block at world coordinates, marking its chunk dirty and any
   * orthogonal neighbour chunks whose meshes could show a seam (only
   * relevant when the edited block sits on a chunk boundary).
   */
  private setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId): void {
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);

    if (chunk === undefined) {
      return;
    }

    chunk.setBlock(localX, worldY, localZ, blockId);
    chunk.recomputeHeightmap();

    // Trigger local lighting recalculation
    this.lightEngine.handleBlockEdit(worldX, worldY, worldZ);

    for (const neighbour of getBoundaryNeighbourChunks(chunkX, chunkZ, localX, localZ)) {
      this.chunkManager.getChunk(neighbour.chunkX, neighbour.chunkZ)?.markDirty();
    }
  }
}
