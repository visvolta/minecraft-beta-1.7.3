import { NetherWorldGenerator } from '../generation/nether/NetherWorldGenerator';
import type { DimensionDefinition } from './DimensionDefinition';
import { DIMENSION_NETHER } from './DimensionId';

/**
 * Beta 1.7.3 Nether (`WorldProviderHell` + `BiomeGenHell`).
 *
 * Values are taken directly from the reference:
 *  - `hasNoSky = true`                       -> lighting.hasSkyLight = false
 *  - overridden brightness table `var1=0.1F` -> ambientLightFloor 0.1
 *  - `calculateCelestialAngle` returns 0.5F  -> fixed celestial angle
 *  - `func_4096_a` returns (0.2, 0.03, 0.03) -> constant fog colour
 *  - `canRespawnHere() = false`
 *  - `sleepInBedAt` -> NOT_POSSIBLE_HERE (refuses; no explosion in Beta)
 *  - Overworld/Nether travel divides or multiplies X/Z by 8
 */
export const NETHER_DIMENSION: DimensionDefinition = {
  id: DIMENSION_NETHER,
  name: 'nether',
  displayName: 'Nether',

  createGenerator: (worldSeed: bigint) => new NetherWorldGenerator(worldSeed),

  /** 1 Nether block covers 8 Overworld blocks. */
  coordinateScale: 8,

  lighting: {
    hasSkyLight: false,
    // WorldProviderHell.generateLightBrightnessTable: var1 = 0.1F.
    ambientLightFloor: 0.1,
  },

  sky: {
    hasSky: false,
    hasClouds: false,
    fixedCelestialAngle: 0.5,
    constantFogColor: { r: 0.2, g: 0.03, b: 0.03 },
  },

  weather: { hasWeather: false },

  player: { canSleep: false, canRespawnHere: false },

  spawn: {
    // BiomeGenHell clears every list and adds exactly these two at weight 10.
    // `available: false` records the authentic Beta roster while telling the
    // spawner these entity types are not implemented yet, so it skips them
    // deliberately instead of failing to construct an unregistered entity.
    monsters: [
      { entityId: 'Ghast', weight: 10, available: false },
      { entityId: 'PigZombie', weight: 10, available: false },
    ],
    creatures: [],
  },

  musicContext: 'nether',
};
