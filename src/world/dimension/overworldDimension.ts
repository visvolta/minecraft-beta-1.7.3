import { BetaWorldGenerator } from '../generation/BetaWorldGenerator';
import type { DimensionDefinition } from './DimensionDefinition';
import { DIMENSION_OVERWORLD } from './DimensionId';

/**
 * Beta 1.7.3 Overworld (`WorldProviderSurface`).
 *
 * Every value here reproduces the behaviour the engine had before dimensions
 * existed, so registering this definition changes nothing observable.
 */
export const OVERWORLD_DIMENSION: DimensionDefinition = {
  id: DIMENSION_OVERWORLD,
  name: 'overworld',
  displayName: 'Overworld',

  createGenerator: (worldSeed: bigint) => new BetaWorldGenerator(worldSeed),

  /** Reference scale; the Nether is 8x coarser relative to this. */
  coordinateScale: 1,

  lighting: {
    hasSkyLight: true,
    // WorldProvider.generateLightBrightnessTable: var1 = 0.05F.
    ambientLightFloor: 0.05,
  },

  sky: {
    hasSky: true,
    hasClouds: true,
    fixedCelestialAngle: undefined,
    constantFogColor: undefined,
  },

  weather: { hasWeather: true },

  player: { canSleep: true, canRespawnHere: true },

  spawn: {
    // The Overworld spawner is driven by the existing biome/creature system;
    // these lists describe dimension-level policy only.
    monsters: [],
    creatures: [],
  },

  musicContext: 'survival',
};
