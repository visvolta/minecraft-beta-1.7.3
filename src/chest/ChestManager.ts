import { ChestContainer, type SerializedChest } from './ChestContainer';
import { InventorySerializer } from '../inventory/InventorySerializer';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import { BlockIds } from '../blocks/BlockId';

import { Chunk } from '../world/Chunk';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../world/chunkConstants';

export class ChestManager {
  private readonly containers = new Map<string, ChestContainer>();

  public constructor(
    private readonly itemEntityManager: ItemEntityManager
  ) {}

  public getOrCreate(x: number, y: number, z: number, facing = 3): ChestContainer {
    const key = `${x},${y},${z}`;
    let c = this.containers.get(key);
    if (!c) {
      c = new ChestContainer(x, y, z, facing);
      this.containers.set(key, c);
    } else if (c.facing !== facing && facing >= 2 && facing <= 5) {
      c.facing = facing;
    }
    return c;
  }

  public synchronizeChunk(chunkX: number, chunkZ: number, chunk: Chunk): void {
    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);
          const worldX = chunkX * CHUNK_SIZE_X + x;
          const worldZ = chunkZ * CHUNK_SIZE_Z + z;
          const key = `${worldX},${y},${worldZ}`;

          if (blockId === BlockIds.Chest) {
            if (!this.containers.has(key)) {
              // Create missing state when real chest block exists
              const metadata = chunk.getBlockMetadata(x, y, z);
              this.getOrCreate(worldX, y, worldZ, metadata || 3);
            }
          } else {
            // Remove state if block is not a chest
            if (this.containers.has(key)) {
              this.containers.delete(key);
            }
          }
        }
      }
    }
  }

  public get(x: number, y: number, z: number): ChestContainer | undefined {
    return this.containers.get(`${x},${y},${z}`);
  }

  public getContainers(): ReadonlyArray<ChestContainer> {
    return Array.from(this.containers.values());
  }

  public update(): void {
    for (const container of this.containers.values()) {
      container.prevLidAngle = container.lidAngle;

      const isOpen = container.viewerCount > 0;
      let targetAngle = isOpen ? 1.0 : 0.0;

      if (container.lidAngle < targetAngle) {
        container.lidAngle += 0.1;
        if (container.lidAngle > targetAngle) {
          container.lidAngle = targetAngle;
        }
      } else if (container.lidAngle > targetAngle) {
        container.lidAngle -= 0.1;
        if (container.lidAngle < targetAngle) {
          container.lidAngle = targetAngle;
        }
      }
    }
  }

  public breakChest(x: number, y: number, z: number): void {
    const key = `${x},${y},${z}`;
    const container = this.containers.get(key);
    if (!container) return;

    // Safety guard so it's not dropped twice
    this.containers.delete(key);

    // Drop all items
    const slots = container.inventory.getSlots();
    for (let i = 0; i < slots.length; i++) {
      const stack = slots[i];
      if (stack !== null && stack !== undefined && stack.count > 0) {
        // Scatter using existing item scatter velocity
        this.itemEntityManager.spawnItem(
          x + 0.5, y + 0.5, z + 0.5,
          { type: stack.identity.type, id: stack.identity.id, count: stack.count, metadata: stack.metadata }
        );
      }
    }
  }

  public serialize(): SerializedChest[] {
    const list: SerializedChest[] = [];
    for (const c of this.containers.values()) {
      const s = InventorySerializer.serialize(c.inventory);
      list.push({
        x: c.x,
        y: c.y,
        z: c.z,
        facing: c.facing,
        inventory: s.inventory,
      });
    }
    return list;
  }

  public deserialize(data?: SerializedChest[]): void {
    this.containers.clear();
    if (!data) return;

    for (const d of data) {
      const c = new ChestContainer(d.x, d.y, d.z, d.facing ?? 3);
      InventorySerializer.deserialize(c.inventory, d.inventory);
      this.containers.set(c.getPosKey(), c);
    }
  }
}
