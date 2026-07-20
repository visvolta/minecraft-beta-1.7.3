import * as THREE from 'three';
import type { BlockDefinition } from '../blocks/BlockDefinition';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { BlockItemModelBuilder } from './BlockItemModelBuilder';

/** Delegate isolated mesh building directly to the centralized BlockItemModelBuilder. */
export class IsolatedBlockModelBuilder {
  static build(def: BlockDefinition, atlas: TextureAtlas, metadata = 0): THREE.BufferGeometry {
    return BlockItemModelBuilder.build3DGeometry(def, atlas, metadata);
  }
}
