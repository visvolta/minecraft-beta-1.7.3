import * as THREE from 'three';
import type { BlockId } from '../blocks/BlockId';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { DigitKey } from '../input/Input';
import type { Input } from '../input/Input';
import { AABB } from '../physics/AABB';
import type { Player } from './Player';
import type { ChunkManager } from '../world/ChunkManager';
import { CHUNK_SIZE_Y } from '../world/chunkConstants';
import type { RaycastHit } from '../world/Raycaster';
import { Raycaster } from '../world/Raycaster';
import { worldToChunkLocal } from '../world/worldToChunkCoords';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';
import { BreakingController } from './BreakingController';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import { Inventory } from '../inventory/Inventory';

/** Maximum block interaction reach, in blocks. */
export const INTERACTION_REACH = 4.75;

export class InteractionController {
  private readonly input: Input;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly player: Player;
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly raycaster: Raycaster;
  private readonly blockUpdateWorld: BlockUpdateWorld;
  public readonly breakingController: BreakingController;
  public readonly inventory: Inventory;

  private readonly lookDirection = new THREE.Vector3();

  private selectedSlotIndex = 0; // 0 to 8 representing the selected hotbar slot
  private currentHit: RaycastHit | undefined;

  public constructor(
    input: Input,
    camera: THREE.PerspectiveCamera,
    player: Player,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    blockUpdateWorld: BlockUpdateWorld,
    itemEntityManager: ItemEntityManager,
    inventory: Inventory,
  ) {
    this.input = input;
    this.camera = camera;
    this.player = player;
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
    this.blockUpdateWorld = blockUpdateWorld;
    this.inventory = inventory;
    this.raycaster = new Raycaster(chunkManager, blockRegistry);
    this.breakingController = new BreakingController(player, chunkManager, blockRegistry, blockUpdateWorld, itemEntityManager);

    // Listen for mouse wheel to change hotbar slot index with immediate snap
    window.addEventListener('wheel', (event) => {
      // Only process scroll if pointer is locked (playing)
      if (this.input.isPointerLocked()) {
        const change = Math.sign(event.deltaY);
        this.selectedSlotIndex = (this.selectedSlotIndex + change + 9) % 9;
      }
    });
  }

  /** Currently targeted block, if any (for BlockHighlight to render). */
  public getCurrentHit(): RaycastHit | undefined {
    return this.currentHit;
  }

  public getSelectedSlotIndex(): number {
    return this.selectedSlotIndex;
  }

  public setSelectedSlotIndex(slotIndex: number): void {
    if (slotIndex >= 0 && slotIndex < 9) {
      this.selectedSlotIndex = slotIndex;
    }
  }

  /**
   * Resolves the active held block ID from the selected hotbar slot in the inventory.
   */
  public getSelectedBlockId(): BlockId {
    const stack = this.inventory.getStack(this.selectedSlotIndex);
    if (stack !== null && stack.identity.type === 'block') {
      return stack.identity.id as BlockId;
    }
    return 0; // Return empty (Air) if empty or non-block
  }

  /**
   * Re-casts the ray from the player's eye, then applies any break/place
   * input for this frame. Intended to run once per frame, after chunk
   * streaming (so newly loaded chunks are visible to the raycast) and
   * before dirty chunk meshes are rebuilt (so edits this frame are picked
   * up in the same frame's rebuild pass).
   */
  public update(deltaSeconds: number): void {
    this.updateSelectedSlot();

    this.camera.getWorldDirection(this.lookDirection);

    this.currentHit = this.raycaster.cast(
      { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      { x: this.lookDirection.x, y: this.lookDirection.y, z: this.lookDirection.z },
      INTERACTION_REACH,
    );

    const isLeftClickHeld = this.input.isMouseButtonPressed('left');
    this.breakingController.update(this.currentHit, isLeftClickHeld, deltaSeconds);

    if (this.currentHit === undefined) {
      if (this.input.isMouseButtonJustPressed('left')) {
        this.player.swingItem();
      } else if (this.input.isMouseButtonJustPressed('right')) {
        this.player.swingItem();
      }
      return;
    }

    if (this.input.isMouseButtonJustPressed('right')) {
      const placed = this.placeBlock(this.currentHit);
      if (placed) {
        // Authoritative decrement of exactly 1 item upon successful placement
        this.inventory.decrementSlot(this.selectedSlotIndex, 1);
      }
      this.player.swingItem();
    }
  }

  private updateSelectedSlot(): void {
    // Keys 1-9 set selectedSlotIndex 0-8 with immediate snap
    for (let i = 0; i < 9; i++) {
      if (this.input.isDigitKeyJustPressed((i + 1).toString() as DigitKey)) {
        this.selectedSlotIndex = i;
      }
    }
  }

  /** 
   * Places the selected block adjacent to the hit face, if the position is valid.
   * Returns true on successful block placement, or false on any failure.
   */
  private placeBlock(hit: RaycastHit): boolean {
    const selectedId = this.getSelectedBlockId();
    if (selectedId === 0) {
      return false; // Nothing held or non-block held
    }

    const targetX = hit.blockPos.x + hit.face.x;
    const targetY = hit.blockPos.y + hit.face.y;
    const targetZ = hit.blockPos.z + hit.face.z;

    if (targetY < 0 || targetY >= CHUNK_SIZE_Y) {
      return false;
    }

    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(targetX, targetZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);

    if (chunk === undefined) {
      return false;
    }

    const existingBlockId = chunk.getBlock(localX, targetY, localZ);
    const existingDefinition = this.blockRegistry.getById(existingBlockId);

    if (existingDefinition === undefined || !existingDefinition.replaceable) {
      return false;
    }

    const targetBoxAABB = new AABB(targetX, targetY, targetZ, targetX + 1, targetY + 1, targetZ + 1);

    if (targetBoxAABB.intersects(this.player.getAABB())) {
      return false;
    }

    this.setBlock(targetX, targetY, targetZ, selectedId);
    return true;
  }

  /**
   * Writes a block at world coordinates, marking its chunk dirty and any
   * orthogonal neighbour chunks whose meshes could show a seam (only
   * relevant when the edited block sits on a chunk boundary).
   */
  private setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId): void {
    const { chunkX, chunkZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);

    if (chunk === undefined) {
      return;
    }

    this.blockUpdateWorld.setBlock(worldX, worldY, worldZ, blockId, {
      reason: 'player',
      notifyNeighbours: true,
      updateLighting: true,
    });
  }
}
