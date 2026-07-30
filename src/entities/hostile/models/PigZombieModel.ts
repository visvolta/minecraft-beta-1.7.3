import type { Texture } from 'three';
import { BipedModel } from './BipedModel';

/**
 * Beta `ModelZombie` geometry on the shared six-part biped, textured with the
 * supplied zombie-pigman skin (64x64). Mirrors `ZombieModel`; kept separate so
 * the pigman can later host its own held-item/anger visuals without touching
 * the zombie.
 */
export class PigZombieModel extends BipedModel {
  public constructor(texture?: Texture) { super(0xead38d, false, texture, 64); }
}
