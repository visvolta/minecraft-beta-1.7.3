import { BlockBehaviourRegistry } from '../world/BlockBehaviour';
import * as THREE from 'three';
import { BlockIds, type BlockId } from '../blocks/BlockId';
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
  private blockInteractionHandler?: (blockId: number, x: number, y: number, z: number) => boolean;

  public setBlockInteractionHandler(handler: (blockId: number, x: number, y: number, z: number) => boolean): void {
    this.blockInteractionHandler = handler;
  }

  public constructor(
    input: Input,
    camera: THREE.PerspectiveCamera,
    player: Player,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    blockUpdateWorld: BlockUpdateWorld,
    itemEntityManager: ItemEntityManager,
    inventory: Inventory,
    private readonly behaviourRegistry: BlockBehaviourRegistry,
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
      const { x, y, z } = this.currentHit.blockPos;
      const targetId = this.blockUpdateWorld.getBlock(x, y, z);
      if (this.blockInteractionHandler && this.blockInteractionHandler(targetId, x, y, z)) {
        this.player.swingItem();
        return;
      }

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

    const behaviour = this.behaviourRegistry.get(selectedId);
    if (behaviour.canPlaceBlockAt) {
      if (!behaviour.canPlaceBlockAt({ world: this.blockUpdateWorld, gameTick: 0 } as any, targetX, targetY, targetZ)) {
        return false;
      }
    }

    this.setBlock(targetX, targetY, targetZ, selectedId);
    return true;
  }

  /**
   * Writes a block at world coordinates, marking its chunk dirty and any
   * orthogonal neighbour chunks whose meshes could show a seam (only
   * relevant when the edited block sits on a chunk boundary).
   */
  private getPlacementMetadata(blockId: BlockId, worldX: number, worldY: number, worldZ: number): number {
    if (blockId === BlockIds.Chest) {
      // Phase 5B: Inherit facing from adjacent chest
      const neighbors = [
        { nx: worldX - 1, nz: worldZ },
        { nx: worldX + 1, nz: worldZ },
        { nx: worldX, nz: worldZ - 1 },
        { nx: worldX, nz: worldZ + 1 }
      ];
      for (const { nx, nz } of neighbors) {
        if (this.blockUpdateWorld.getBlock(nx, worldY, nz) === BlockIds.Chest) {
          return this.blockUpdateWorld.getBlockMetadata(nx, worldY, nz);
        }
      }
    }

    if (blockId === BlockIds.Chest || blockId === BlockIds.Furnace || blockId === BlockIds.FurnaceBurning) {
      let yaw = Math.atan2(-this.lookDirection.x, -this.lookDirection.z); 
      while (yaw < 0) yaw += Math.PI * 2;
      while (yaw >= Math.PI * 2) yaw -= Math.PI * 2;

      if (yaw >= Math.PI * 0.25 && yaw < Math.PI * 0.75) {
        return 5; // +X (East)
      } else if (yaw >= Math.PI * 0.75 && yaw < Math.PI * 1.25) {
        return 2; // -Z (North)
      } else if (yaw >= Math.PI * 1.25 && yaw < Math.PI * 1.75) {
        return 4; // -X (West)
      } else {
        return 3; // +Z (South)
      }
    }
    return 0;
  }

  private setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId): void {
    const { chunkX, chunkZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);

    if (chunk === undefined) {
      return;
    }

    const metadata = this.getPlacementMetadata(blockId, worldX, worldY, worldZ);

    this.blockUpdateWorld.setBlock(worldX, worldY, worldZ, blockId, {
      metadata,
      reason: 'player',
      notifyNeighbours: true,
      updateLighting: true,
    });
  }
}
