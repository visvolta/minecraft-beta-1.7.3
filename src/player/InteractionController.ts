import { BlockBehaviourRegistry } from '../world/BlockBehaviour';
import { isDoorBlockId } from '../blocks/shapes/BlockShapes';
import { ItemStack } from '../inventory/ItemStack';
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
import { FireballEntity } from '../entities/projectiles/FireballEntity';
import { Inventory } from '../inventory/Inventory';
import { InventoryTransferService } from '../inventory/InventoryTransferService';
import { DEFAULT_ITEM_DEFINITIONS } from '../items/ItemDefinitionRegistry';
import { ArrowEntity } from '../entities/projectiles/ArrowEntity';
import { FishingBobberEntity } from '../entities/projectiles/FishingBobberEntity';
import { BoatEntity } from '../entities/BoatEntity';
import { PaintingEntity } from '../entities/PaintingEntity';
import { BED_FOOT_TO_HEAD } from '../blocks/shapes/BlockShapes';
import { doorFacingFromYaw, resolveDoorPlacementMetadata } from '../world/behaviours/DoorBehaviour';
import { stairFacingFromYaw } from '../blocks/shapes/BlockShapes';
import { railShapeFromPlayerYaw } from '../world/rails/RailConnectivity';
import {
  attachedMetadataFromSupport,
  bedDirectionFromYaw,
  supportDirectionFromHitFace,
  trapdoorMetadataFromSupport,
  wallControlMetadataFromSupport,
} from '../blocks/BlockOrientation';

/** Maps a hit wall normal onto Beta's painting direction index. */
function paintingDirectionFromFace(faceX: number, faceZ: number): number {
  if (faceZ === -1) return 0;
  if (faceX === -1) return 1;
  if (faceZ === 1) return 2;
  if (faceX === 1) return 3;
  return -1;
}

/** Beta `EntityArrow` constructor: setArrowHeading(..., 1.5F, 1.0F). */
const BOW_ARROW_SPEED = 1.5;
const BOW_ARROW_SPREAD = 1;
import type { EntityManager } from '../entities/core/EntityManager';
import { Entity } from '../entities/core/Entity';
import { LivingEntity } from '../entities/living/LivingEntity';
import { SnowballEntity, ThrownEggEntity, THROWN_ITEM_SPEED, THROWN_ITEM_INACCURACY } from '../entities/projectiles/ThrownItemEntity';
import { MinecartEntity } from '../entities/MinecartEntity';
import { DamageSource } from '../entities/damage/DamageSource';
import { selectMeleeTarget } from './MeleeTargeting';
import { MELEE_REACH, PLAYER_MELEE_DAMAGE } from './PlayerConstants';import { combatDurabilityCost } from '../items/ItemDurability';import { getMeleeDamage } from '../items/MeleeDamage';
import { AnimalEntity } from '../entities/living/AnimalEntity';
import type { AnimalInteractionService } from '../entities/interactions/AnimalInteractionService';import type { FoodUseController } from './FoodUseController';
import { getRailBlockInfoAt } from '../world/rails/RailShapes';
import { getMinecartBaseYOnRail, railYawRadians } from '../entities/minecart/RailPhysics';
import { getBlockBounds } from '../world/BlockBehaviour';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from './Player';

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
  /** The player's cast bobber, if any. At most one exists at a time. */
  private activeBobber: FishingBobberEntity | null = null;
  private readonly wheelHandler = (event: WheelEvent): void => {
    // Only process scroll if pointer is locked (playing)
    if (this.input.isPointerLocked()) {
      const change = Math.sign(event.deltaY);
      this.selectedSlotIndex = (this.selectedSlotIndex + change + 9) % 9;
      // Beta drops the bobber when the rod leaves the hand.
      this.clearFishingBobber();
    }
  };
  private currentHit: RaycastHit | undefined;
  /** Fluid-aware hit used for block/boat placement (see update()). */
  private currentPlacementHit: RaycastHit | undefined;
  /** Nearest valid living entity under the crosshair this frame (for melee + debug). */
  private targetedEntity: LivingEntity | undefined;
  private targetedInteractEntity: Entity | undefined;
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
    /**
     * Optional positional sink for block-driven sounds (door hinge, chest
     * lid). Injected rather than importing AudioManager so this controller
     * stays usable headlessly in validation.
     */
    private readonly playBlockSound?: (id: 'door_open' | 'door_close' | 'chestopen' | 'chestclosed' | 'click', x: number, y: number, z: number) => void,
    /**
     * Positional one-shot for entity-style sounds (bow release, rod cast).
     * Separate from playBlockSound because Beta routes these through
     * `playSoundAtEntity` with their own volume/pitch.
     */
    private readonly playEntitySound?: (id: string, x: number, y: number, z: number, volume: number, pitch: number) => void,
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
    window.addEventListener('wheel', this.wheelHandler);
  }

  public dispose(): void {
    window.removeEventListener('wheel', this.wheelHandler);
    this.breakingController.reset();
    // A bobber must never survive teardown or a world change.
    this.clearFishingBobber();
  }

  /** Currently targeted block, if any (for BlockHighlight to render). */
  public getCurrentHit(): RaycastHit | undefined {
    return this.currentHit;
  }

  /** Nearest valid living entity under the crosshair this frame (for debug tooling). */
  public getTargetedEntity(): LivingEntity | undefined {
    return this.targetedEntity;
  }

  public getTargetedInteractEntity(): Entity | undefined {
    return this.targetedInteractEntity;
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

  private findInteractTarget(): Entity | undefined {
    const eyeX = this.camera.position.x;
    const eyeY = this.camera.position.y;
    const eyeZ = this.camera.position.z;
    const lx = this.lookDirection.x;
    const ly = this.lookDirection.y;
    const lz = this.lookDirection.z;
    const blockDistance = this.currentHit?.distance ?? INTERACTION_REACH;
    const reach = Math.min(INTERACTION_REACH, blockDistance);
    const endX = eyeX + lx * reach;
    const endY = eyeY + ly * reach;
    const endZ = eyeZ + lz * reach;
    const sweepBox = new AABB(
      Math.min(eyeX, endX), Math.min(eyeY, endY), Math.min(eyeZ, endZ),
      Math.max(eyeX, endX), Math.max(eyeY, endY), Math.max(eyeZ, endZ),
    ).expand(1, 1, 1);
    let best: { entity: Entity; distance: number } | undefined;
    for (const entity of this.entityManager.getEntitiesInAABB(sweepBox, (candidate) => candidate.canBeCollidedWith())) {
      // Beta `getCollisionBorderSize`: grow the hit-test box so large
      // projectiles (the Ghast fireball) are easy to intercept.
      const border = entity.getCollisionBorderSize();
      const hit = entity.getAABB().expand(0.1 + border, 0.1 + border, 0.1 + border).intersectRay(eyeX, eyeY, eyeZ, lx, ly, lz);
      if (hit === undefined || hit.distance > reach) continue;
      if (best === undefined || hit.distance < best.distance) best = { entity, distance: hit.distance };
    }
    return best?.entity;
  }

  /** Applies a player melee hit through the shared living-entity damage flow. */
  private attackTargetedEntity(entity: LivingEntity): void {
    // Beta held-item damage (sword/tools/hand). Replaces the previous flat
    // PLAYER_MELEE_DAMAGE so a diamond sword no longer hits like a bare hand.
    const damage = getMeleeDamage(this.inventory.getStack(this.selectedSlotIndex));
    if(entity.attackEntityFrom(DamageSource.player(this.player),damage)){this.player.addExhaustion(.3);const slot=this.selectedSlotIndex,cost=combatDurabilityCost(this.inventory.getStack(slot));if(cost>0&&this.inventory.damageItemInSlot(slot,cost)?.status==='broken')this.itemEntityManager.emitItemBreak(this.player.position.x,this.player.position.y,this.player.position.z);}
  }

  public getSelectedSlotIndex(): number {
    return this.selectedSlotIndex;
  }

  public setSelectedSlotIndex(slotIndex: number): void {
    if (slotIndex >= 0 && slotIndex < 9 && slotIndex !== this.selectedSlotIndex) {
      this.selectedSlotIndex = slotIndex;
      this.clearFishingBobber();
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

    const eye = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    const look = { x: this.lookDirection.x, y: this.lookDirection.y, z: this.lookDirection.z };
    this.currentHit = this.raycaster.cast(eye, look, INTERACTION_REACH);

    // Beta raycasts twice: normally fluids are ignored (so you can mine
    // through water), but placement uses a fluid-aware trace so blocks and
    // boats can be put on or under the surface. Keeping them separate is
    // what lets a submerged player build without water blocking every hit.
    this.currentPlacementHit = this.raycaster.cast(eye, look, INTERACTION_REACH, true);

    // Target the nearest valid living entity under the crosshair (melee reach,
    // capped at the block-hit distance so attacks can't pass through walls).
    this.targetedEntity = this.findMeleeTarget();
    this.targetedInteractEntity = this.findInteractTarget();

    const isLeftClickHeld = this.input.isMouseButtonPressed('left');
    // Block breaking yields to a targeted entity (don't break the block behind it).
    this.breakingController.update(this.currentHit, isLeftClickHeld && this.targetedInteractEntity === undefined, deltaSeconds);

    // Entity attacks trigger on the left-click edge: one hit per press.
    // Beta: any hit knocks a painting off its wall.
    if (this.input.isMouseButtonJustPressed('left') && this.targetedInteractEntity instanceof PaintingEntity) {
      this.player.swingItem();
      this.targetedInteractEntity.attackEntityFrom();
      return;
    }
    if (this.input.isMouseButtonJustPressed('left') && this.targetedInteractEntity instanceof BoatEntity) {
      this.player.swingItem();
      this.targetedInteractEntity.attackEntityFrom(PLAYER_MELEE_DAMAGE);
      return;
    }
    if (this.input.isMouseButtonJustPressed('left') && this.targetedInteractEntity instanceof MinecartEntity) {
      this.player.swingItem();
      this.targetedInteractEntity.attackMinecart(PLAYER_MELEE_DAMAGE);
      return;
    }
    // Beta `EntityFireball.attackEntityFrom`: a player left-click redirects the
    // fireball along the player's look vector. The shooter reference is left
    // unchanged (see FireballEntity.deflect), so a reflected ball can still
    // kill its Ghast via the blast.
    if (this.input.isMouseButtonJustPressed('left') && this.targetedInteractEntity instanceof FireballEntity) {
      this.player.swingItem();
      this.targetedInteractEntity.deflect(this.lookDirection.x, this.lookDirection.y, this.lookDirection.z);
      return;
    }
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

    if (this.input.isMouseButtonJustPressed('right') && (this.player.ridingEntity instanceof MinecartEntity || this.player.ridingEntity instanceof BoatEntity)) {
      this.dismountPlayerFromMinecart();
      this.player.swingItem();
      return;
    }

    if (this.input.isMouseButtonJustPressed('right') && this.targetedInteractEntity instanceof BoatEntity) {
      const boat = this.targetedInteractEntity;
      if (boat.riddenByEntity === null && this.player.ridingEntity === null) {
        this.player.mountEntity(boat);
        boat.updateRiderPosition();
        this.player.swingItem();
        return;
      }
    }

    if (this.input.isMouseButtonJustPressed('right') && this.targetedInteractEntity instanceof MinecartEntity) {
      if (this.targetedInteractEntity.riddenByEntity === null && this.player.ridingEntity === null) {
        this.player.mountEntity(this.targetedInteractEntity);
        this.targetedInteractEntity.updatePassengerPosition();
        this.player.swingItem();
        return;
      }
    }

    // Utility items act on right-click regardless of whether a block is
    // targeted (Beta's `Item.onItemRightClick`), so this runs before the
    // no-target early-out below.
    if (this.input.isMouseButtonJustPressed('right') && this.tryUseUtilityItem()) {
      this.player.swingItem();
      return;
    }

    // Placement uses the fluid-aware hit so a submerged player (whose normal
    // trace stops at nothing) can still build and launch boats.
    const placementHit = this.currentPlacementHit;

    if (this.currentHit === undefined) {
      if (this.input.isMouseButtonJustPressed('right') && placementHit !== undefined) {
        if (this.tryUseBoatItem(placementHit)
          || this.tryUseFlintAndSteel(placementHit)
          || this.tryPlaceBlock(placementHit)) {
          this.player.swingItem();
          return;
        }
      }
      if (this.input.isMouseButtonJustPressed('left')) {
        this.player.swingItem();
      } else if (this.input.isMouseButtonJustPressed('right')) {
        this.player.swingItem();
      }
      return;
    }

    if (this.input.isMouseButtonJustPressed('right')) {
      if (this.tryUseMinecartItem(this.currentHit)) {
        this.player.swingItem();
        return;
      }

      if (this.tryUseFlintAndSteel(placementHit ?? this.currentHit)) {
        this.player.swingItem();
        return;
      }

      if (this.tryUseBoatItem(placementHit ?? this.currentHit)
        || this.tryUsePaintingItem(this.currentHit)
        || this.tryUseBedItem(this.currentHit)) {
        this.player.swingItem();
        return;
      }

      const { x, y, z } = this.currentHit.blockPos;
      const targetId = this.blockUpdateWorld.getBlock(x, y, z);
      
      const behaviour = this.behaviourRegistry.get(targetId);
      if (behaviour.onInteract) {
        const consumed = behaviour.onInteract({ world: this.blockUpdateWorld, gameTick: 0, playBlockSound: this.playBlockSound } as any, x, y, z);
        if (consumed) {
          this.player.swingItem();
          return;
        }
      }

      if (this.blockInteractionHandler && this.blockInteractionHandler(targetId, x, y, z)) {
        this.player.swingItem();
        return;
      }

      // Prefer the fluid-aware hit when it is at least as close, so blocks
      // can be placed against a water surface rather than through it.
      const useHit = placementHit !== undefined && placementHit.distance <= this.currentHit.distance + 1e-6
        ? placementHit
        : this.currentHit;
      const placed = this.placeBlock(useHit);
      if (placed && this.shouldConsumeHeldItem()) {
        this.inventory.decrementSlot(this.selectedSlotIndex, 1);
      }
      this.player.swingItem();
    }
  }

  /**
   * Beta `Item.onItemRightClick` for the items that act on the player rather
   * than on a targeted block.
   *
   * Returns true when the item consumed the click.
   */
  private tryUseUtilityItem(): boolean {
    const stack = this.inventory.getStack(this.selectedSlotIndex);
    if (stack === null || stack.identity.type !== 'item') return false;
    const definition = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
    if (definition === undefined) return false;

    if (definition.id === 'bow') return this.fireBow();
    if (definition.id === 'fishing_rod') return this.useFishingRod();
    if (definition.id === 'snowball') return this.throwItem('snowball');
    if (definition.id === 'egg') return this.throwItem('egg');
    if (definition.id === 'bucket_empty') return this.useEmptyBucket();
    if (definition.id === 'bucket_water') return this.usePlacementBucket(BlockIds.WaterStill);
    if (definition.id === 'bucket_lava') return this.usePlacementBucket(BlockIds.LavaStill);
    return false;
  }

  /**
   * Beta `ItemBucket.onItemRightClick` with `isFull == 0`: raytrace WITH
   * fluids, and if the hit cell is a water or lava **source** (metadata 0),
   * remove it and hand back the matching filled bucket.
   */
  private useEmptyBucket(): boolean {
    const hit = this.currentPlacementHit;
    if (hit === undefined) return false;
    const { x, y, z } = hit.blockPos;
    const blockId = this.blockUpdateWorld.getBlock(x, y, z);
    const metadata = this.blockUpdateWorld.getBlockMetadata(x, y, z);
    // Beta only collects a full source block, never flowing fluid.
    if (metadata !== 0) return false;

    let filled: string | undefined;
    if (blockId === BlockIds.WaterStill) filled = 'bucket_water';
    else if (blockId === BlockIds.LavaStill) filled = 'bucket_lava';
    if (filled === undefined) return false;

    this.blockUpdateWorld.setBlock(x, y, z, BlockIds.Air, { notifyNeighbours: true });
    this.swapHeldBucket(filled);
    return true;
  }

  /**
   * Beta `ItemBucket.onItemRightClick` with a filled bucket: raytrace WITHOUT
   * fluids, offset by the hit face, and place the fluid if the target cell is
   * air or a non-solid block. The bucket becomes empty.
   */
  private usePlacementBucket(fluidBlockId: number): boolean {
    // Beta passes `this.isFull == 0` as the fluid flag, so a filled bucket
    // traces past fluids and lands on the first solid surface.
    const hit = this.currentHit;
    if (hit === undefined) return false;

    const targetX = hit.blockPos.x + hit.face.x;
    const targetY = hit.blockPos.y + hit.face.y;
    const targetZ = hit.blockPos.z + hit.face.z;
    if (targetY < 0 || targetY >= CHUNK_SIZE_Y) return false;

    const existingId = this.blockUpdateWorld.getBlock(targetX, targetY, targetZ);
    const existing = this.blockRegistry.getById(existingId);
    // Beta: `isAirBlock(...) || !getBlockMaterial(...).isSolid()`
    if (existingId !== BlockIds.Air && existing?.solid === true) return false;

    this.blockUpdateWorld.setBlock(targetX, targetY, targetZ, fluidBlockId, {
      metadata: 0,
      notifyNeighbours: true,
    });
    this.swapHeldBucket('bucket_empty');
    return true;
  }

  /**
   * Beta returns a NEW ItemStack from `onItemRightClick`, i.e. the bucket
   * transforms in place rather than being consumed. Creative mode leaves the
   * stack untouched, matching Beta's `capabilities.isCreativeMode` guard.
   */
  private swapHeldBucket(itemId: string): void {
    if (this.player.isCreativeMode()) return;
    const slot = this.selectedSlotIndex;
    const stack = this.inventory.getStack(slot);
    if (stack === null) return;
    if (stack.count > 1) {
      // A stack of buckets: consume one and try to add the replacement.
      this.inventory.decrementSlot(slot, 1);
      this.inventory.insert('item', itemId, 1, 0);
      return;
    }
    this.inventory.setStack(slot, new ItemStack(itemId, 'item', 1, 0));
  }

  /**
   * Beta `ItemSnowball`/`ItemEgg.onItemRightClick`: consume one, play
   * `random.bow` at half volume with a randomised low pitch, and spawn the
   * thrown entity aimed along the player's look vector at speed 1.5.
   */
  private throwItem(kind: 'snowball' | 'egg'): boolean {
    // Same spawn/aim convention as the bow: Beta yaw, eye height with a small
    // rearward offset, and a look vector derived from yaw/pitch.
    const yaw = this.betaYawRadians();
    const pitch = this.cameraPitchRadians();
    const originX = this.player.position.x - Math.cos(yaw) * 0.16;
    const originY = this.player.getEyeY() - 0.1;
    const originZ = this.player.position.z - Math.sin(yaw) * 0.16;
    const owner = this.player as unknown as Entity;
    const entity = kind === 'snowball'
      ? new SnowballEntity(this.entityManager.context, owner, originX, originY, originZ)
      : new ThrownEggEntity(this.entityManager.context, owner, originX, originY, originZ);
    const dirX = -Math.sin(yaw) * Math.cos(pitch);
    const dirY = -Math.sin(pitch);
    const dirZ = Math.cos(yaw) * Math.cos(pitch);
    entity.launch(dirX, dirY, dirZ, THROWN_ITEM_SPEED, THROWN_ITEM_INACCURACY);
    this.entityManager.add(entity);

    this.inventory.decrementSlot(this.selectedSlotIndex, 1);
    // Beta: 0.5 volume, pitch 0.4 / (rand * 0.4 + 0.8).
    this.playEntitySound?.(
      'random.bow',
      this.player.position.x, this.player.position.y, this.player.position.z,
      0.5,
      0.4 / (Math.random() * 0.4 + 0.8),
    );
    return true;
  }

  /**
   * Beta `ItemFishingRod.onItemRightClick`: casting with no bobber out throws
   * one; clicking again reels it in and damages the rod by the catch result
   * (0 nothing, 1 fish, 2 stuck in ground, 3 hooked entity).
   */
  private useFishingRod(): boolean {
    const existing = this.activeBobber;
    if (existing !== null && !existing.removed) {
      const damage = existing.reelIn();
      this.activeBobber = null;
      if (damage > 0 && this.inventory.damageItemInSlot(this.selectedSlotIndex, damage)?.status === 'broken') {
        this.itemEntityManager.emitItemBreak(this.player.position.x, this.player.position.y, this.player.position.z);
      }
      return true;
    }

    // Beta's spawn/heading maths needs Beta-convention yaw, not the
    // 180-degree-offset internal camera yaw.
    const yaw = this.betaYawRadians();
    const pitch = this.cameraPitchRadians();
    // Beta spawns the bobber just in front of and below the eye.
    const originX = this.player.position.x - Math.cos(yaw) * 0.16;
    const originY = this.player.getEyeY() - 0.1;
    const originZ = this.player.position.z - Math.sin(yaw) * 0.16;

    const bobber = new FishingBobberEntity(
      this.entityManager.context,
      this.player as unknown as Entity,
      originX, originY, originZ,
    );
    bobber.cast(yaw, pitch);
    bobber.spawnCatch = (x, y, z, mx, my, mz) => {
      this.itemEntityManager.spawnThrownItem(
        x, y, z,
        { type: 'item', id: 'fish_cod_raw', count: 1, metadata: 0 },
        mx, my, mz, 10,
      );
    };
    this.entityManager.add(bobber);
    this.activeBobber = bobber;
    // Beta plays random.bow at 0.5 volume with a randomised low pitch.
    this.playEntitySound?.(
      'random.bow',
      this.player.position.x, this.player.position.y, this.player.position.z,
      0.5,
      0.4 / (Math.random() * 0.4 + 0.8),
    );
    return true;
  }

  /**
   * Removes any bobber in the world. Called when the player switches away
   * from the rod, dies, or the world is torn down, so a hook can never
   * outlive the session that made it.
   */
  /**
   * The bobber currently in the world, if any. Exposed so the renderer can
   * draw the line to it; returns null the moment it is removed.
   */
  public getActiveBobber(): FishingBobberEntity | null {
    const bobber = this.activeBobber;
    if (bobber === null || bobber.removed) return null;
    return bobber;
  }

  public clearFishingBobber(): void {
    if (this.activeBobber === null) return;
    if (!this.activeBobber.removed) this.activeBobber.markRemoved();
    this.activeBobber = null;
  }

  /**
   * Beta 1.7.3 `ItemBow.onItemRightClick`: fires immediately on right-click
   * (the charge-up mechanic is post-Beta). Consumes one arrow, spawns the
   * projectile from the player's eye with Beta's 1.5 speed / 1.0 spread, and
   * costs one durability point.
   */
  private fireBow(): boolean {
    const arrowSlot = this.findArrowSlot();
    if (arrowSlot < 0) return false;

    // Beta convention yaw: `cameraYawRadians()` would fire the arrow backwards.
    const yaw = this.betaYawRadians();
    const pitch = this.cameraPitchRadians();
    // Beta offsets the spawn slightly behind and below the eye.
    const originX = this.player.position.x - Math.cos(yaw) * 0.16;
    const originY = this.player.getEyeY() - 0.1;
    const originZ = this.player.position.z - Math.sin(yaw) * 0.16;

    const arrow = new ArrowEntity(this.entityManager.context, this.player as unknown as Entity, originX, originY, originZ);
    arrow.playerOwned = true; // Beta `doesArrowBelongToPlayer`: player-fired arrows can be recovered.
    const dirX = -Math.sin(yaw) * Math.cos(pitch);
    const dirY = -Math.sin(pitch);
    const dirZ = Math.cos(yaw) * Math.cos(pitch);
    arrow.launch(dirX, dirY, dirZ, BOW_ARROW_SPEED, BOW_ARROW_SPREAD);
    this.entityManager.add(arrow);

    this.inventory.decrementSlot(arrowSlot, 1);
    if (this.inventory.damageItemInSlot(this.selectedSlotIndex, 1)?.status === 'broken') {
      this.itemEntityManager.emitItemBreak(this.player.position.x, this.player.position.y, this.player.position.z);
    }
    // Beta ItemBow: random.bow at full volume with a randomised pitch.
    this.playEntitySound?.(
      'random.bow',
      this.player.position.x, this.player.position.y, this.player.position.z,
      1,
      1 / (Math.random() * 0.4 + 0.8),
    );
    return true;
  }

  /** First inventory slot holding arrows, or -1. */
  private findArrowSlot(): number {
    const slots = this.inventory.getSlots();
    for (let slot = 0; slot < slots.length; slot++) {
      const stack = slots[slot];
      if (stack === null || stack === undefined) continue;
      const definition = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
      if (definition?.id === 'arrow') return slot;
    }
    return -1;
  }

  /**
   * Project-internal yaw used by projectile spawning: 0 points along -Z.
   * This is 180 degrees out from Beta's `rotationYaw`, so anything porting a
   * Beta placement formula must use `betaYawDegrees()` instead.
   */
  private cameraYawRadians(): number {
    return Math.atan2(-this.lookDirection.x, this.lookDirection.z) + Math.PI;
  }

  /**
   * The player's yaw in Beta's own convention and units.
   *
   * Beta measures `rotationYaw` in degrees with 0 = facing +Z, and derives the
   * look vector as `(-sin(yaw), cos(yaw))`. Feeding a Beta placement formula
   * the project's internal yaw (which is offset by 180 degrees) is what made
   * stairs, doors and rails face the opposite way from the player.
   */
  private betaYawDegrees(): number {
    const yaw = Math.atan2(-this.lookDirection.x, this.lookDirection.z) * 180 / Math.PI;
    return ((yaw % 360) + 360) % 360;
  }

  /**
   * The player's yaw in Beta's convention, in radians.
   *
   * Beta's projectile spawn formulas (`EntityArrow`, `EntityFish`) read
   * `rotationYaw` directly:
   *   posX  -= cos(yaw) * 0.16
   *   motionX = -sin(yaw) * cos(pitch)
   *   motionZ =  cos(yaw) * cos(pitch)
   * Those only produce a forward-going projectile when `yaw` is Beta's own
   * angle. Feeding them `cameraYawRadians()` (offset by 180 degrees) negates
   * both the spawn offset and the heading, which fired arrows and cast the
   * fishing bobber directly backwards out of the player's back.
   */
  private betaYawRadians(): number {
    return Math.atan2(-this.lookDirection.x, this.lookDirection.z);
  }

  private cameraPitchRadians(): number {
    return Math.asin(Math.max(-1, Math.min(1, -this.lookDirection.y)));
  }

  /**
   * Beta `ItemBoat.onItemRightClick`: a boat is placed on the water surface
   * the player is looking at, sitting on top of the block face that was hit.
   */
  private tryUseBoatItem(hit: RaycastHit): boolean {
    const stack = this.inventory.getStack(this.selectedSlotIndex);
    if (stack === null || stack.identity.type !== 'item') return false;
    const definition = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
    if (definition?.id !== 'boat') return false;

    const { x, y, z } = hit.blockPos;
    const targetId = this.blockUpdateWorld.getBlock(x, y, z);
    const isWater = targetId === BlockIds.WaterStill || targetId === BlockIds.WaterFlowing;
    if (!isWater) return false;

    // Beta floats the hull on the surface of the clicked water column.
    const boat = new BoatEntity(this.entityManager.context, x + 0.5, y + 1, z + 0.5);
    boat.yaw = (this.cameraYawRadians() * 180 / Math.PI) + 90;
    boat.previousYaw = boat.yaw;
    boat.dropParts = (bx, by, bz) => this.dropBoatParts(bx, by, bz);
    if (this.entityManager.getEntitiesInAABB(boat.getAABB(), (entity) => entity.canBeCollidedWith()).length > 0) {
      return false;
    }

    this.entityManager.add(boat);
    if (this.shouldConsumeHeldItem()) this.inventory.decrementSlot(this.selectedSlotIndex, 1);
    return true;
  }

  /** Beta boat wreckage: three planks and two sticks. */
  private dropBoatParts(x: number, y: number, z: number): void {
    for (let i = 0; i < 3; i++) {
      this.itemEntityManager.spawnThrownItem(x, y, z, { type: 'block', id: BlockIds.Planks, count: 1, metadata: 0 }, 0, 0.1, 0, 10);
    }
    for (let i = 0; i < 2; i++) {
      this.itemEntityManager.spawnThrownItem(x, y, z, { type: 'item', id: 'stick', count: 1, metadata: 0 }, 0, 0.1, 0, 10);
    }
  }

  /**
   * Beta `ItemPainting.onItemUse`: paintings attach to the vertical face of
   * the block that was clicked, choosing a random variant that fits.
   */
  private tryUsePaintingItem(hit: RaycastHit): boolean {
    const stack = this.inventory.getStack(this.selectedSlotIndex);
    if (stack === null || stack.identity.type !== 'item') return false;
    const definition = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
    if (definition?.id !== 'painting') return false;

    // Only vertical faces can hold a painting.
    if (hit.face.y !== 0) return false;
    const direction = paintingDirectionFromFace(hit.face.x, hit.face.z);
    if (direction < 0) return false;

    // The anchor is the WALL block itself, not the air in front of it.
    // Anchoring to the air cell made hasValidSurface test that air for
    // solidity, so every placement was refused.
    const anchorX = hit.blockPos.x;
    const anchorY = hit.blockPos.y;
    const anchorZ = hit.blockPos.z;

    // The wall must actually be solid before anything is spawned.
    const wallId = this.blockUpdateWorld.getBlock(anchorX, anchorY, anchorZ);
    if (this.blockRegistry.getById(wallId)?.solid !== true) return false;
    // The cell the painting will occupy must be free.
    const frontId = this.blockUpdateWorld.getBlock(
      anchorX + hit.face.x, anchorY, anchorZ + hit.face.z,
    );
    if (frontId !== BlockIds.Air) return false;

    const world = {
      isSolid: (bx: number, by: number, bz: number): boolean => {
        const id = this.blockUpdateWorld.getBlock(bx, by, bz);
        return this.blockRegistry.getById(id)?.solid === true;
      },
    };
    const painting = PaintingEntity.create(
      this.entityManager.context, world,
      anchorX, anchorY, anchorZ, direction,
      (bound) => Math.floor(Math.random() * bound),
    );
    if (painting === null) return false;

    painting.dropAsItem = (px, py, pz) => {
      this.itemEntityManager.spawnThrownItem(px, py, pz, { type: 'item', id: 'painting', count: 1, metadata: 0 }, 0, 0.1, 0, 10);
    };
    this.entityManager.add(painting);
    if (this.shouldConsumeHeldItem()) this.inventory.decrementSlot(this.selectedSlotIndex, 1);
    return true;
  }

  /**
   * Beta `ItemBed.onItemUse`: the clicked cell becomes the foot and the head
   * goes one step along the player's facing. Both need solid ground and free
   * space, otherwise the placement is refused.
   */
  private tryUseBedItem(hit: RaycastHit): boolean {
    const stack = this.inventory.getStack(this.selectedSlotIndex);
    if (stack === null || stack.identity.type !== 'item') return false;
    const definition = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
    if (definition?.id !== 'bed') return false;
    if (hit.face.y !== 1) return false;

    const footX = hit.blockPos.x;
    const footY = hit.blockPos.y + 1;
    const footZ = hit.blockPos.z;
    if (this.blockUpdateWorld.getBlock(footX, footY, footZ) !== BlockIds.Air) return false;

    // Beta orients the bed by the player's facing quadrant.
    // Beta `ItemBed.onItemUse`: floor(yaw * 4 / 360 + 0.5) & 3, in Beta's own
    // yaw convention.
    const direction = bedDirectionFromYaw(this.betaYawDegrees());
    const offset = BED_FOOT_TO_HEAD[direction] ?? [0, 1];
    const headX = footX + offset[0];
    const headZ = footZ + offset[1];

    if (this.blockUpdateWorld.getBlock(headX, footY, headZ) !== BlockIds.Air) return false;
    const groundUnderHead = this.blockUpdateWorld.getBlock(headX, footY - 1, headZ);
    if (this.blockRegistry.getById(groundUnderHead)?.solid !== true) return false;

    // Foot carries the plain direction; the head sets bit 8.
    this.blockUpdateWorld.setBlock(footX, footY, footZ, BlockIds.Bed, {
      metadata: direction, notifyNeighbours: true, updateLighting: true,
    });
    this.blockUpdateWorld.setBlock(headX, footY, headZ, BlockIds.Bed, {
      metadata: direction | 8, notifyNeighbours: true, updateLighting: true,
    });
    if (this.shouldConsumeHeldItem()) this.inventory.decrementSlot(this.selectedSlotIndex, 1);
    return true;
  }

  private tryUseMinecartItem(hit: RaycastHit): boolean {
    const stack = this.inventory.getStack(this.selectedSlotIndex);
    if (stack === null || stack.identity.type !== 'item') return false;
    const id = stack.identity.id;
    if (id !== 328 && id !== 'minecart') return false;

    const { x, y, z } = hit.blockPos;
    const rail = getRailBlockInfoAt(this.blockUpdateWorld, x, y, z);
    if (rail === undefined || (rail.blockId !== BlockIds.Rail && rail.blockId !== BlockIds.PoweredRail)) return false;

    const spawnX = x + 0.5;
    const spawnZ = z + 0.5;
    const spawnY = getMinecartBaseYOnRail(spawnX, spawnZ, rail);
    const cart = new MinecartEntity(this.entityManager.context, spawnX, spawnY, spawnZ);
    cart.yaw = railYawRadians(rail.shape) * 180 / Math.PI;
    cart.previousYaw = cart.yaw;
    if (this.entityManager.getEntitiesInAABB(cart.getAABB(), (entity) => entity.canBeCollidedWith()).length > 0) return false;

    this.entityManager.add(cart);
    if (this.shouldConsumeHeldItem()) this.inventory.decrementSlot(this.selectedSlotIndex, 1);
    return true;
  }

  private dismountPlayerFromMinecart(): void {
    const vehicle = this.player.ridingEntity;
    this.player.mountEntity(null);
    if (vehicle === null) return;
    const candidates = [
      { x: vehicle.position.x + 1, y: vehicle.position.y, z: vehicle.position.z },
      { x: vehicle.position.x - 1, y: vehicle.position.y, z: vehicle.position.z },
      { x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z + 1 },
      { x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z - 1 },
      { x: vehicle.position.x, y: vehicle.position.y + 1, z: vehicle.position.z },
    ];
    for (const candidate of candidates) {
      if (this.isPlayerSpaceClear(candidate.x, candidate.y, candidate.z)) {
        this.player.position.x = candidate.x;
        this.player.position.y = candidate.y;
        this.player.position.z = candidate.z;
        this.player.velocity.x = 0;
        this.player.velocity.y = 0;
        this.player.velocity.z = 0;
        return;
      }
    }
    this.player.position.x = vehicle.position.x;
    this.player.position.y = vehicle.position.y + 1;
    this.player.position.z = vehicle.position.z;
  }

  private isPlayerSpaceClear(x: number, y: number, z: number): boolean {
    const half = PLAYER_WIDTH / 2;
    const box = new AABB(x - half, y, z - half, x + half, y + PLAYER_HEIGHT, z + half);
    const minX = Math.floor(box.minX);
    const maxX = Math.ceil(box.maxX) - 1;
    const minY = Math.floor(box.minY);
    const maxY = Math.ceil(box.maxY) - 1;
    const minZ = Math.floor(box.minZ);
    const maxZ = Math.ceil(box.maxZ) - 1;
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          for (const bounds of getBlockBounds(this.blockRegistry, this.behaviourRegistry, this.blockUpdateWorld, bx, by, bz, 'collision')) {
            if (box.intersects(bounds)) return false;
          }
        }
      }
    }
    return true;
  }

  private shouldConsumeHeldItem(): boolean {
    return !this.player.isCreativeMode();
  }

  private updateSelectedSlot(): void {
    // Keys 1-9 set selectedSlotIndex 0-8 with immediate snap
    for (let i = 0; i < 9; i++) {
      if (this.input.isDigitKeyJustPressed((i + 1).toString() as DigitKey)) {
        if (i !== this.selectedSlotIndex) this.clearFishingBobber();
        this.selectedSlotIndex = i;
      }
    }
  }

  /** 
   * Places the selected block adjacent to the hit face, if the position is valid.
   * Returns true on successful block placement, or false on any failure.
   */
  /**
   * Beta `ItemFlintAndSteel.onItemUse`: steps one cell along the clicked face
   * and, if that cell is air, places fire there. The rod is damaged by one
   * point whether or not the fire took, and breaks when exhausted.
   */
  private tryUseFlintAndSteel(hit: RaycastHit): boolean {
    const stack = this.inventory.getStack(this.selectedSlotIndex);
    if (stack === null || stack.identity.type !== 'item') return false;
    const definition = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
    if (definition?.id !== 'flint_and_steel') return false;

    const targetX = hit.blockPos.x + hit.face.x;
    const targetY = hit.blockPos.y + hit.face.y;
    const targetZ = hit.blockPos.z + hit.face.z;
    if (targetY < 0 || targetY >= CHUNK_SIZE_Y) return false;

    // Beta only ignites genuinely empty space; clicking an existing fire or a
    // solid block still costs durability but places nothing.
    if (this.blockUpdateWorld.getBlock(targetX, targetY, targetZ) === BlockIds.Air) {
      this.blockUpdateWorld.setBlock(targetX, targetY, targetZ, BlockIds.Fire, {
        reason: 'player', notifyNeighbours: true, updateLighting: true, player: this.player,
      });
      this.playEntitySound?.(
        'fire.ignite',
        targetX + 0.5, targetY + 0.5, targetZ + 0.5,
        1,
        Math.random() * 0.4 + 0.8,
      );
    }

    if (this.inventory.damageItemInSlot(this.selectedSlotIndex, 1)?.status === 'broken') {
      this.itemEntityManager.emitItemBreak(
        this.player.position.x, this.player.position.y, this.player.position.z,
      );
    }
    return true;
  }

  /** Places the held block and consumes it, for the no-solid-hit path. */
  private tryPlaceBlock(hit: RaycastHit): boolean {
    const placed = this.placeBlock(hit);
    if (placed && this.shouldConsumeHeldItem()) {
      this.inventory.decrementSlot(this.selectedSlotIndex, 1);
    }
    return placed;
  }

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

    // Beta `ItemBlock.onItemUse` offsets by the clicked face, EXCEPT when the
    // clicked block is itself replaceable (a fluid or snow layer), in which
    // case the new block takes that cell directly. Without this a click on
    // water placed the block in the air cell in front of it, so a submerged
    // player could never build.
    const clickedId = this.blockUpdateWorld.getBlock(hit.blockPos.x, hit.blockPos.y, hit.blockPos.z);
    const clickedDefinition = this.blockRegistry.getById(clickedId);
    const replaceClicked = clickedDefinition?.replaceable === true;

    const targetX = replaceClicked ? hit.blockPos.x : hit.blockPos.x + hit.face.x;
    const targetY = replaceClicked ? hit.blockPos.y : hit.blockPos.y + hit.face.y;
    const targetZ = replaceClicked ? hit.blockPos.z : hit.blockPos.z + hit.face.z;

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

    if (isDoorBlockId(selectedId)) {
      if (targetY + 1 >= CHUNK_SIZE_Y) return false;
      const upperId = this.blockUpdateWorld.getBlock(targetX, targetY + 1, targetZ);
      const upperDef = this.blockRegistry.getById(upperId);
      if (upperDef === undefined || !upperDef.replaceable) return false;

      // Beta `BlockDoor.canPlaceBlockAt` requires solid ground under the door.
      if (!this.blockUpdateWorld.isNormalCube(targetX, targetY - 1, targetZ)) return false;

      // Beta `ItemDoor.onItemUse` derives facing from the player's yaw in
      // degrees. Using the raw look vector with ad-hoc quadrants (as before)
      // put doors sideways relative to the player.
      const facing = doorFacingFromYaw(this.betaYawDegrees());

      const isSolidAt = (dx: number, dz: number, dy: number): boolean =>
        this.blockUpdateWorld.isNormalCube(targetX + dx, targetY + dy, targetZ + dz);
      const isDoorAt = (dx: number, dz: number, dy: number): boolean =>
        this.blockUpdateWorld.getBlock(targetX + dx, targetY + dy, targetZ + dz) === selectedId;

      const lowerMeta = resolveDoorPlacementMetadata(facing, isSolidAt, isDoorAt);

      if (this.placedBlocksIntersectPlayer([
        { x: targetX, y: targetY, z: targetZ, blockId: selectedId, metadata: lowerMeta },
        { x: targetX, y: targetY + 1, z: targetZ, blockId: selectedId, metadata: (lowerMeta & 7) | 8 },
      ])) return false;

      this.blockUpdateWorld.setBlock(targetX, targetY, targetZ, selectedId, {
        metadata: lowerMeta, reason: 'player', notifyNeighbours: true, updateLighting: true, player: this.player,
      });
      // Beta writes `facing + 8` upstairs: the upper half carries the same
      // facing/open bits with the upper flag set.
      this.blockUpdateWorld.setBlock(targetX, targetY + 1, targetZ, selectedId, {
        metadata: (lowerMeta & 7) | 8, reason: 'player', notifyNeighbours: true, updateLighting: true, player: this.player,
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
    const metadata = this.getPlacementMetadata(selectedId, targetX, targetY, targetZ, hit, heldMeta);
    if (this.placedBlocksIntersectPlayer([{ x: targetX, y: targetY, z: targetZ, blockId: selectedId, metadata }])) return false;
    this.setBlock(targetX, targetY, targetZ, selectedId, hit, heldMeta);
    this.blockPlacedHandler?.(selectedId, targetX, targetY, targetZ);
    return true;
  }

  private placedBlocksIntersectPlayer(placements: readonly { readonly x: number; readonly y: number; readonly z: number; readonly blockId: BlockId; readonly metadata: number }[]): boolean {
    const playerBox = this.player.getAABB();
    const virtualWorld = {
      getBlock: (x: number, y: number, z: number): number => placements.find((p) => p.x === x && p.y === y && p.z === z)?.blockId ?? this.blockUpdateWorld.getBlock(x, y, z),
      getBlockMetadata: (x: number, y: number, z: number): number => placements.find((p) => p.x === x && p.y === y && p.z === z)?.metadata ?? this.blockUpdateWorld.getBlockMetadata(x, y, z),
      isNormalCube: (x: number, y: number, z: number): boolean => {
        const placed = placements.find((p) => p.x === x && p.y === y && p.z === z);
        if (placed !== undefined) {
          const def = this.blockRegistry.getById(placed.blockId);
          return def !== undefined && def.solid && !def.transparent && def.renderType === 'opaque';
        }
        return this.blockUpdateWorld.isNormalCube(x, y, z);
      },
      isLoaded: (x: number, z: number): boolean => this.blockUpdateWorld.isLoaded(x, z),
      getBlocklight: (x: number, y: number, z: number): number => this.blockUpdateWorld.getBlocklight(x, y, z),
      getSkylight: (x: number, y: number, z: number): number => this.blockUpdateWorld.getSkylight(x, y, z),
    };

    for (const placement of placements) {
      const definition = this.blockRegistry.getById(placement.blockId);
      if (definition === undefined) return true;
      const behaviour = this.behaviourRegistry.get(placement.blockId);
      let bounds = behaviour.getBoundingBoxes?.({ world: virtualWorld as any, gameTick: 0 } as any, placement.x, placement.y, placement.z, 'collision');
      if (bounds === undefined) {
        bounds = definition.solid ? [new AABB(placement.x, placement.y, placement.z, placement.x + 1, placement.y + 1, placement.z + 1)] : [];
      }
      for (const bound of bounds) if (playerBox.intersects(bound)) return true;
    }
    return false;
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

    // Beta `BlockSign` wall variant: metadata is the face the sign hangs on
    // (2 = -Z, 3 = +Z, 4 = -X, 5 = +X), taken from the clicked face normal so
    // the board sits flat on the exact face the player targeted. Without this
    // every wall sign defaulted to one orientation.
    if (blockId === BlockIds.WallSign) {
      const support = supportDirectionFromHitFace(hit.face);
      return support === undefined ? 2 : attachedMetadataFromSupport(support);
    }

    // Beta `BlockSign` standing variant: 16 rotation steps from the yaw.
    if (blockId === BlockIds.SignPost) {
      return Math.floor(((this.betaYawDegrees() + 180) * 16 / 360) + 0.5) & 15;
    }

    // Beta seeds a rail along the player's facing axis; onPlaced then
    // reconciles it against neighbours, which is what forms corners.
    if (blockId === BlockIds.Rail || blockId === BlockIds.PoweredRail || blockId === BlockIds.DetectorRail) {
      return railShapeFromPlayerYaw(this.betaYawDegrees());
    }

    // Beta `BlockStairs.onBlockPlacedBy`: stairs face the player.
    if (blockId === BlockIds.WoodStairs || blockId === BlockIds.CobblestoneStairs) {
      return stairFacingFromYaw(this.betaYawDegrees());
    }

    if (blockId === BlockIds.Ladder) {
      const support = supportDirectionFromHitFace(hit.face);
      if (support !== undefined) return attachedMetadataFromSupport(support);
    }

    if (blockId === BlockIds.RedstoneTorchOn || blockId === BlockIds.Torch) {
        if (hit.face.y === 1) return 5;
        const support = supportDirectionFromHitFace(hit.face);
        if (support !== undefined) return wallControlMetadataFromSupport(support);
    }

    if (blockId === BlockIds.StoneButton) {
      const support = supportDirectionFromHitFace(hit.face);
      if (support !== undefined) return wallControlMetadataFromSupport(support);
    }

    if (blockId === BlockIds.Lever) {
      if (hit.face.y === 1) return 5;
      const support = supportDirectionFromHitFace(hit.face);
      if (support !== undefined) return wallControlMetadataFromSupport(support);
    }

    // Dispenser direction: faces the clicked face (same encoding as piston).
    if (blockId === BlockIds.Dispenser) {
      const f = hit.face;
      if (f.y === 1) return 1;
      if (f.y === -1) return 0;
      if (f.z === -1) return 2;
      if (f.z === 1) return 3;
      if (f.x === -1) return 4;
      if (f.x === 1) return 5;
      return 3;
    }

    // Piston direction: extends in the direction of the clicked face normal.
    // 0=down, 1=up, 2=north(-Z), 3=south(+Z), 4=west(-X), 5=east(+X).
    if (blockId === BlockIds.PistonBase || blockId === BlockIds.PistonStickyBase) {
      const f = hit.face;
      if (f.y === 1) return 1;
      if (f.y === -1) return 0;
      if (f.z === -1) return 2;
      if (f.z === 1) return 3;
      if (f.x === -1) return 4;
      if (f.x === 1) return 5;
      return 1;
    }

    // Beta BlockRedstoneRepeater.onBlockPlacedBy: ((floor(yaw*4/360+0.5) & 3) + 2) % 4
    if (blockId === BlockIds.RedstoneRepeaterIdle) {
      return ((Math.floor(this.betaYawDegrees() * 4 / 360 + 0.5) & 3) + 2) % 4;
    }

    if (blockId === BlockIds.Trapdoor) {
      const support = supportDirectionFromHitFace(hit.face);
      if (support !== undefined) return trapdoorMetadataFromSupport(support);
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
