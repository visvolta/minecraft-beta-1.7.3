import * as THREE from 'three';
import type { TextureAtlas } from '../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../assets/ItemTextureAtlas';
import { BlockRegistry } from '../blocks/BlockRegistry';
import type { Inventory } from './Inventory';
import { classifyItemRender } from './ItemRenderClassifier';
import { BlockItemModelBuilder } from './BlockItemModelBuilder';

export class HotbarHudRenderer {
  private readonly scene = new THREE.Scene();
  private readonly hudCamera: THREE.OrthographicCamera;
  private readonly hudRenderer: THREE.WebGLRenderer;

  private readonly atlas: TextureAtlas;
  private readonly itemAtlas: ItemTextureAtlas;
  private readonly blockRegistry: BlockRegistry;
  private readonly inventory: Inventory;

  // Track the current mesh rendered for each of the 9 hotbar slots
  private readonly slotMeshes: (THREE.Mesh | null | undefined)[] = Array(9).fill(null);
  private readonly slotCacheKeys: string[] = Array(9).fill('');

  // Dedicated unlit materials ensuring constant maximum HUD brightness
  private readonly hudBlockMaterial: THREE.MeshBasicMaterial;
  private readonly hudItemMaterial: THREE.MeshBasicMaterial;

  public constructor(
    atlas: TextureAtlas,
    itemAtlas: ItemTextureAtlas,
    blockRegistry: BlockRegistry,
    inventory: Inventory,
  ) {
    this.atlas = atlas;
    this.itemAtlas = itemAtlas;
    this.blockRegistry = blockRegistry;
    this.inventory = inventory;

    this.hudBlockMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true, // Crucial to support block tints and isometric shading contrast
      transparent: true,
      alphaTest: 0.01,
    });

    this.hudItemMaterial = new THREE.MeshBasicMaterial({
      map: itemAtlas.texture,
      transparent: true,
      alphaTest: 0.01,
    });

    // Camera covers the exact screen width and height in pixels
    this.hudCamera = new THREE.OrthographicCamera(
      0, window.innerWidth,
      window.innerHeight, 0,
      0.1, 100
    );
    this.hudCamera.position.z = 10;

    // Dedicated transparent HUD WebGL Renderer (Canvas at z-index: 2)
    this.hudRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.hudRenderer.setSize(window.innerWidth, window.innerHeight);
    this.hudRenderer.setPixelRatio(1);
    this.hudRenderer.domElement.id = 'hud-canvas';
    this.hudRenderer.domElement.style.position = 'absolute';
    this.hudRenderer.domElement.style.top = '0';
    this.hudRenderer.domElement.style.left = '0';
    this.hudRenderer.domElement.style.width = '100%';
    this.hudRenderer.domElement.style.height = '100%';
    this.hudRenderer.domElement.style.pointerEvents = 'none';
    this.hudRenderer.domElement.style.zIndex = '2';
    document.body.appendChild(this.hudRenderer.domElement);

    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();
  }

  private handleResize(): void {
    this.hudCamera.right = window.innerWidth;
    this.hudCamera.top = window.innerHeight;
    this.hudCamera.updateProjectionMatrix();
    this.hudRenderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Updates the WebGL HUD scene meshes and HTML HUD texts.
   */
  public update(selectedSlot: number): void {
    const slotElements = document.querySelectorAll('.hotbar-slot');

    for (let slotIndex = 0; slotIndex < 9; slotIndex++) {
      const slotEl = slotElements[slotIndex] as HTMLElement | undefined;
      if (!slotEl) continue;

      const stack = this.inventory.getStack(slotIndex);
      const rect = slotEl.getBoundingClientRect();

      // HTML Selection Highlight Updates (Snaps immediately with zero slide latency)
      const existingHighlight = slotEl.querySelector('.selected-highlight');
      if (slotIndex === selectedSlot) {
        if (!existingHighlight) {
          const hl = document.createElement('div');
          hl.className = 'selected-highlight';
          slotEl.appendChild(hl);
        }
      } else {
        if (existingHighlight) {
          existingHighlight.remove();
        }
      }

      // HTML Stack count updates
      const countEl = slotEl.querySelector('.slot-stack-count') as HTMLElement | undefined;
      if (countEl) {
        if (stack !== null && stack.count > 1) {
          countEl.textContent = stack.count.toString();
        } else {
          countEl.textContent = '';
        }
      }

      // Generate a cache key to see if the rendering mesh needs rebuilding
      const cacheKey = stack === null 
        ? 'empty' 
        : `${stack.identity.type}_${stack.identity.id}_${stack.count}`;

      if (this.slotCacheKeys[slotIndex] !== cacheKey) {
        // Clear previous mesh
        const prevMesh = this.slotMeshes[slotIndex];
        if (prevMesh !== null && prevMesh !== undefined) {
          this.scene.remove(prevMesh);
          prevMesh.geometry.dispose();
          this.slotMeshes[slotIndex] = null;
        }

        if (stack !== null) {
          let mesh: THREE.Mesh | undefined;

          // Resolve authoritative Beta-backed render classification
          const category = classifyItemRender(stack.identity, this.blockRegistry);
          const def = this.blockRegistry.getById(stack.identity.id as number);

          if (category === 'unsupported') {
            // Render an unmistakable bright magenta debug quad for unsupported/complex blocks
            const geometry = BlockItemModelBuilder.buildDebugPlaceholder();
            mesh = new THREE.Mesh(geometry, this.hudBlockMaterial);
            mesh.rotation.set(0, 0, 0);

            const scale = rect.width * 0.65;
            mesh.scale.set(scale, scale, 1);
          } else if (category === 'block_3d' && def !== undefined) {
            // Isometric 3D block icon: generate geometry, CLONE it to prevent shared mutation, center and scale
            const baseGeo = BlockItemModelBuilder.build3DGeometry(def, this.atlas);
            const geometry = baseGeo.clone();
            geometry.center(); // Center dynamically based on coordinates

            mesh = new THREE.Mesh(geometry, this.hudBlockMaterial);
            
            // Beta Isometric: 30 pitch, 45 yaw
            mesh.rotation.x = 0.5236; 
            mesh.rotation.y = 0.7854;
            mesh.rotation.z = 0;

            geometry.computeBoundingBox();
            const size = new THREE.Vector3();
            geometry.boundingBox!.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);

            // Scale dynamically to fit inside the slot perfectly
            const scale = (rect.width * 0.45) / maxDim;
            mesh.scale.set(scale, scale, scale);
          } else if (category === 'block_flat' && def !== undefined) {
            // Flat block-texture sprite (e.g. flowers, tall grass, saplings, mushrooms)
            const baseGeo = BlockItemModelBuilder.buildFlatGeometry(def, this.atlas);
            const geometry = baseGeo.clone();
            geometry.center();

            mesh = new THREE.Mesh(geometry, this.hudBlockMaterial);
            mesh.rotation.set(0, 0, 0);

            geometry.computeBoundingBox();
            const size = new THREE.Vector3();
            geometry.boundingBox!.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);

            const scale = (rect.width * 0.65) / maxDim;
            mesh.scale.set(scale, scale, 1);
          } else {
            // Flat item icon: map to ItemTextureAtlas
            const uvRect = this.itemAtlas.getUvRect(stack.identity.id as string);

            // Asset lookup safety check
            if (uvRect === undefined) {
              console.warn(
                `[HotbarHudRenderer] Missing item texture: "${stack.identity.id}". Using magenta placeholder.`
              );
            }

            const u0 = uvRect ? uvRect.u0 : 0;
            const v0 = uvRect ? uvRect.v0 : 0;
            const u1 = uvRect ? uvRect.u1 : 1;
            const v1 = uvRect ? uvRect.v1 : 1;

            // Generate two explicitly opposed quads to ensure readable unmirrored back face
            const geometry = this.createOpposedQuadsGeometry(u0, v0, u1, v1, uvRect === undefined);
            mesh = new THREE.Mesh(geometry, this.hudItemMaterial);
            mesh.rotation.set(0, 0, 0);

            const scale = rect.width * 0.65;
            mesh.scale.set(scale, scale, 1);
          }

          this.scene.add(mesh);
          this.slotMeshes[slotIndex] = mesh;
        }

        this.slotCacheKeys[slotIndex] = cacheKey;
      }

      // Update position of the active WebGL slot icon mesh to align perfectly with the HTML slot
      const mesh = this.slotMeshes[slotIndex];
      if (mesh !== null && mesh !== undefined && rect.width > 0) {
        const x = rect.left + rect.width / 2;
        const y = window.innerHeight - (rect.top + rect.height / 2); // invert Y coordinate for Three.js space
        mesh.position.set(x, y, -5);
      }
    }
  }

  /**
   * Renders the transparent 3D HUD WebGL pass cleanly on top of the world.
   */
  public render(): void {
    this.hudRenderer.clear();
    this.hudRenderer.render(this.scene, this.hudCamera);
  }

  private createOpposedQuadsGeometry(u0: number, v0: number, u1: number, v1: number, isMissing: boolean): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry();
    const half = 0.5; // Normalized unit square, scaled dynamically
    
    // 8 vertices: 4 for front quad, 4 for back quad
    const positions = new Float32Array([
      // Front quad
      -half,  half,  0.001,
       half,  half,  0.001,
      -half, -half,  0.001,
       half, -half,  0.001,

      // Back quad (offset slightly backward)
      -half,  half, -0.001,
       half,  half, -0.001,
      -half, -half, -0.001,
       half, -half, -0.001,
    ]);

    const uvs = new Float32Array([
      // Front face standard UVs
      u0, v0,
      u1, v0,
      u0, v1,
      u1, v1,

      // Back face horizontally-flipped UVs so they render unmirrored from behind
      u1, v0,
      u0, v0,
      u1, v1,
      u0, v1,
    ]);

    const colors = new Float32Array(24);
    const r = isMissing ? 1.0 : 1.0;
    const g = isMissing ? 0.0 : 1.0;
    const b = isMissing ? 1.0 : 1.0;
    for (let i = 0; i < 8; i++) {
      colors[i * 3 + 0] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    const indices = [
      // Front face (Counter-clockwise winding)
      0, 2, 1,
      1, 2, 3,

      // Back face (Clockwise winding from front, but counter-clockwise from back)
      5, 6, 4,
      7, 6, 5
    ];

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  public dispose(): void {
    window.removeEventListener('resize', () => this.handleResize());
    for (const mesh of this.slotMeshes) {
      if (mesh !== null && mesh !== undefined) {
        mesh.geometry.dispose();
      }
    }
    this.hudBlockMaterial.dispose();
    this.hudItemMaterial.dispose();
    this.hudRenderer.dispose();
    this.hudRenderer.domElement.remove();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (object.material instanceof THREE.Material && object.material !== this.hudBlockMaterial && object.material !== this.hudItemMaterial) {
          object.material.dispose();
        }
      }
    });
  }
}
