import type { DimensionDefinition } from './DimensionDefinition';
import { isValidDimensionId, type DimensionId } from './DimensionId';

/**
 * Registry of every known dimension.
 *
 * Mirrors `BlockRegistry`'s shape (register / get / values, duplicate
 * rejection) so it behaves the way the rest of the project already does.
 * Nothing here special-cases dimension 0 or -1: registering a custom
 * dimension later requires no engine changes.
 */
export class DimensionRegistry {
  private readonly byId = new Map<DimensionId, DimensionDefinition>();
  private readonly byName = new Map<string, DimensionDefinition>();

  public register(definition: DimensionDefinition): void {
    if (!isValidDimensionId(definition.id)) {
      throw new Error(`Dimension id must be an integer; received ${String(definition.id)}.`);
    }
    if (this.byId.has(definition.id)) {
      throw new Error(
        `Dimension id ${definition.id} is already registered as "${this.byId.get(definition.id)?.name}".`,
      );
    }
    if (this.byName.has(definition.name)) {
      throw new Error(
        `Dimension name "${definition.name}" is already registered as id ${this.byName.get(definition.name)?.id}.`,
      );
    }
    if (definition.coordinateScale <= 0) {
      throw new Error(`Dimension "${definition.name}" must have a positive coordinateScale.`);
    }

    this.byId.set(definition.id, definition);
    this.byName.set(definition.name, definition);
  }

  public get(id: DimensionId): DimensionDefinition | undefined {
    return this.byId.get(id);
  }

  /** Throws when the id is unknown; use for paths that cannot proceed without it. */
  public require(id: DimensionId): DimensionDefinition {
    const definition = this.byId.get(id);
    if (definition === undefined) throw new Error(`No dimension registered with id ${id}.`);
    return definition;
  }

  public getByName(name: string): DimensionDefinition | undefined {
    return this.byName.get(name);
  }

  public has(id: DimensionId): boolean {
    return this.byId.has(id);
  }

  public values(): DimensionDefinition[] {
    return [...this.byId.values()];
  }

  public get size(): number {
    return this.byId.size;
  }
}

/**
 * Horizontal coordinate transform between two dimensions.
 *
 * Beta's client divides X/Z by 8 entering the Nether and multiplies by 8
 * leaving it, preserving Y. Expressing that as a ratio of per-dimension
 * scales means a custom dimension can define its own relationship without
 * touching travel code.
 */
export function convertCoordinate(
  value: number,
  sourceScale: number,
  destinationScale: number,
): number {
  return value * (sourceScale / destinationScale);
}
