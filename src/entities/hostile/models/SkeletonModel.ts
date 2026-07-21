import type { Texture } from 'three';
import { BipedModel } from './BipedModel';

/** Beta ModelSkeleton: Zombie pose with 2×12×2 arms and legs. */
export class SkeletonModel extends BipedModel {
  public constructor(texture?:Texture) { super(0xd8d8cf,true,texture); }
}
