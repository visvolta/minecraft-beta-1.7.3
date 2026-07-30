
import { Chunk } from '../world/Chunk';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { BlockIds } from '../blocks/BlockId';
import { DIMENSION_OVERWORLD, type DimensionId } from '../world/dimension/DimensionId';

export interface SerializedSign {
  x: number;
  y: number;
  z: number;
  /** Dimension the sign belongs to; absent records load as the Overworld. */
  dimension?: number;
  /** Exact four lines of sign text; never trimmed or re-encoded. */
  lines: string[];
}

export class SignContainer {
  public lines: string[] = ['', '', '', ''];
  public needsTextureUpdate = true;
  public constructor(public readonly x: number, public readonly y: number, public readonly z: number) {}
  public getPosKey(): string { return `${this.x},${this.y},${this.z}`; }
}

export class SignManager {
  /** Dimension owning these signs; namespaces every key. */
  private dimension: DimensionId = DIMENSION_OVERWORLD;

  /** Rebinds to a dimension. Callers must re-hydrate afterwards. */
  public setDimension(dimension: DimensionId): void {
    this.dimension = dimension;
  }

  public getDimension(): DimensionId {
    return this.dimension;
  }

  private key(x: number, y: number, z: number): string {
    return `${this.dimension}:${x},${y},${z}`;
  }

  private readonly containers = new Map<string, SignContainer>();

  public getOrCreate(x: number, y: number, z: number): SignContainer {
    const key = this.key(x, y, z);
    let c = this.containers.get(key);
    if (!c) {
      c = new SignContainer(x, y, z);
      this.containers.set(key, c);
    }
    return c;
  }

  public get(x: number, y: number, z: number): SignContainer | undefined {
    return this.containers.get(this.key(x, y, z));
  }

  public getContainers(): ReadonlyArray<SignContainer> {
    return Array.from(this.containers.values());
  }

  public remove(x: number, y: number, z: number): void {
    this.containers.delete(this.key(x, y, z));
  }

  public synchronizeChunk(chunkX: number, chunkZ: number, chunk: Chunk): void {
    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);
          const worldX = chunkX * CHUNK_SIZE_X + x;
          const worldZ = chunkZ * CHUNK_SIZE_Z + z;
          const key = this.key(worldX, y, worldZ);

          if (blockId === BlockIds.SignPost || blockId === BlockIds.WallSign) {
            if (!this.containers.has(key)) {
              this.getOrCreate(worldX, y, worldZ);
            }
          } else {
            if (this.containers.has(key)) {
              this.containers.delete(key);
            }
          }
        }
      }
    }
  }

  public serialize(): SerializedSign[] {
    const list: SerializedSign[] = [];
    for (const c of this.containers.values()) {
      list.push({
        x: c.x,
        y: c.y,
        z: c.z,
        dimension: this.dimension,
        // Copied verbatim: sign text must survive the schema change byte for byte.
        lines: [...c.lines],
      });
    }
    return list;
  }

  public deserialize(data?: SerializedSign[]): void {
    this.containers.clear();
    if (!data) return;

    for (const d of data) {
      // Pre-isolation records carry no dimension and belong to the Overworld.
      const recordDimension = Number.isInteger(d.dimension) ? (d.dimension as number) : DIMENSION_OVERWORLD;
      if (recordDimension !== this.dimension) continue;
      const c = new SignContainer(d.x, d.y, d.z);
      // Preserve all four lines exactly, including empty strings.
      c.lines = Array.isArray(d.lines) ? [...d.lines] : ['', '', '', ''];
      this.containers.set(this.key(c.x, c.y, c.z), c);
    }
  }
}
