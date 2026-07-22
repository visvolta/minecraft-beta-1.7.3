import type { NbtCompound } from '../../persistence/nbt/Nbt';
import type { Entity } from './Entity';
import type { EntityWorldContext } from './EntityContext';

/**
 * Stable numeric entity-type identifiers for this project's save format.
 *
 * These are *our* registry ids, not Beta's internal entity ids (Beta assigns
 * its own numbers in EntityList). They only need to be stable and unique
 * within this codebase; the human-readable string id below is what travels in
 * the NBT `id` field, matching Beta's `EntityList` string keys.
 */
export const EntityTypeIds = {
  DroppedItem: 1,
  FallingBlock: 2,
  Pig: 3,
  Cow: 4,
  Sheep: 5,
  Chicken: 6,
  Zombie: 7,
  Skeleton: 8,
  Spider: 9,
  Creeper: 10,
  Arrow: 11,
  PrimedTnt: 12,
  Minecart: 13,
} as const;

export type EntityTypeId = (typeof EntityTypeIds)[keyof typeof EntityTypeIds];

/**
 * Reconstructs an entity of a given type from its saved NBT compound.
 * Implementations read both the shared base fields and their type-specific
 * data. Returning `undefined` signals an unrecoverable/unknown record, which
 * the loader skips safely rather than throwing.
 */
export type EntityDeserializer = (ctx: EntityWorldContext, data: NbtCompound) => Entity | undefined;

interface EntityTypeEntry {
  readonly numericId: EntityTypeId;
  readonly stringId: string;
  readonly deserialize: EntityDeserializer;
}

/**
 * Registry mapping entity string ids and numeric ids to their deserialiser,
 * mirroring Beta's `EntityList` (addMapping / createEntityFromNBT). Unknown
 * ids are reported, never fatal — the loader simply skips such records.
 */
export class EntityTypeRegistry {
  private readonly byNumeric = new Map<number, EntityTypeEntry>();
  private readonly byString = new Map<string, EntityTypeEntry>();

  public register(numericId: EntityTypeId, stringId: string, deserialize: EntityDeserializer): void {
    const entry: EntityTypeEntry = { numericId, stringId, deserialize };
    this.byNumeric.set(numericId, entry);
    this.byString.set(stringId, entry);
  }

  public getStringId(numericId: number): string | undefined {
    return this.byNumeric.get(numericId)?.stringId;
  }

  public getNumericId(stringId: string): number | undefined {
    return this.byString.get(stringId)?.numericId;
  }

  /** Creates an entity from an NBT record keyed by its string `id`. */
  public create(stringId: string, ctx: EntityWorldContext, data: NbtCompound): Entity | undefined {
    const entry = this.byString.get(stringId);
    if (entry === undefined) {
      return undefined;
    }
    return entry.deserialize(ctx, data);
  }

  public has(stringId: string): boolean {
    return this.byString.has(stringId);
  }
}

/**
 * Builds and registers the default entity types. Called once during Engine
 * construction. Kept here (rather than inline) so the registry wiring is easy
 * to review and extend in later stages.
 */
export function createDefaultEntityTypeRegistry(): EntityTypeRegistry {
  const registry = new EntityTypeRegistry();
  // Registrations are added by the entity modules to avoid a circular import
  // through this file; see `registerEntityTypes` in EntityManager wiring.
  return registry;
}
