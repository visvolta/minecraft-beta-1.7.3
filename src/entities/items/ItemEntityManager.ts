import * as THREE from 'three';
import { DroppedItemEntity } from './DroppedItemEntity';
import type { ChunkManager } from '../../world/ChunkManager';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import type { TextureAtlas } from '../../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../../assets/ItemTextureAtlas';
import type { Player } from '../../player/Player';
import type { Drop } from './BlockDropResolver';
import type { Inventory } from '../../inventory/Inventory';

export class ItemEntityManager {
  private readonly scene: THREE.Scene;
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly atlas: TextureAtlas;
  private readonly itemAtlas: ItemTextureAtlas;
  private readonly heldBlockMaterial: THREE.Material;
  private readonly itemHeldMaterial: THREE.Material;
  private readonly inventory: Inventory;

  private readonly items: DroppedItemEntity[] = [];

  public constructor(
    scene: THREE.Scene,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    _blockUpdateWorld: BlockUpdateWorld,
    atlas: TextureAtlas,
    itemAtlas: ItemTextureAtlas,
    _buildBlockGeometry: (id: number) => THREE.BufferGeometry,
    heldBlockMaterial: THREE.Material,
    itemHeldMaterial: THREE.Material,
    inventory: Inventory,
  ) {
    this.scene = scene;
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
    this.atlas = atlas;
    this.itemAtlas = itemAtlas;
    this.heldBlockMaterial = heldBlockMaterial;
    this.itemHeldMaterial = itemHeldMaterial;
    this.inventory = inventory;
  }

  /**
   * Spawns a new dropped-item entity at the given coordinates.
   */
  public spawnItem(
    x: number,
    y: number,
    z: number,
    drop: Drop,
    delay = 10,
  ): void {
    const item = new DroppedItemEntity(
      this.scene,
      this.chunkManager,
      this.blockRegistry,
      this.atlas,
      this.itemAtlas,
      this.heldBlockMaterial,
      this.itemHeldMaterial,
      x,
      y,
      z,
      drop,
      delay
    );
    this.items.push(item);
  }

  /**
   * Spawns a new thrown dropped-item entity with specific initial velocities.
   */
  public spawnThrownItem(
    x: number,
    y: number,
    z: number,
    drop: Drop,
    motionX: number,
    motionY: number,
    motionZ: number,
    delay = 40,
  ): void {
    const item = new DroppedItemEntity(
      this.scene,
      this.chunkManager,
      this.blockRegistry,
      this.atlas,
      this.itemAtlas,
      this.heldBlockMaterial,
      this.itemHeldMaterial,
      x,
      y,
      z,
      drop,
      delay
    );
    item.velocity.x = motionX;
    item.velocity.y = motionY;
    item.velocity.z = motionZ;
    this.items.push(item);
  }

  /**
   * Simulates a single fixed 20Hz authoritative tick.
   * Resolves item movement, friction, lifetime despawns, and player pickups.
   */
  public tick(player: Player): void {
    // 1. Process tick for each item
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.tick();

      if (item.isDead) {
        item.cleanup();
        this.items.splice(i, 1);
      }
    }

    // 2. Exact player collision check
    // Player's bounding box is expanded by 1.0 block horizontally (X/Z) and 0.5 block vertically (Y)
    const pickupBox = player.getAABB().expand(1.0, 0.5, 1.0);

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      if (item.isDead) continue;

      if (item.delayBeforeCanPickup === 0) {
        if (item.getAABB().intersects(pickupBox)) {
          // Attempt atomic insertion into player inventory
          const accepted = this.inventory.insert(
            item.drop.type,
            item.drop.id,
            item.drop.count,
            item.drop.metadata
          );

          if (accepted > 0) {
            const remainder = item.drop.count - accepted;
            if (remainder <= 0) {
              // Entire stack collected
              item.isDead = true;
              this.triggerPickup(item.drop.type, item.drop.id, accepted, item.drop.metadata);
              item.cleanup();
              this.items.splice(i, 1);
            } else {
              // Partial stack accepted, keep remainder in the world entity
              const mutableDrop = item.drop as any;
              mutableDrop.count = remainder;
              this.triggerPickup(item.drop.type, item.drop.id, accepted, item.drop.metadata);
              item.rebuildVisualsForCount(remainder);
            }
          }
        }
      }
    }
  }

  /**
   * Updates visual rendering (rotation and bobbing) for smooth interpolation.
   */
  public updateVisuals(): void {
    for (const item of this.items) {
      item.updateVisuals();
    }
  }

  private triggerPickup(type: 'block' | 'item', id: number | string, count: number, metadata: number): void {
    let displayName = 'Unknown';
    if (type === 'block') {
      const def = this.blockRegistry.getById(id as number);
      displayName = def?.displayName ?? 'Block';
    } else {
      displayName = (id as string)
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }

    // Format exact concise pickup debug log
    console.log(
      `[PICKUP DEBUG] Collected: ${displayName} (ID: ${id}) | Quantity: ${count} | Metadata: ${metadata}`
    );

    // Create fading visual toast on the HUD
    this.createDomToast(displayName, count);
  }

  private createDomToast(name: string, count: number): void {
    let container = document.getElementById('pickup-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pickup-toast-container';
      container.style.position = 'absolute';
      container.style.bottom = '100px';
      container.style.right = '20px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      container.style.zIndex = '1000';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.background = 'rgba(0, 0, 0, 0.85)';
    toast.style.color = '#79C05A'; // Classic green text
    toast.style.border = '2px solid #555';
    toast.style.padding = '8px 16px';
    toast.style.fontFamily = 'monospace';
    toast.style.fontSize = '14px';
    toast.style.borderRadius = '4px';
    toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
    toast.style.pointerEvents = 'none';
    toast.innerHTML = `+${count} ${name}`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s ease';
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 2500);
  }

  public cleanup(): void {
    for (const item of this.items) {
      item.cleanup();
    }
    this.items.length = 0;
  }
}
