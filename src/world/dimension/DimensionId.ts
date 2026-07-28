/**
 * Numeric dimension identity, matching Beta's `WorldProvider.worldType` /
 * `Entity.dimension` values: 0 = Overworld, -1 = Nether.
 *
 * Deliberately a plain number rather than an enum so custom dimensions
 * registered later are first-class and nothing keys on a closed set.
 */
export type DimensionId = number;

/** Beta's Overworld dimension id. */
export const DIMENSION_OVERWORLD: DimensionId = 0;

/** Beta's Nether dimension id (`WorldProviderHell.worldType = -1`). */
export const DIMENSION_NETHER: DimensionId = -1;

/**
 * Every dimension a chunk/entity/record can belong to is also part of the
 * persistence key space, so ids must be stable, integral and printable.
 */
export function isValidDimensionId(value: unknown): value is DimensionId {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Canonical short token used in persistence keys and debug output.
 * Negative ids keep their sign (`-1`), so the token is unambiguous.
 */
export function dimensionToken(id: DimensionId): string {
  return String(id);
}
