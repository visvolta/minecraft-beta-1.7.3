import { ChestContainer, type SerializedChest } from './ChestContainer';
import { InventorySerializer } from '../inventory/InventorySerializer';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import { BlockIds } from '../blocks/BlockId';

import { Chunk } from '../world/Chunk';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../world/chunkConstants';

import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';

export interface DoubleChestPair {
  readonly inventoryFirst: ChestContainer;
  readonly inventorySecond: ChestContainer;
  readonly visualLeft: ChestContainer;
  readonly visualRight: ChestContainer;
  readonly facing: number;
}

export class ChestManager {
  private readonly containers = new Map<string, ChestContainer>();

  public constructor(
    private readonly blockUpdateWorld: BlockUpdateWorld,
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

  public getPairDescriptor(x: number, y: number, z: number): DoubleChestPair | null {
    const c = this.get(x, y, z);
    if (!c) return null;

    const neighbors = [
      { nx: x - 1, nz: z },
      { nx: x + 1, nz: z },
      { nx: x, nz: z - 1 },
      { nx: x, nz: z + 1 },
    ];

    let foundNeighbor: ChestContainer | null = null;

    for (const { nx, nz } of neighbors) {
      const blockId = this.blockUpdateWorld.getBlock(nx, y, nz);
      if (blockId === BlockIds.Chest) {
        if (foundNeighbor !== null) {
          // More than one chest neighbor -> invalid (triple or L-shape)
          return null;
        }
        foundNeighbor = this.get(nx, y, nz) ?? null;
      }
    }

    if (!foundNeighbor) return null;

    // Validate that the neighbor doesn't have ANY OTHER chest neighbors
    let neighborOfNeighborCount = 0;
    const nNeighbors = [
      { nnx: foundNeighbor.x - 1, nnz: foundNeighbor.z },
      { nnx: foundNeighbor.x + 1, nnz: foundNeighbor.z },
      { nnx: foundNeighbor.x, nnz: foundNeighbor.z - 1 },
      { nnx: foundNeighbor.x, nnz: foundNeighbor.z + 1 },
    ];
    for (const { nnx, nnz } of nNeighbors) {
      if (this.blockUpdateWorld.getBlock(nnx, y, nnz) === BlockIds.Chest) {
        neighborOfNeighborCount++;
      }
    }

    if (neighborOfNeighborCount > 1) {
      return null;
    }

    if (c.facing !== foundNeighbor.facing) {
      return null;
    }

    let inventoryFirst = c;
    let inventorySecond = foundNeighbor;
    if (foundNeighbor.x < c.x || foundNeighbor.z < c.z) {
      inventoryFirst = foundNeighbor;
      inventorySecond = c;
    }

    let visualLeft = c;
    let visualRight = foundNeighbor;

    // Visual left/right depends on facing.
    // facing 2 (North/-Z): looking -Z, so visual right is +X. Left is -X.
    // facing 3 (South/+Z): looking +Z, so visual right is -X. Left is +X.
    // facing 4 (West/-X): looking -X, so visual right is -Z. Left is +Z.
    // facing 5 (East/+X): looking +X, so visual right is +Z. Left is -Z.
    if (c.facing === 2) {
      if (foundNeighbor.x < c.x) { visualLeft = foundNeighbor; visualRight = c; }
      else { visualLeft = c; visualRight = foundNeighbor; }
    } else if (c.facing === 3) {
      if (foundNeighbor.x > c.x) { visualLeft = foundNeighbor; visualRight = c; }
      else { visualLeft = c; visualRight = foundNeighbor; }
    } else if (c.facing === 4) {
      if (foundNeighbor.z > c.z) { visualLeft = foundNeighbor; visualRight = c; }
      else { visualLeft = c; visualRight = foundNeighbor; }
    } else if (c.facing === 5) {
      if (foundNeighbor.z < c.z) { visualLeft = foundNeighbor; visualRight = c; }
      else { visualLeft = c; visualRight = foundNeighbor; }
    }

    return {
      inventoryFirst,
      inventorySecond,
      visualLeft,
      visualRight,
      facing: inventoryFirst.facing,
    };
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
          {type:stack.identity.type,id:stack.identity.id,count:stack.count,metadata:stack.metadata,damage:stack.damage}
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
