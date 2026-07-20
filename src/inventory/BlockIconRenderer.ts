import * as THREE from 'three';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { IsolatedBlockModelBuilder } from './IsolatedBlockModelBuilder';
import { classifyItemRender, isBlock3dCategory } from './ItemRenderClassifier';

/** One shared offscreen renderer creates cached 3D inventory block images for full cube blocks. */
export class BlockIconRenderer {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
  private material: THREE.MeshBasicMaterial;
  private cache = new Map<string, string>();

  constructor(private blocks: BlockRegistry, private atlas: TextureAtlas) {
    this.renderer.setSize(32, 32, false);
    this.renderer.setPixelRatio(1);
    this.material = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, transparent: true, alphaTest: 0.1 });
    this.camera.position.set(0, 0, 3);
  }

  icon(id: number, metadata = 0): string {
    const key = `${id}:${metadata}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const def = this.blocks.getById(id);
    if (!def) return '';

    const category = classifyItemRender({ type: 'block', id }, this.blocks);
    if (!isBlock3dCategory(category)) {
      return '';
    }

    const mesh = new THREE.Mesh(IsolatedBlockModelBuilder.build(def, this.atlas, metadata), this.material);
    mesh.rotation.set(Math.PI / 6, Math.PI / 4, 0);
    this.scene.add(mesh);
    this.renderer.setClearColor(0, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL();
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    this.cache.set(key, url);
    return url;
  }

  dispose(): void {
    this.material.dispose();
    this.renderer.dispose();
    this.cache.clear();
  }
}
