/**
 * Authoritative spawn-egg descriptor registry.
 *
 * One descriptor per spawnable living mob. Provides:
 * - primary/secondary tint colors (modern reference colors)
 * - reference to the entity registry string/numeric id
 * - display name
 *
 * This is the single source of truth for spawn-egg data. It is consumed by:
 * - SpawnEgg item rendering (icon tinting)
 * - Creative inventory source (names, colors)
 * - Spawn-egg use behavior (entity factory lookup)
 * - Command entity lookup (/summon, future commands)
 */

import type { EntityTypeId } from './core/EntityType';

export interface SpawnEggDescriptor {
  readonly entityStringId: string;
  readonly entityNumericId: EntityTypeId;
  /** The mob's own name, e.g. "Zombie Pigman". Never includes "Spawn Egg". */
  readonly displayName: string;
  /**
   * The egg's item name. Defaults to `<displayName> Spawn Egg`, so a future
   * custom entity gets a correct name for free; set it only to override.
   */
  readonly itemName: string;
  readonly primaryColor: string;   // hex, base egg tint
  readonly secondaryColor: string; // hex, overlay/spot tint
}

/** Derives the Beta-style egg item name from a mob's display name. */
export function spawnEggItemName(displayName: string): string {
  return `${displayName} Spawn Egg`;
}

/** Modern reference spawn-egg colors (post-12w01a authoritative palette). */
export const SPAWN_EGG_COLORS: Readonly<Record<string, { primary: string; secondary: string }>> = {
  Zombie: { primary: '#00AFAF', secondary: '#799C65' },
  Skeleton: { primary: '#C1C1C1', secondary: '#494949' },
  Creeper: { primary: '#0DA70B', secondary: '#000000' },
  Spider: { primary: '#342D27', secondary: '#AB0E0E' },
  Slime: { primary: '#51A03E', secondary: '#7EBF6E' },
  Pig: { primary: '#F0A5A2', secondary: '#DB635F' },
  Cow: { primary: '#443626', secondary: '#A1A1A1' },
  Sheep: { primary: '#E7E7E7', secondary: '#FFB5B5' },
  Chicken: { primary: '#A1A1A1', secondary: '#FF0000' },
  Squid: { primary: '#223B4D', secondary: '#708899' },
  Wolf: { primary: '#D7D3D3', secondary: '#CEAF96' },
  PigZombie: { primary: '#EA9393', secondary: '#4C7129' },
  Ghast: { primary: '#F9F9F9', secondary: '#BCBCBC' },
};

/** Central descriptor registry derived from the entity registry and color reference. */
export function buildSpawnEggDescriptorRegistry(): Readonly<Record<string, SpawnEggDescriptor>> {
  const descriptors: Record<string, SpawnEggDescriptor> = {};

  const entries: Array<{ id: string; numeric: number; name: string; itemName?: string }> = [
    { id: 'Zombie', numeric: 7, name: 'Zombie' },
    { id: 'Skeleton', numeric: 8, name: 'Skeleton' },
    { id: 'Creeper', numeric: 10, name: 'Creeper' },
    { id: 'Spider', numeric: 9, name: 'Spider' },
    { id: 'Slime', numeric: 22, name: 'Slime' },
    { id: 'Pig', numeric: 3, name: 'Pig' },
    { id: 'Cow', numeric: 4, name: 'Cow' },
    { id: 'Sheep', numeric: 5, name: 'Sheep' },
    { id: 'Chicken', numeric: 6, name: 'Chicken' },
    { id: 'Squid', numeric: 23, name: 'Squid' },
    { id: 'Wolf', numeric: 24, name: 'Wolf' },
    { id: 'PigZombie', numeric: 19, name: 'Zombie Pigman' },
    { id: 'Ghast', numeric: 20, name: 'Ghast' },
  ];

  for (const entry of entries) {
    const colors = SPAWN_EGG_COLORS[entry.id];
    if (!colors) {
      throw new Error(`No spawn egg colors defined for ${entry.id}`);
    }
    descriptors[entry.id] = {
      entityStringId: entry.id,
      entityNumericId: entry.numeric as EntityTypeId,
      displayName: entry.name,
      // Auto-derived unless the entry explicitly overrides it.
      itemName: entry.itemName ?? spawnEggItemName(entry.name),
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
    };
  }

  return descriptors;
}

export const DEFAULT_SPAWN_EGG_DESCRIPTORS = buildSpawnEggDescriptorRegistry();

/** Reverse index: entity numeric id (spawn-egg metadata) → descriptor. */
const BY_NUMERIC_ID: ReadonlyMap<number, SpawnEggDescriptor> = new Map(
  Object.values(DEFAULT_SPAWN_EGG_DESCRIPTORS).map((d) => [d.entityNumericId as number, d]),
);

/** Looks up a spawn-egg descriptor by the metadata value stored on the stack. */
export function spawnEggDescriptorByNumericId(numericId: number): SpawnEggDescriptor | undefined {
  return BY_NUMERIC_ID.get(numericId);
}
