import type { BlockDefinition } from './BlockDefinition';
import type { BlockId } from './BlockId';

/**
 * Central store of block definitions.
 * Data only — no chunks, rendering, physics, or gameplay.
 */
export class BlockRegistry {
  private readonly byId = new Map<BlockId, BlockDefinition>();
  private readonly byName = new Map<string, BlockDefinition>();

  public register(definition: BlockDefinition): void {
    if (this.byId.has(definition.id)) {
      throw new Error(
        `Block ID ${definition.id} is already registered as "${this.byId.get(definition.id)?.name}".`,
      );
    }

    if (this.byName.has(definition.name)) {
      throw new Error(
        `Block name "${definition.name}" is already registered as ID ${this.byName.get(definition.name)?.id}.`,
      );
    }

    this.byId.set(definition.id, definition);
    this.byName.set(definition.name, definition);
  }

  public getById(id: BlockId): BlockDefinition | undefined {
    return this.byId.get(id);
  }

  public getByName(name: string): BlockDefinition | undefined {
    return this.byName.get(name);
  }

  public hasId(id: BlockId): boolean {
    return this.byId.has(id);
  }

  public hasName(name: string): boolean {
    return this.byName.has(name);
  }

  public get size(): number {
    return this.byId.size;
  }
}
