import { BlockIds } from '../blocks/BlockId';
import type { LightEngine } from '../world/generation/lighting/LightEngine';
import { CHUNK_SIZE_X } from '../world/chunkConstants';
import { CHUNK_LOAD_RADIUS } from '../world/ChunkStreamer';

export type FogMode = 'overworld' | 'water' | 'lava' | 'debug-bypass';

export interface FogState {
  readonly mode: FogMode;
  readonly enabled: boolean;
  readonly colorHex: number;
  readonly near: number;
  readonly far: number;
}

/**
 * Stable overworld fog/background colour for this stage. Kept as one
 * constant rather than biome-varying to match the chosen implementation
 * direction and avoid abrupt environmental colour changes.
 */
export const OVERWORLD_FOG_COLOR = 0x70a0ff;
const WATER_FOG_COLOR = 0x203a80;
const LAVA_FOG_COLOR = 0x9a2f00;

/**
 * Keep a conservative hidden chunk buffer beyond the fully fogged visible
 * distance so newly streamed chunk edges never appear in a completely clear
 * view.
 */
const VISIBLE_DISTANCE_CHUNK_BUFFER = 1.5;
const NORMAL_FOG_START_FRACTION = 0.7;

const WATER_FOG_NEAR = 0;
const WATER_FOG_FAR = 18;
const LAVA_FOG_NEAR = 0;
const LAVA_FOG_FAR = 4;

export interface FogControllerInputs {
  readonly eyeX: number;
  readonly eyeY: number;
  readonly eyeZ: number;
  readonly rawLightDebugMode: boolean;
  readonly ambientOcclusionDebugMode: boolean;
  readonly overworldColorHex: number;
}

/**
 * Computes the desired fog state from the current eye position and debug
 * state. It does not touch Three.js directly; Renderer consumes the
 * resulting FogState.
 */
export class FogController {
  private readonly lightEngine: LightEngine;

  public constructor(lightEngine: LightEngine) {
    this.lightEngine = lightEngine;
  }

  public compute(inputs: FogControllerInputs): FogState {
    const eyeBlockX = Math.floor(inputs.eyeX);
    const eyeBlockY = Math.floor(inputs.eyeY);
    const eyeBlockZ = Math.floor(inputs.eyeZ);
    const eyeBlockId = this.lightEngine.getBlock(eyeBlockX, eyeBlockY, eyeBlockZ);

    if (eyeBlockId === BlockIds.Lava || eyeBlockId === BlockIds.LavaStill) {
      return {
        mode: 'lava',
        enabled: true,
        colorHex: LAVA_FOG_COLOR,
        near: LAVA_FOG_NEAR,
        far: LAVA_FOG_FAR,
      };
    }

    if (eyeBlockId === BlockIds.Water) {
      return {
        mode: 'water',
        enabled: true,
        colorHex: WATER_FOG_COLOR,
        near: WATER_FOG_NEAR,
        far: WATER_FOG_FAR,
      };
    }

    if (inputs.rawLightDebugMode || inputs.ambientOcclusionDebugMode) {
      return {
        mode: 'debug-bypass',
        enabled: false,
        colorHex: inputs.overworldColorHex,
        near: 0,
        far: 0,
      };
    }

    const far = Math.max(
      CHUNK_SIZE_X,
      (CHUNK_LOAD_RADIUS - VISIBLE_DISTANCE_CHUNK_BUFFER) * CHUNK_SIZE_X,
    );
    const near = far * NORMAL_FOG_START_FRACTION;

    return {
      mode: 'overworld',
      enabled: true,
      colorHex: inputs.overworldColorHex,
      near,
      far,
    };
  }
}
