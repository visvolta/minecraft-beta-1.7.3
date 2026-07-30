import { Inventory } from '../inventory/Inventory';

export interface SerializedChest {
  x: number;
  y: number;
  z: number;
  /**
   * Dimension the chest belongs to. Absent in saves written before container
   * dimension isolation existed; those records load as the Overworld (0).
   *
   * Without this, a chest at the same coordinates in the Overworld and the
   * Nether shared one key and silently overwrote each other.
   */
  dimension?: number;
  facing: number;
  inventory?: any[]; // We will cast this
}

export class ChestContainer {
  public readonly x: number;
  public readonly y: number;
  public readonly z: number;
  public facing: number;
  
  public readonly inventory: Inventory;

  // Runtime only
  public viewerCount = 0;
  public lidAngle = 0;
  public prevLidAngle = 0;

  public constructor(x: number, y: number, z: number, facing: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.facing = facing;
    this.inventory = new Inventory(27, false);
  }

  public getPosKey(): string {
    return `${this.x},${this.y},${this.z}`;
  }
}
