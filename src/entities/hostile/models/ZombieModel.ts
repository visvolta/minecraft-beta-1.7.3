import type { Texture } from 'three';
import { BipedModel } from './BipedModel';

/** Beta ModelZombie arm pose on the shared six-part biped geometry. */
export class ZombieModel extends BipedModel {
  public constructor(texture?:Texture) { super(0x527a43,false,texture,64); }
}
