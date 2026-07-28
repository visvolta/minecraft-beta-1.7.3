import type { MusicContext } from '../../audio/AudioManager';
import type { WorldGenerator } from '../WorldGenerator';
import type { DimensionId } from './DimensionId';

/**
 * Lighting rules a dimension imposes on the shared light pipeline.
 *
 * Beta expresses these through `WorldProvider`: the Overworld has skylight and
 * a 0.05 brightness floor, while `WorldProviderHell` sets `hasNoSky = true`
 * and raises the floor to 0.1 in its overridden `generateLightBrightnessTable`.
 */
export interface DimensionLightingRules {
  /**
   * Whether the dimension receives skylight at all. When false the shared
   * initial-light pass skips sky projection entirely — both correct (Beta's
   * `hasNoSky`) and cheaper, since no zero-filled sky pass is computed.
   */
  readonly hasSkyLight: boolean;
  /**
   * Minimum rendered brightness (Beta's `var1` in the brightness table).
   *
   * NOTE: this is a *rendering / light-table* floor, not propagated block
   * light. It must never be injected into the light engine as an emission
   * value, or caves would light themselves.
   */
  readonly ambientLightFloor: number;
}

/** Sky/fog/celestial appearance owned by the dimension, not by Renderer. */
export interface DimensionSkyRules {
  /** Draw the sky dome, sun, moon and stars. False in the Nether. */
  readonly hasSky: boolean;
  /** Draw the cloud layer. False in the Nether. */
  readonly hasClouds: boolean;
  /**
   * Fixed celestial angle, if the dimension does not follow a day/night
   * cycle. `WorldProviderHell.calculateCelestialAngle` always returns 0.5.
   *
   * This affects CELESTIAL/lighting presentation only — world time itself
   * keeps advancing so scheduled ticks and simulation are unaffected.
   */
  readonly fixedCelestialAngle: number | undefined;
  /**
   * Constant fog/void colour, if the dimension does not derive it from the
   * sky. `WorldProviderHell.func_4096_a` returns (0.2, 0.03, 0.03).
   */
  readonly constantFogColor: { readonly r: number; readonly g: number; readonly b: number } | undefined;
}

/** Weather behaviour. The Nether runs no precipitation at all. */
export interface DimensionWeatherRules {
  readonly hasWeather: boolean;
}

/** Sleep / respawn behaviour (Beta `canRespawnHere`, `sleepInBedAt`). */
export interface DimensionPlayerRules {
  /**
   * Whether a bed may be slept in here. Beta returns NOT_POSSIBLE_HERE in the
   * Nether — it refuses, and (unlike later versions) does NOT explode.
   */
  readonly canSleep: boolean;
  /** Beta `WorldProvider.canRespawnHere` — false for the Nether. */
  readonly canRespawnHere: boolean;
}

/**
 * A spawn entry mirrors Beta's `SpawnListEntry`. `available` lets a dimension
 * declare its authentic Beta roster even when the entity type is not yet
 * implemented, so the spawner can skip it deliberately instead of repeatedly
 * failing to construct an unregistered entity.
 */
export interface DimensionSpawnEntry {
  readonly entityId: string;
  readonly weight: number;
  readonly available: boolean;
}

export interface DimensionSpawnRules {
  readonly monsters: readonly DimensionSpawnEntry[];
  readonly creatures: readonly DimensionSpawnEntry[];
}

/**
 * Everything that makes a dimension behave differently, in one place.
 *
 * The goal is that dimension-specific behaviour is *configuration consumed by
 * generic systems*, never `if (dimension === -1)` scattered through the
 * engine. A future mod registers one of these and needs no engine changes.
 */
export interface DimensionDefinition {
  readonly id: DimensionId;
  /** Stable internal name, also used for persistence namespacing/debug. */
  readonly name: string;
  /** Human-readable name for the F3 line and UI. */
  readonly displayName: string;

  /** Builds this dimension's terrain generator for a world seed. */
  readonly createGenerator: (worldSeed: bigint) => WorldGenerator;

  /**
   * Horizontal scale relative to other dimensions. Beta moves 8 Overworld
   * blocks per 1 Nether block, expressed as Overworld 1.0 / Nether 8.0 and
   * applied as `sourceScale / destinationScale`.
   */
  readonly coordinateScale: number;

  readonly lighting: DimensionLightingRules;
  readonly sky: DimensionSkyRules;
  readonly weather: DimensionWeatherRules;
  readonly player: DimensionPlayerRules;
  readonly spawn: DimensionSpawnRules;

  /** Music profile selected on entering this dimension. */
  readonly musicContext: MusicContext;
}
