import * as THREE from 'three';

export interface SkinUVRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export interface PartUVs {
  readonly right: SkinUVRect;
  readonly left: SkinUVRect;
  readonly top: SkinUVRect;
  readonly bottom: SkinUVRect;
  readonly front: SkinUVRect;
  readonly back: SkinUVRect;
}

export class PlayerSkinManager {
  private activeTexture: THREE.Texture | null = null;
  private debugSkinTexture: THREE.Texture | null = null;
  private debugModeActive = false;
  private isLegacySkin = false;
  private skinPath = '/textures/skins/steve.png';

  public constructor() {}

  public setSkinPath(path: string): void {
    this.skinPath = path;
  }

  public getSkinPath(): string {
    return this.skinPath;
  }

  public toggleDebugMode(): boolean {
    this.debugModeActive = !this.debugModeActive;
    return this.debugModeActive;
  }

  public isDebugModeActive(): boolean {
    return this.debugModeActive;
  }

  /**
   * Loads the skin texture and determines format (legacy vs modern).
   * Employs standard TextureLoader.loadAsync to ensure awaited loading flow
   * and safe image data validation.
   */
  public async loadSkin(): Promise<THREE.Texture> {
    if (this.activeTexture) {
      this.activeTexture.dispose();
      this.activeTexture = null;
    }

    const loader = new THREE.TextureLoader();
    let texture: THREE.Texture;

    try {
      texture = await loader.loadAsync(this.skinPath);
    } catch (e) {
      console.warn(`Failed to load skin at ${this.skinPath}, falling back to default. Error:`, e);
      try {
        texture = await loader.loadAsync('/textures/skins/steve.png');
      } catch (err) {
        console.error('Ultimate skin fallback triggered. Generating procedural skin canvas.', err);
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffccaa';
        ctx.fillRect(0, 0, 64, 64);
        texture = new THREE.CanvasTexture(canvas);
      }
    }

    const image = texture.image;
    if (!image) {
      throw new Error('Loaded texture has no valid image data.');
    }

    const img = image as HTMLImageElement;
    const w = img.width;
    const h = img.height;

    if (w !== 64 || (h !== 32 && h !== 64)) {
      throw new Error(`Unsupported skin image size: ${w}x${h}. Expected 64x32 or 64x64.`);
    }

    this.isLegacySkin = (h === 32);

    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;

    this.activeTexture = texture;
    return texture;
  }

  public getActiveTexture(): THREE.Texture | null {
    if (this.debugModeActive) {
      if (!this.debugSkinTexture) {
        this.debugSkinTexture = this.generateDebugSkinTexture();
      }
      return this.debugSkinTexture;
    }
    return this.activeTexture;
  }

  public getIsLegacy(): boolean {
    return this.isLegacySkin;
  }

  /**
   * Helper to build face UVs for a 3D box of size (w, h, d) at skin coordinate (tx, ty).
   * Rects are returned in Three.js BoxGeometry face order:
   * 0: +X (Right), 1: -X (Left), 2: +Y (Top), 3: -Y (Bottom), 4: +Z (Front), 5: -Z (Back)
   */
  public getPartUVs(
    tx: number,
    ty: number,
    w: number,
    h: number,
    d: number,
    mirror = false,
    textureWidth = 64,
    textureHeight = this.isLegacySkin ? 32 : 64,
  ): PartUVs {
    const skinW = textureWidth;
    const skinH = textureHeight;

    const makeRect = (x: number, y: number, rw: number, rh: number, flipH = false): SkinUVRect => {
      let u0 = x / skinW;
      let u1 = (x + rw) / skinW;
      if (flipH) {
        const temp = u0;
        u0 = u1;
        u1 = temp;
      }
      const v0 = y / skinH;
      const v1 = (y + rh) / skinH;
      return { u0, v0, u1, v1 };
    };

    // Rectangles in skin space
    let rightRect = makeRect(tx, ty + d, d, h);
    let frontRect = makeRect(tx + d, ty + d, w, h);
    let leftRect = makeRect(tx + d + w, ty + d, d, h);
    let backRect = makeRect(tx + d + w + d, ty + d, w, h);
    let topRect = makeRect(tx + d, ty, w, d);
    let bottomRect = makeRect(tx + d + w, ty, w, d);

    if (mirror) {
      // Swap Left and Right rectangles
      const temp = rightRect;
      rightRect = leftRect;
      leftRect = temp;

      // Flip all rectangles horizontally
      rightRect = makeRect(tx + d + w, ty + d, d, h, true);
      frontRect = makeRect(tx + d, ty + d, w, h, true);
      leftRect = makeRect(tx, ty + d, d, h, true);
      backRect = makeRect(tx + d + w + d, ty + d, w, h, true);
      topRect = makeRect(tx + d, ty, w, d, true);
      bottomRect = makeRect(tx + d + w, ty, w, d, true);
    }

    return {
      right: rightRect,
      left: leftRect,
      top: topRect,
      bottom: bottomRect,
      front: frontRect,
      back: backRect,
    };
  }

  /**
   * Applies skin UVs to a BufferGeometry in BoxGeometry groups format.
   * Maps face-by-face explicitly according to the active orientations.
   */
  public applyUVsToGeometry(geometry: THREE.BufferGeometry, uvs: PartUVs): void {
    const uvAttribute = geometry.getAttribute('uv');
    if (!uvAttribute) {
      throw new Error('Geometry does not have a UV attribute to map.');
    }

    const array = uvAttribute.array as Float32Array;

    // Face 0: Right (+X)
    array[0]  = uvs.right.u0;  array[1]  = uvs.right.v0;
    array[2]  = uvs.right.u1;  array[3]  = uvs.right.v0;
    array[4]  = uvs.right.u0;  array[5]  = uvs.right.v1;
    array[6]  = uvs.right.u1;  array[7]  = uvs.right.v1;

    // Face 1: Left (-X)
    array[8]  = uvs.left.u0;   array[9]  = uvs.left.v0;
    array[10] = uvs.left.u1;   array[11] = uvs.left.v0;
    array[12] = uvs.left.u0;   array[13] = uvs.left.v1;
    array[14] = uvs.left.u1;   array[15] = uvs.left.v1;

    // Face 2: Top (+Y)
    array[16] = uvs.top.u1;    array[17] = uvs.top.v1; // uMax, vMax
    array[18] = uvs.top.u0;    array[19] = uvs.top.v1; // uMin, vMax
    array[20] = uvs.top.u1;    array[21] = uvs.top.v0; // uMax, vMin
    array[22] = uvs.top.u0;    array[23] = uvs.top.v0; // uMin, vMin

    // Face 3: Bottom (-Y)
    array[24] = uvs.bottom.u1; array[25] = uvs.bottom.v1; // uMax, vMax
    array[26] = uvs.bottom.u0; array[27] = uvs.bottom.v1; // uMin, vMax
    array[28] = uvs.bottom.u1; array[29] = uvs.bottom.v0; // uMax, vMin
    array[30] = uvs.bottom.u0; array[31] = uvs.bottom.v0; // uMin, vMin

    // Face 4: Back (+Z) - standard Three.js back, maps to Minecraft skin Back
    array[32] = uvs.back.u1;   array[33] = uvs.back.v0; // uMax, vMin
    array[34] = uvs.back.u0;   array[35] = uvs.back.v0; // uMin, vMin
    array[36] = uvs.back.u1;   array[37] = uvs.back.v1; // uMax, vMax
    array[38] = uvs.back.u0;   array[39] = uvs.back.v1; // uMin, vMax

    // Face 5: Front (-Z) - standard Three.js front, maps to Minecraft skin Front ( Steve Face )
    array[40] = uvs.front.u0;  array[41] = uvs.front.v0; // uMin, vMin
    array[42] = uvs.front.u1;  array[43] = uvs.front.v0; // uMax, vMin
    array[44] = uvs.front.u0;  array[45] = uvs.front.v1; // uMin, vMax
    array[46] = uvs.front.u1;  array[47] = uvs.front.v1; // uMax, vMax

    uvAttribute.needsUpdate = true;
  }

  /**
   * Applies un-mirrored horizontally-flipped skin UVs specifically to the first-person arm.
   */
  public applyFirstPersonArmUVs(geometry: THREE.BufferGeometry, uvs: PartUVs): void {
    const uvAttribute = geometry.getAttribute('uv');
    if (!uvAttribute) {
      throw new Error('Geometry does not have a UV attribute to map.');
    }

    const array = uvAttribute.array as Float32Array;

    // Face 0: Right (+X) - map to right, but flip H (swap u0/u1)
    array[0]  = uvs.right.u1;  array[1]  = uvs.right.v0;
    array[2]  = uvs.right.u0;  array[3]  = uvs.right.v0;
    array[4]  = uvs.right.u1;  array[5]  = uvs.right.v1;
    array[6]  = uvs.right.u0;  array[7]  = uvs.right.v1;

    // Face 1: Left (-X) - map to left, but flip H
    array[8]  = uvs.left.u1;   array[9]  = uvs.left.v0;
    array[10] = uvs.left.u0;   array[11] = uvs.left.v0;
    array[12] = uvs.left.u1;   array[13] = uvs.left.v1;
    array[14] = uvs.left.u0;   array[15] = uvs.left.v1;

    // Face 2: Top (+Y)
    array[16] = uvs.top.u0;    array[17] = uvs.top.v1;
    array[18] = uvs.top.u1;    array[19] = uvs.top.v1;
    array[20] = uvs.top.u0;    array[21] = uvs.top.v0;
    array[22] = uvs.top.u1;    array[23] = uvs.top.v0;

    // Face 3: Bottom (-Y)
    array[24] = uvs.bottom.u0; array[25] = uvs.bottom.v1;
    array[26] = uvs.bottom.u1; array[27] = uvs.bottom.v1;
    array[28] = uvs.bottom.u0; array[29] = uvs.bottom.v0;
    array[30] = uvs.bottom.u1; array[31] = uvs.bottom.v0;

    // Face 4: Back (+Z) - flip H
    array[32] = uvs.back.u0;   array[33] = uvs.back.v0;
    array[34] = uvs.back.u1;   array[35] = uvs.back.v0;
    array[36] = uvs.back.u0;   array[37] = uvs.back.v1;
    array[38] = uvs.back.u1;   array[39] = uvs.back.v1;

    // Face 5: Front (-Z) - flip H
    array[40] = uvs.front.u1;  array[41] = uvs.front.v0;
    array[42] = uvs.front.u0;  array[43] = uvs.front.v0;
    array[44] = uvs.front.u1;  array[45] = uvs.front.v1;
    array[46] = uvs.front.u0;  array[47] = uvs.front.v1;

    uvAttribute.needsUpdate = true;
  }

  /**
   * Applies UV mapping to a canonical first-person arm (Z-aligned: 4x4x12 pixels).
   * Maps hand to the -Z front face, shoulder to the +Z back face, and aligns sides cleanly.
   */
  public applyCanonicalFirstPersonArmUVs(geometry: THREE.BufferGeometry, uvs: PartUVs): void {
    const uvAttribute = geometry.getAttribute('uv');
    if (!uvAttribute) {
      throw new Error('Geometry does not have a UV attribute to map.');
    }

    const array = uvAttribute.array as Float32Array;

    // Face 0: Right (+X)
    array[0]  = uvs.right.u0;  array[1]  = uvs.right.v0;
    array[2]  = uvs.right.u1;  array[3]  = uvs.right.v0;
    array[4]  = uvs.right.u0;  array[5]  = uvs.right.v1;
    array[6]  = uvs.right.u1;  array[7]  = uvs.right.v1;

    // Face 1: Left (-X)
    array[8]  = uvs.left.u1;   array[9]  = uvs.left.v0;
    array[10] = uvs.left.u0;   array[11] = uvs.left.v0;
    array[12] = uvs.left.u1;   array[13] = uvs.left.v1;
    array[14] = uvs.left.u0;   array[15] = uvs.left.v1;

    // Face 2: Top (+Y) - maps to uvs.front in the canonical Z-aligned first-person arm
    array[16] = uvs.front.u0;  array[17] = uvs.front.v1;
    array[18] = uvs.front.u1;  array[19] = uvs.front.v1;
    array[20] = uvs.front.u0;  array[21] = uvs.front.v0;
    array[22] = uvs.front.u1;  array[23] = uvs.front.v0;

    // Face 3: Bottom (-Y) - maps to uvs.back
    array[24] = uvs.back.u0;   array[25] = uvs.back.v0;
    array[26] = uvs.back.u1;   array[27] = uvs.back.v0;
    array[28] = uvs.back.u0;   array[29] = uvs.back.v1;
    array[30] = uvs.back.u1;   array[31] = uvs.back.v1;

    // Face 4: Back (+Z) - maps to uvs.top (shoulder end)
    array[32] = uvs.top.u0;    array[33] = uvs.top.v1;
    array[34] = uvs.top.u1;    array[35] = uvs.top.v1;
    array[36] = uvs.top.u0;    array[37] = uvs.top.v0;
    array[38] = uvs.top.u1;    array[39] = uvs.top.v0;

    // Face 5: Front (-Z) - maps to uvs.bottom (hand end)
    array[40] = uvs.bottom.u0; array[41] = uvs.bottom.v0;
    array[42] = uvs.bottom.u1; array[43] = uvs.bottom.v0;
    array[44] = uvs.bottom.u0; array[45] = uvs.bottom.v1;
    array[46] = uvs.bottom.u1; array[47] = uvs.bottom.v1;

    uvAttribute.needsUpdate = true;
  }

  /**
   * Generates a face-labeled visual UV debug canvas texture to inspect orientations.
   */
  private generateDebugSkinTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Background grey
    ctx.fillStyle = '#444444';
    ctx.fillRect(0, 0, 64, 64);

    const drawDebugPart = (tx: number, ty: number, w: number, h: number, d: number, name: string) => {
      // Top: Cyan
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(tx + d, ty, w, d);
      ctx.fillStyle = '#000000';
      ctx.font = '3px monospace';
      ctx.fillText('T', tx + d + w / 2 - 1, ty + d / 2 + 1);

      // Bottom: Magenta
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(tx + d + w, ty, w, d);
      ctx.fillStyle = '#000000';
      ctx.fillText('D', tx + d + w + w / 2 - 1, ty + d / 2 + 1);

      // Right: Yellow
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(tx, ty + d, d, h);
      ctx.fillStyle = '#000000';
      ctx.fillText('R', tx + d / 2 - 1, ty + d + h / 2 + 1);

      // Front: Red
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(tx + d, ty + d, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name + 'F', tx + d + 1, ty + d + h / 2 + 1);

      // Left: Blue
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(tx + d + w, ty + d, d, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('L', tx + d + w + d / 2 - 1, ty + d + h / 2 + 1);

      // Back: Green
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(tx + d + w + d, ty + d, w, h);
      ctx.fillStyle = '#000000';
      ctx.fillText('B', tx + d + w + d + w / 2 - 1, ty + d + h / 2 + 1);

      // Border outline
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(tx, ty, w + d + w + d, h + d);
    };

    // Head
    drawDebugPart(0, 0, 8, 8, 8, 'H');
    // Body
    drawDebugPart(16, 16, 8, 12, 4, 'B');
    // Right Arm
    drawDebugPart(40, 16, 4, 12, 4, 'RA');
    // Right Leg
    drawDebugPart(0, 16, 4, 12, 4, 'RL');

    if (!this.isLegacySkin) {
      // Left Arm
      drawDebugPart(32, 48, 4, 12, 4, 'LA');
      // Left Leg
      drawDebugPart(16, 48, 4, 12, 4, 'LL');

      // Overlays
      drawDebugPart(32, 0, 8, 8, 8, 'H2');
      drawDebugPart(16, 32, 8, 12, 4, 'TS2');
      drawDebugPart(40, 32, 4, 12, 4, 'RA2');
      drawDebugPart(48, 48, 4, 12, 4, 'LA2');
      drawDebugPart(0, 32, 4, 12, 4, 'RL2');
      drawDebugPart(0, 48, 4, 12, 4, 'LL2');
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;

    this.debugSkinTexture = texture;
    return texture;
  }
}
