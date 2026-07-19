import { Inventory } from '../inventory/Inventory';

export interface SerializedChest {
  x: number;
  y: number;
  z: number;
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
