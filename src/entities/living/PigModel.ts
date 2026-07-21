import type { Texture } from 'three';
import { QuadrupedModel, type QuadrupedConfig } from './QuadrupedModel';

const PINK = 0xefa6a0;

/**
 * Beta pig proportions (ModelPig = ModelQuadruped(6, 0)), expressed in the
 * shared world-16th convention. The body uses the rendered-equivalent box of
 * Beta's 10×16×8 body rotated 90° about X (effective 10 wide × 8 tall × 16
 * long). Beta's pig snout is texture-only, so there is no geometric snout.
 */
const PIG_CONFIG: QuadrupedConfig = {
  body: { w: 10, h: 8, d: 16, y: 10 },
  head: { w: 8, h: 8, d: 8, pivotY: 12, pivotZ: 6 },
  headOffset: { x: 0, y: 0, z: 4 },
  leg: { w: 4, h: 6, d: 4 },
  legPivotY: 6,
  legs: [
    { x: -3, z: 5 }, // front-left
    { x: 3, z: 5 }, // front-right
    { x: -3, z: -7 }, // back-left
    { x: 3, z: -7 }, // back-right
  ],
  bodyColor: PINK,
};

/** Pig model: the shared {@link QuadrupedModel} with Beta pig proportions. */
export class PigModel extends QuadrupedModel {
  public constructor(texture?:Texture) {
    super({...PIG_CONFIG,...(texture?{texture}:{}),headUv:{u:0,v:0},bodyUv:{u:28,v:8,sourceW:10,sourceH:16,sourceD:8},legUv:{u:0,v:16}});
  }
}
