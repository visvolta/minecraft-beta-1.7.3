import * as THREE from 'three';
import { ITEM_TEXTURE_LIST } from './itemTextureList';

export const ITEM_TILE_SIZE = 16;
const UV_EDGE_INSET = 0.01;

export interface AtlasUvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

function configureAtlasTexture(texture: THREE.CanvasTexture): void {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
}

export class ItemTextureAtlas {
  public readonly texture: THREE.CanvasTexture;
  private readonly uvByName = new Map<string, AtlasUvRect>();

  private constructor(canvas: HTMLCanvasElement, uvByName: Map<string, AtlasUvRect>) {
    this.uvByName = uvByName;
    this.texture = new THREE.CanvasTexture(canvas);
    configureAtlasTexture(this.texture);
  }

  public static async load(): Promise<ItemTextureAtlas> {
    const images = new Map<string, HTMLImageElement>();
    const loadPromises = ITEM_TEXTURE_LIST.map((name) => {
      const url = `/textures/items/${name}.png`;
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          images.set(name, img);
          resolve();
        };
        img.onerror = () => {
          console.warn(`Failed to load item texture: ${url}`);
          resolve(); // Resolve anyway so a missing texture doesn't block startup
        };
        img.src = url;
      });
    });

    await Promise.all(loadPromises);

    const names = Array.from(images.keys());
    names.sort();
    const tileCount = names.length;
    const columns = Math.max(1, Math.ceil(Math.sqrt(tileCount)));
    const rows = Math.max(1, Math.ceil(tileCount / columns));

    const canvas = document.createElement('canvas');
    canvas.width = columns * ITEM_TILE_SIZE;
    canvas.height = rows * ITEM_TILE_SIZE;

    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('Failed to acquire 2D context for item texture atlas.');
    }
    context.imageSmoothingEnabled = false;

    const uvByName = new Map<string, AtlasUvRect>();

    names.forEach((name, index) => {
      const image = images.get(name)!;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const pixelX = column * ITEM_TILE_SIZE;
      const pixelY = row * ITEM_TILE_SIZE;

      context.drawImage(image, pixelX, pixelY);

      const atlasWidth = canvas.width;
      const atlasHeight = canvas.height;
      const inset = UV_EDGE_INSET;

      uvByName.set(name, {
        u0: (pixelX + inset) / atlasWidth,
        v0: (pixelY + inset) / atlasHeight,
        u1: (pixelX + ITEM_TILE_SIZE - inset) / atlasWidth,
        v1: (pixelY + ITEM_TILE_SIZE - inset) / atlasHeight,
      });
    });

    return new ItemTextureAtlas(canvas, uvByName);
  }

  public getUvRect(name: string): AtlasUvRect | undefined {
    return this.uvByName.get(name);
  }

  public dispose(): void {
    this.texture.dispose();
  }
}
