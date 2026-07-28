import { DIMENSION_OVERWORLD, dimensionToken, type DimensionId } from './DimensionId';

/**
 * Dimension-aware persistence naming.
 *
 * BACKWARD COMPATIBILITY IS LOAD-BEARING: dimension 0 must produce byte-for-
 * byte the same keys the project used before dimensions existed, so every
 * pre-existing Overworld save opens with no migration pass. Only non-zero
 * dimensions get a namespace prefix.
 *
 *   overworld chunk   -> "<x>,<z>"                (unchanged)
 *   nether chunk      -> "dim:-1:<x>,<z>"
 *   overworld record  -> "<key>"                  (unchanged)
 *   nether record     -> "dim:-1:<key>"
 *
 * Everything that can collide on coordinates must route through here: chunk
 * records, entity records, scheduled ticks, containers, signs, spawners and
 * portal indexes. Concatenating these strings ad hoc elsewhere is exactly how
 * a Nether chunk ends up overwriting Overworld (0,0).
 */

/** Prefix applied to every non-Overworld persistence name. */
export function dimensionNamespace(dimension: DimensionId): string {
  return dimension === DIMENSION_OVERWORLD ? '' : `dim:${dimensionToken(dimension)}:`;
}

/**
 * Namespaces an arbitrary persistence sub-key (records, containers, indexes).
 * Dimension 0 returns the input untouched.
 */
export function dimensionScopedKey(dimension: DimensionId, key: string): string {
  return `${dimensionNamespace(dimension)}${key}`;
}

/**
 * Chunk coordinate component of a persistence key, namespaced by dimension.
 *
 * The storage backend composes this into its own `world/<id>/chunk/<coords>`
 * layout, so dimension 0 keeps producing the historical `"<x>,<z>"` form.
 */
export function dimensionChunkCoordKey(dimension: DimensionId, chunkX: number, chunkZ: number): string {
  return `${dimensionNamespace(dimension)}${chunkX},${chunkZ}`;
}

/** True when this dimension uses the legacy (un-namespaced) key layout. */
export function usesLegacyKeyLayout(dimension: DimensionId): boolean {
  return dimension === DIMENSION_OVERWORLD;
}
