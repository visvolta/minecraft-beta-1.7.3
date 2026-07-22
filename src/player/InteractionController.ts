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
import { InventoryTransferService } from '../inventory/InventoryTransferService';
import { DEFAULT_ITEM_DEFINITIONS } from '../items/ItemDefinitionRegistry';
import type { EntityManager } from '../entities/core/EntityManager';
import { LivingEntity } from '../entities/living/LivingEntity';
import { DamageSource } from '../entities/damage/DamageSource';
import { selectMeleeTarget } from './MeleeTargeting';
import { MELEE_REACH, PLAYER_MELEE_DAMAGE } from './PlayerConstants';import { combatDurabilityCost } from '../items/ItemDurability';
import { AnimalEntity } from '../entities/living/AnimalEntity';
import type { AnimalInteractionService } from '../entities/interactions/AnimalInteractionService';import type { FoodUseController } from './FoodUseController';

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
  /** Nearest valid living entity under the crosshair this frame (for melee + debug). */
  private targetedEntity: LivingEntity | undefined;
  private blockInteractionHandler?: (blockId: number, x: number, y: number, z: number) => boolean;

  public setBlockInteractionHandler(handler: (blockId: number, x: number, y: number, z: number) => boolean): void {
    this.blockInteractionHandler = handler;
  }

  private blockPlacedHandler?: (blockId: number, x: number, y: number, z: number) => void;

  public setBlockPlacedHandler(handler: (blockId: number, x: number, y: number, z: number) => void): void {
    this.blockPlacedHandler = handler;
  }

  public constructor(
    input: Input,
    camera: THREE.PerspectiveCamera,
    player: Player,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    blockUpdateWorld: BlockUpdateWorld,
    private readonly itemEntityManager:ItemEntityManager,
    inventory: Inventory,
    private readonly behaviourRegistry: BlockBehaviourRegistry,
    private readonly entityManager: EntityManager,
    private readonly animalInteractions:AnimalInteractionService,
    private readonly foodUse:FoodUseController,
  ) {
    this.input = input;
    this.camera = camera;
    this.player = player;
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
    this.blockUpdateWorld = blockUpdateWorld;
    this.inventory = inventory;
    this.raycaster = new Raycaster(chunkManager, blockRegistry, behaviourRegistry, blockUpdateWorld);
    this.breakingController=new BreakingController(player,chunkManager,blockRegistry,blockUpdateWorld,itemEntityManager,inventory,()=>this.selectedSlotIndex);

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

  /** Nearest valid living entity under the crosshair this frame (for debug tooling). */
  public getTargetedEntity(): LivingEntity | undefined {
    return this.targetedEntity;
  }

  /**
   * Finds the nearest valid melee target using the existing raycast architecture:
   * candidates come from a chunk-first AABB query over the swept look ray, then
   * {@link selectMeleeTarget} picks the closest one within reach. Reach is capped
   * at the block-hit distance (obstruction) and at the Beta 3.0-block melee reach.
   */
  private findMeleeTarget(): LivingEntity | undefined {
    const eyeX = this.camera.position.x;
    const eyeY = this.camera.position.y;
    const eyeZ = this.camera.position.z;
    const lx = this.lookDirection.x;
    const ly = this.lookDirection.y;
    const lz = this.lookDirection.z;

    const blockDistance = this.currentHit?.distance ?? MELEE_REACH;
    const reach = Math.min(MELEE_REACH, blockDistance);

    const endX = eyeX + lx * reach;
    const endY = eyeY + ly * reach;
    const endZ = eyeZ + lz * reach;
    const sweepBox = new AABB(
      Math.min(eyeX, endX), Math.min(eyeY, endY), Math.min(eyeZ, endZ),
      Math.max(eyeX, endX), Math.max(eyeY, endY), Math.max(eyeZ, endZ),
    ).expand(1.0, 1.0, 1.0);

    const candidates = this.entityManager.getEntitiesInAABB(
      sweepBox,
      (entity): entity is LivingEntity => entity instanceof LivingEntity && entity.canBeCollidedWith(),
    );

    const target = selectMeleeTarget({ x: eyeX, y: eyeY, z: eyeZ }, { x: lx, y: ly, z: lz }, reach, candidates);
    return target?.entity;
  }

  /** Applies a player melee hit through the shared living-entity damage flow. */
  private attackTargetedEntity(entity: LivingEntity): void {
    if(entity.attackEntityFrom(DamageSource.player(this.player),PLAYER_MELEE_DAMAGE)){this.player.addExhaustion(.3);const slot=this.selectedSlotIndex,cost=combatDurabilityCost(this.inventory.getStack(slot));if(cost>0&&this.inventory.damageItemInSlot(slot,cost)?.status==='broken')this.itemEntityManager.emitItemBreak(this.player.position.x,this.player.position.y,this.player.position.z);}
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
    if (stack !== null) {
      if (stack.identity.type === 'block') {
        return stack.identity.id as BlockId;
      } else if (stack.identity.type === 'item') {
        const itemDef = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
        if (itemDef?.placeBlockId !== undefined) {
          return itemDef.placeBlockId;
        }
        if (stack.identity.id === 'door_wood') return BlockIds.WoodDoor;
        if (stack.identity.id === 'door_iron') return BlockIds.IronDoor;
        if (stack.identity.id === 'sign') return BlockIds.SignPost;
      }
    }
    return 0;
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

    // Target the nearest valid living entity under the crosshair (melee reach,
    // capped at the block-hit distance so attacks can't pass through walls).
    this.targetedEntity = this.findMeleeTarget();

    const isLeftClickHeld = this.input.isMouseButtonPressed('left');
    // Block breaking yields to a targeted entity (don't break the block behind it).
    this.breakingController.update(this.currentHit, isLeftClickHeld && this.targetedEntity === undefined, deltaSeconds);

    // Melee attack triggers on the left-click edge: one hit per press, which the
    // target's invulnerability frames then gate against rapid re-clicks.
    if (this.input.isMouseButtonJustPressed('left') && this.targetedEntity !== undefined) {
      this.player.swingItem();
      this.attackTargetedEntity(this.targetedEntity);
      return;
    }

    if(this.input.isMouseButtonJustPressed('right')&&InventoryTransferService.autoEquipFromInventorySlot(this.inventory,this.selectedSlotIndex)){this.player.swingItem();return;}
    if(this.input.isMouseButtonJustPressed('right')&&this.foodUse.tryBegin(this.selectedSlotIndex)){this.player.swingItem();return;}
    if (this.input.isMouseButtonJustPressed('right') && this.targetedEntity instanceof AnimalEntity) {
      const result = this.animalInteractions.interact(this.targetedEntity, this.selectedSlotIndex);
      if (result !== 'not-applicable') {
        this.player.swingItem();
        return;
      }
    }

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
      
      const behaviour = this.behaviourRegistry.get(targetId);
      if (behaviour.onInteract) {
        const consumed = behaviour.onInteract({ world: this.blockUpdateWorld, gameTick: 0 } as any, x, y, z);
        if (consumed) {
          this.player.swingItem();
          return;
        }
      }

      if (this.blockInteractionHandler && this.blockInteractionHandler(targetId, x, y, z)) {
        this.player.swingItem();
        return;
      }

      const placed = this.placeBlock(this.currentHit);
      if (placed) {
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
    let selectedId = this.getSelectedBlockId();
    if (selectedId === 0) {
      return false; // Nothing held or non-block held
    }

    if (selectedId === BlockIds.SignPost) {
      // If we clicked top or bottom face, it's a standing sign. If side face, it's a wall sign.
      if (hit.face.y === 0) {
        selectedId = BlockIds.WallSign;
      }
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

    if (selectedId === BlockIds.WoodDoor || selectedId === BlockIds.IronDoor) {
      if (targetY + 1 >= CHUNK_SIZE_Y) return false;
      const upperId = this.blockUpdateWorld.getBlock(targetX, targetY + 1, targetZ);
      const upperDef = this.blockRegistry.getById(upperId);
      if (upperDef === undefined || !upperDef.replaceable) return false;
      
      const upperBoxAABB = new AABB(targetX, targetY + 1, targetZ, targetX + 1, targetY + 2, targetZ + 1);
      if (upperBoxAABB.intersects(this.player.getAABB())) {
        return false;
      }

      // Calculate orientation based on player yaw (Beta 1.7.3)
      let yaw = Math.atan2(-this.lookDirection.x, -this.lookDirection.z);
      while (yaw < 0) yaw += Math.PI * 2;
      while (yaw >= Math.PI * 2) yaw -= Math.PI * 2;

      let meta = 0;
      if (yaw >= Math.PI * 0.25 && yaw < Math.PI * 0.75) meta = 0; // East (+X)
      else if (yaw >= Math.PI * 0.75 && yaw < Math.PI * 1.25) meta = 1; // South (+Z)
      else if (yaw >= Math.PI * 1.25 && yaw < Math.PI * 1.75) meta = 2; // West (-X)
      else meta = 3; // North (-Z)

      // Double-door hinge mirroring logic
      let dx = 0, dz = 0;
      if (meta === 0) dz = 1;
      if (meta === 1) dx = -1;
      if (meta === 2) dz = -1;
      if (meta === 3) dx = 1;

      const isSolid = (vx: number, vy: number, vz: number) => {
        const def = this.blockRegistry.getById(this.blockUpdateWorld.getBlock(vx, vy, vz));
        return def ? def.solid && def.renderType === 'opaque' : false;
      };

      const solidLeft = (isSolid(targetX - dx, targetY, targetZ - dz) ? 1 : 0) + (isSolid(targetX - dx, targetY + 1, targetZ - dz) ? 1 : 0);
      const solidRight = (isSolid(targetX + dx, targetY, targetZ + dz) ? 1 : 0) + (isSolid(targetX + dx, targetY + 1, targetZ + dz) ? 1 : 0);
      const hasDoorLeft = this.blockUpdateWorld.getBlock(targetX - dx, targetY, targetZ - dz) === selectedId || this.blockUpdateWorld.getBlock(targetX - dx, targetY + 1, targetZ - dz) === selectedId;
      const hasDoorRight = this.blockUpdateWorld.getBlock(targetX + dx, targetY, targetZ + dz) === selectedId || this.blockUpdateWorld.getBlock(targetX + dx, targetY + 1, targetZ + dz) === selectedId;

      let mirror = false;
      if (hasDoorLeft && !hasDoorRight) mirror = true;
      else if (solidRight > solidLeft) mirror = true;

      if (mirror) {
        meta = (meta - 1 & 3) + 4;
      }

      // Validate supporting block below
      const behaviour = this.behaviourRegistry.get(selectedId);
      if (behaviour.canPlaceBlockAt) {
        if (!behaviour.canPlaceBlockAt({ world: this.blockUpdateWorld, gameTick: 0, player: this.player } as any, targetX, targetY, targetZ)) {
          return false;
        }
      }

      // Place lower half
      this.blockUpdateWorld.setBlock(targetX, targetY, targetZ, selectedId, {
        metadata: meta,
        reason: 'player',
        notifyNeighbours: true,
        updateLighting: true,
        player: this.player,
      });

      // Place upper half
      this.blockUpdateWorld.setBlock(targetX, targetY + 1, targetZ, selectedId, {
        metadata: meta + 8,
        reason: 'player',
        notifyNeighbours: true,
        updateLighting: true,
        player: this.player,
      });

      this.blockPlacedHandler?.(selectedId, targetX, targetY, targetZ);
      return true;
    }

    const behaviour = this.behaviourRegistry.get(selectedId);
    if (behaviour.canPlaceBlockAt) {
      if (!behaviour.canPlaceBlockAt({ world: this.blockUpdateWorld, gameTick: 0, player: this.player } as any, targetX, targetY, targetZ)) {
        return false;
      }
    }

    const stack = this.inventory.getStack(this.selectedSlotIndex);
    const heldMeta = stack ? stack.metadata : 0;
    this.setBlock(targetX, targetY, targetZ, selectedId, hit, heldMeta);
    this.blockPlacedHandler?.(selectedId, targetX, targetY, targetZ);
    return true;
  }

  /**
   * Writes a block at world coordinates, marking its chunk dirty and any
   * orthogonal neighbour chunks whose meshes could show a seam (only
   * relevant when the edited block sits on a chunk boundary).
   */
  private getPlacementMetadata(blockId: BlockId, worldX: number, worldY: number, worldZ: number, hit: RaycastHit, heldMeta: number): number {
    if (blockId === BlockIds.Slab || blockId === BlockIds.DoubleSlab) {
      return heldMeta;
    }

    if (blockId === BlockIds.Ladder) {
      if (hit.face.z === -1) return 2;
      if (hit.face.z === 1) return 3;
      if (hit.face.x === -1) return 4;
      if (hit.face.x === 1) return 5;
    }

    if (blockId === BlockIds.RedstoneTorchOn || blockId === BlockIds.Torch) {
        if (hit.face.y === 1) return 5;
        if (hit.face.z === 1) return 3;
        if (hit.face.z === -1) return 4;
        if (hit.face.x === 1) return 1;
        if (hit.face.x === -1) return 2;
    }

    if (blockId === BlockIds.StoneButton) {
      if (hit.face.x === -1) return 2;
      if (hit.face.x === 1) return 1;
      if (hit.face.z === -1) return 4;
      if (hit.face.z === 1) return 3;
    }

    if (blockId === BlockIds.Lever) {
      if (hit.face.y === 1) return 5;
      if (hit.face.x === -1) return 2;
      if (hit.face.x === 1) return 1;
      if (hit.face.z === -1) return 4;
      if (hit.face.z === 1) return 3;
    }

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
    return heldMeta;
  }

  private setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId, hit: RaycastHit, heldMeta: number): void {
    const { chunkX, chunkZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);

    if (chunk === undefined) {
      return;
    }

    const metadata = this.getPlacementMetadata(blockId, worldX, worldY, worldZ, hit, heldMeta);

    this.blockUpdateWorld.setBlock(worldX, worldY, worldZ, blockId, {
      metadata,
      reason: 'player',
      notifyNeighbours: true,
      updateLighting: true,
      player: this.player,
    });
  }
}
