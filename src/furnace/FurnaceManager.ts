import { FurnaceContainer } from './FurnaceContainer';
import type { SmeltingRegistry } from './SmeltingRegistry';
import type { FuelRegistry } from './FuelRegistry';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';
import { BlockIds } from '../blocks/BlockId';
import { ItemStack } from '../inventory/ItemStack';
import type { SerializedItemStack } from '../persistence/metadata/WorldMetadata';

export interface SerializedFurnace {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing?: number;
  readonly remainingBurnTime: number;
  readonly totalBurnTime: number;
  readonly smeltProgress: number;
  readonly inputSlot?: SerializedItemStack | null;
  readonly fuelSlot?: SerializedItemStack | null;
  readonly outputSlot?: SerializedItemStack | null;
}

/**
 * Authoritative manager owning all placed furnace containers across the world (`Keep furnace state authoritative`).
 */
export class FurnaceManager {
  private readonly containers = new Map<string, FurnaceContainer>();

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  public getOrCreate(x: number, y: number, z: number, facing = 3): FurnaceContainer {
    const k = this.key(x, y, z);
    let c = this.containers.get(k);
    if (!c) {
      c = new FurnaceContainer(x, y, z, facing);
      this.containers.set(k, c);
    } else if (facing !== undefined && c.facing !== facing && facing >= 2 && facing <= 5) {
      c.facing = facing;
    }
    return c;
  }

  public get(x: number, y: number, z: number): FurnaceContainer | undefined {
    return this.containers.get(this.key(x, y, z));
  }

  public remove(x: number, y: number, z: number): FurnaceContainer | undefined {
    const k = this.key(x, y, z);
    const c = this.containers.get(k);
    if (c) {
      this.containers.delete(k);
    }
    return c;
  }

  public getContainers(): ReadonlyArray<FurnaceContainer> {
    return Array.from(this.containers.values());
  }

  public tick(
    blockUpdateWorld: BlockUpdateWorld,
    smeltingRegistry: SmeltingRegistry,
    fuelRegistry: FuelRegistry
  ): void {
    for (const c of Array.from(this.containers.values())) {
      if (!blockUpdateWorld.isLoaded(c.x, c.z)) {
        continue; // Unloaded chunks pause processing safely
      }

      const id = blockUpdateWorld.getBlock(c.x, c.y, c.z);
      if (id !== BlockIds.Furnace && id !== BlockIds.FurnaceBurning) {
        this.containers.delete(this.key(c.x, c.y, c.z));
        continue;
      }

      const stateChanged = c.tick(smeltingRegistry, fuelRegistry);
      if (stateChanged) {
        const newId = c.isBurning() ? BlockIds.FurnaceBurning : BlockIds.Furnace;
        if (id !== newId) {
          blockUpdateWorld.setBlock(c.x, c.y, c.z, newId, {
            reason: 'world',
            notifyNeighbours: true,
            updateLighting: true,
          });
          blockUpdateWorld.setBlockMetadata(c.x, c.y, c.z, c.facing, { affectsMesh: true });
        }
      }
    }
  }

  public serialize(): SerializedFurnace[] {
    return Array.from(this.containers.values()).map((c) => ({
      x: c.x,
      y: c.y,
      z: c.z,
      facing: c.facing,
      remainingBurnTime: c.remainingBurnTime,
      totalBurnTime: c.totalBurnTime,
      smeltProgress: c.smeltProgress,
      inputSlot: c.inputSlot
        ? {
            id: c.inputSlot.identity.id,
            type: c.inputSlot.identity.type,
            count: c.inputSlot.count,
            metadata: c.inputSlot.metadata,
          }
        : null,
      fuelSlot: c.fuelSlot
        ? {
            id: c.fuelSlot.identity.id,
            type: c.fuelSlot.identity.type,
            count: c.fuelSlot.count,
            metadata: c.fuelSlot.metadata,
          }
        : null,
      outputSlot: c.outputSlot
        ? {
            id: c.outputSlot.identity.id,
            type: c.outputSlot.identity.type,
            count: c.outputSlot.count,
            metadata: c.outputSlot.metadata,
          }
        : null,
    }));
  }

  public deserialize(data?: SerializedFurnace[]): void {
    this.containers.clear();
    if (!data || !Array.isArray(data)) return;

    for (const d of data) {
      if (
        typeof d.x !== 'number' ||
        typeof d.y !== 'number' ||
        typeof d.z !== 'number' ||
        !Number.isFinite(d.x) ||
        !Number.isFinite(d.y) ||
        !Number.isFinite(d.z)
      ) {
        continue;
      }

      const c = new FurnaceContainer(d.x, d.y, d.z, d.facing ?? 3);
      c.remainingBurnTime = Number.isFinite(d.remainingBurnTime) ? Math.max(0, d.remainingBurnTime) : 0;
      c.totalBurnTime = Number.isFinite(d.totalBurnTime) ? Math.max(0, d.totalBurnTime) : 0;
      c.smeltProgress = Number.isFinite(d.smeltProgress) ? Math.max(0, d.smeltProgress) : 0;

      if (d.inputSlot && d.inputSlot.id !== undefined && d.inputSlot.count > 0 && d.inputSlot.type) {
        c.inputSlot = new ItemStack(d.inputSlot.id, d.inputSlot.type, d.inputSlot.count, d.inputSlot.metadata ?? 0);
      }
      if (d.fuelSlot && d.fuelSlot.id !== undefined && d.fuelSlot.count > 0 && d.fuelSlot.type) {
        c.fuelSlot = new ItemStack(d.fuelSlot.id, d.fuelSlot.type, d.fuelSlot.count, d.fuelSlot.metadata ?? 0);
      }
      if (d.outputSlot && d.outputSlot.id !== undefined && d.outputSlot.count > 0 && d.outputSlot.type) {
        c.outputSlot = new ItemStack(d.outputSlot.id, d.outputSlot.type, d.outputSlot.count, d.outputSlot.metadata ?? 0);
      }

      this.containers.set(this.key(c.x, c.y, c.z), c);
    }
  }

  public clear(): void {
    this.containers.clear();
  }
}
