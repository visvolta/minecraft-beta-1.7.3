import { Inventory } from '../inventory/Inventory';
import { InventorySerializer } from '../inventory/InventorySerializer';
import { DIMENSION_OVERWORLD, type DimensionId } from '../world/dimension/DimensionId';

/** Beta `TileEntityDispenser` holds nine slots. */
export const DISPENSER_SLOTS = 9;

export interface SerializedDispenser {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Dimension the dispenser belongs to; absent records load as the Overworld. */
  readonly dimension?: number;
  readonly inventory?: unknown[];
}

/**
 * Authoritative owner of every placed dispenser's 9-slot inventory.
 *
 * Mirrors {@link ChestManager}: keys are namespaced by dimension so a
 * dispenser at the same coordinates in the Overworld and the Nether are
 * distinct records. Facing is NOT stored here — it is block metadata, and
 * duplicating it in the TileEntity payload would let the two disagree.
 */
export class DispenserManager {
  private readonly containers = new Map<string, Inventory>();
  private dimension: DimensionId = DIMENSION_OVERWORLD;

  public setDimension(dimension: DimensionId): void {
    this.dimension = dimension;
  }

  public getDimension(): DimensionId {
    return this.dimension;
  }

  private key(x: number, y: number, z: number): string {
    return `${this.dimension}:${x},${y},${z}`;
  }

  public getOrCreate(x: number, y: number, z: number): Inventory {
    const k = this.key(x, y, z);
    let inventory = this.containers.get(k);
    if (inventory === undefined) {
      inventory = new Inventory(DISPENSER_SLOTS, false);
      this.containers.set(k, inventory);
    }
    return inventory;
  }

  public get(x: number, y: number, z: number): Inventory | undefined {
    return this.containers.get(this.key(x, y, z));
  }

  public remove(x: number, y: number, z: number): void {
    this.containers.delete(this.key(x, y, z));
  }

  public serialize(): SerializedDispenser[] {
    const list: SerializedDispenser[] = [];
    for (const [key, inventory] of this.containers) {
      const coords = key.slice(key.indexOf(':') + 1).split(',').map(Number);
      const [x, y, z] = coords;
      if (x === undefined || y === undefined || z === undefined) continue;
      list.push({
        x, y, z,
        dimension: this.dimension,
        inventory: InventorySerializer.serialize(inventory).inventory,
      });
    }
    return list;
  }

  /** Rebuilds this dimension's dispensers; records for others are skipped. */
  public deserialize(data?: SerializedDispenser[]): void {
    this.containers.clear();
    if (!Array.isArray(data)) return;
    for (const record of data) {
      const recordDimension = Number.isInteger(record.dimension) ? (record.dimension as number) : DIMENSION_OVERWORLD;
      if (recordDimension !== this.dimension) continue;
      if (!Number.isFinite(record.x) || !Number.isFinite(record.y) || !Number.isFinite(record.z)) continue;
      const inventory = new Inventory(DISPENSER_SLOTS, false);
      InventorySerializer.deserialize(inventory, record.inventory as never);
      this.containers.set(this.key(record.x, record.y, record.z), inventory);
    }
  }
}
