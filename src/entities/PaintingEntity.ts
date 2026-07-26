import * as THREE from 'three';
import { Entity } from './core/Entity';
import { EntityTypeIds } from './core/EntityType';
import type { EntityTickContext, EntityWorldContext } from './core/EntityContext';
import { nbt, type NbtCompound, type NbtTag } from '../nbt/Nbt';
import { attachEntityLighting } from '../rendering/ChunkRenderer';
import { AABB } from '../physics/AABB';

/**
 * Beta 1.7.3 `EntityPainting` and `EnumArt`.
 *
 * A painting hangs flat against a wall, occupies a whole number of blocks,
 * and picks its artwork at random from every variant that fits the available
 * space — Beta's `EntityPainting(World,int,int,int,int)` constructor builds
 * that candidate list by trying each variant in turn.
 */

/** One Beta painting variant. Sizes are in pixels; the atlas is 256x256. */
export interface PaintingArt {
  readonly title: string;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** All 25 Beta 1.7.3 paintings, transcribed from `EnumArt`. */
export const PAINTING_ARTS: readonly PaintingArt[] = [
  { title: 'Kebab', sizeX: 16, sizeY: 16, offsetX: 0, offsetY: 0 },
  { title: 'Aztec', sizeX: 16, sizeY: 16, offsetX: 16, offsetY: 0 },
  { title: 'Alban', sizeX: 16, sizeY: 16, offsetX: 32, offsetY: 0 },
  { title: 'Aztec2', sizeX: 16, sizeY: 16, offsetX: 48, offsetY: 0 },
  { title: 'Bomb', sizeX: 16, sizeY: 16, offsetX: 64, offsetY: 0 },
  { title: 'Plant', sizeX: 16, sizeY: 16, offsetX: 80, offsetY: 0 },
  { title: 'Wasteland', sizeX: 16, sizeY: 16, offsetX: 96, offsetY: 0 },
  { title: 'Pool', sizeX: 32, sizeY: 16, offsetX: 0, offsetY: 32 },
  { title: 'Courbet', sizeX: 32, sizeY: 16, offsetX: 32, offsetY: 32 },
  { title: 'Sea', sizeX: 32, sizeY: 16, offsetX: 64, offsetY: 32 },
  { title: 'Sunset', sizeX: 32, sizeY: 16, offsetX: 96, offsetY: 32 },
  { title: 'Creebet', sizeX: 32, sizeY: 16, offsetX: 128, offsetY: 32 },
  { title: 'Wanderer', sizeX: 16, sizeY: 32, offsetX: 0, offsetY: 64 },
  { title: 'Graham', sizeX: 16, sizeY: 32, offsetX: 16, offsetY: 64 },
  { title: 'Match', sizeX: 32, sizeY: 32, offsetX: 0, offsetY: 128 },
  { title: 'Bust', sizeX: 32, sizeY: 32, offsetX: 32, offsetY: 128 },
  { title: 'Stage', sizeX: 32, sizeY: 32, offsetX: 64, offsetY: 128 },
  { title: 'Void', sizeX: 32, sizeY: 32, offsetX: 96, offsetY: 128 },
  { title: 'SkullAndRoses', sizeX: 32, sizeY: 32, offsetX: 128, offsetY: 128 },
  { title: 'Fighters', sizeX: 64, sizeY: 32, offsetX: 0, offsetY: 96 },
  { title: 'Pointer', sizeX: 64, sizeY: 64, offsetX: 0, offsetY: 192 },
  { title: 'Pigscene', sizeX: 64, sizeY: 64, offsetX: 64, offsetY: 192 },
  { title: 'BurningSkull', sizeX: 64, sizeY: 64, offsetX: 128, offsetY: 192 },
  { title: 'Skeleton', sizeX: 64, sizeY: 48, offsetX: 192, offsetY: 64 },
  { title: 'DonkeyKong', sizeX: 64, sizeY: 48, offsetX: 192, offsetY: 112 },
];

/** Beta's painting texture sheet is 256x256. */
const PAINTING_ATLAS_SIZE = 256;
/** Beta insets the hanging painting slightly from the wall face. */
const WALL_INSET = 0.0625;

/** Minimal world access the placement check needs. */
export interface PaintingWorldAccess {
  isSolid(x: number, y: number, z: number): boolean;
}

export class PaintingEntity extends Entity {
  public override readonly typeId = EntityTypeIds.Painting;
  public override readonly typeStringId = 'Painting';

  /** Beta direction: 0 = -Z, 1 = -X, 2 = +Z, 3 = +X. */
  public direction = 0;
  /** Block the painting is attached to. */
  public tileX = 0;
  public tileY = 0;
  public tileZ = 0;
  public art: PaintingArt = PAINTING_ARTS[0]!;

  private ownGeometry: THREE.BufferGeometry | null = null;
  private ownMaterial: THREE.Material | null = null;

  public constructor(private readonly ctx: EntityWorldContext) {
    super();
    this.setSize(0.5, 0.5);
    this.yOffset = 0;
  }

  /**
   * Beta's placement constructor: try every variant, keep the ones that fit,
   * then pick one at random. Returns null when nothing fits the wall.
   */
  public static create(
    ctx: EntityWorldContext,
    world: PaintingWorldAccess,
    tileX: number,
    tileY: number,
    tileZ: number,
    direction: number,
    nextInt: (bound: number) => number,
  ): PaintingEntity | null {
    const painting = new PaintingEntity(ctx);
    painting.tileX = tileX;
    painting.tileY = tileY;
    painting.tileZ = tileZ;

    const candidates = PAINTING_ARTS.filter((art) => {
      painting.art = art;
      painting.setDirection(direction);
      return painting.hasValidSurface(world);
    });
    if (candidates.length === 0) return null;

    painting.art = candidates[nextInt(candidates.length)]!;
    painting.setDirection(direction);
    painting.buildModel();
    return painting;
  }

  /**
   * Beta `setDirection`: centres the painting over the block face, offset by
   * half its size so multi-block art extends the correct way.
   */
  public setDirection(direction: number): void {
    this.direction = direction & 3;
    this.yaw = this.direction * 90;
    this.previousYaw = this.yaw;

    let x = this.tileX + 0.5;
    let y = this.tileY + 0.5;
    let z = this.tileZ + 0.5;

    // Step off the wall face toward open air.
    const inset = 0.5 + WALL_INSET;
    if (this.direction === 0) z -= inset;
    if (this.direction === 1) x -= inset;
    if (this.direction === 2) z += inset;
    if (this.direction === 3) x += inset;

    // Beta shifts multi-block paintings so they hang from the anchor block.
    const shift = offsetForSize(this.art.sizeX);
    if (this.direction === 0) x -= shift;
    if (this.direction === 1) z += shift;
    if (this.direction === 2) x += shift;
    if (this.direction === 3) z -= shift;
    y += offsetForSize(this.art.sizeY);

    this.setPosition(x, y, z);
  }

  /** World-space AABB matching the hanging plane's footprint. */
  public override getAABB(): AABB {
    const halfWidth = this.art.sizeX / 32;
    const halfHeight = this.art.sizeY / 32;
    const depth = WALL_INSET;
    const horizontal = this.direction === 0 || this.direction === 2;
    const halfX = horizontal ? halfWidth : depth;
    const halfZ = horizontal ? depth : halfWidth;
    return new AABB(
      this.position.x - halfX, this.position.y - halfHeight, this.position.z - halfZ,
      this.position.x + halfX, this.position.y + halfHeight, this.position.z + halfZ,
    );
  }

  /**
   * Beta `onValidSurface`: every block behind the painting must be solid.
   */
  public hasValidSurface(world: PaintingWorldAccess): boolean {
    const blocksWide = Math.max(1, Math.floor(this.art.sizeX / 16));
    const blocksTall = Math.max(1, Math.floor(this.art.sizeY / 16));

    const horizontal = this.direction === 0 || this.direction === 2;
    const startX = horizontal ? Math.floor(this.position.x - this.art.sizeX / 32) : this.tileX;
    const startZ = horizontal ? this.tileZ : Math.floor(this.position.z - this.art.sizeX / 32);
    const startY = Math.floor(this.position.y - this.art.sizeY / 32);

    for (let across = 0; across < blocksWide; across++) {
      for (let up = 0; up < blocksTall; up++) {
        const bx = horizontal ? startX + across : this.tileX;
        const bz = horizontal ? this.tileZ : startZ + across;
        if (!world.isSolid(bx, startY + up, bz)) return false;
      }
    }
    return true;
  }

  /** Paintings are static; Beta only ticks them for the drop check. */
  public onTick(_ctx: EntityTickContext): void {
    this.age += 1;
  }

  /** Beta drops one painting item when broken. */
  public dropAsItem?: (x: number, y: number, z: number) => void;

  public breakPainting(): void {
    if (this.removed) return;
    this.dropAsItem?.(this.position.x, this.position.y, this.position.z);
    this.markRemoved();
  }

  private buildModel(): void {
    if (typeof document === 'undefined') return;
    const width = this.art.sizeX / 16;
    const height = this.art.sizeY / 16;
    const geometry = new THREE.PlaneGeometry(width, height);

    // Map the variant's rectangle out of the 256x256 painting sheet.
    const u0 = this.art.offsetX / PAINTING_ATLAS_SIZE;
    const v0 = this.art.offsetY / PAINTING_ATLAS_SIZE;
    const u1 = (this.art.offsetX + this.art.sizeX) / PAINTING_ATLAS_SIZE;
    const v1 = (this.art.offsetY + this.art.sizeY) / PAINTING_ATLAS_SIZE;
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    uv.setXY(0, u0, v0);
    uv.setXY(1, u1, v0);
    uv.setXY(2, u0, v1);
    uv.setXY(3, u1, v1);
    uv.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
    });
    const texture = this.ctx.entityTextures?.get('paintingKristoffer');
    if (texture !== undefined) material.map = texture;
    attachEntityLighting(material);

    this.ownGeometry = geometry;
    this.ownMaterial = material;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(this.position.x, this.position.y, this.position.z);
    mesh.rotation.y = -this.direction * Math.PI / 2;
    this.renderObject = mesh;
    this.ctx.scene.add(mesh);
  }

  public onRemove(): void {
    if (this.renderObject !== null) {
      this.renderObject.removeFromParent();
      this.renderObject = null;
    }
    this.ownGeometry?.dispose();
    this.ownMaterial?.dispose();
    this.ownGeometry = null;
    this.ownMaterial = null;
  }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    map.set('Dir', nbt.byte(this.direction));
    map.set('Motive', nbt.string(this.art.title));
    map.set('TileX', nbt.int(this.tileX));
    map.set('TileY', nbt.int(this.tileY));
    map.set('TileZ', nbt.int(this.tileZ));
  }

  protected readEntityNbt(data: NbtCompound): void {
    const dir = data.value.get('Dir');
    if (dir?.type === 'byte') this.direction = dir.value & 3;
    const motive = data.value.get('Motive');
    if (motive?.type === 'string') {
      const found = PAINTING_ARTS.find((art) => art.title === motive.value);
      if (found !== undefined) this.art = found;
    }
    const tileX = data.value.get('TileX');
    if (tileX?.type === 'int') this.tileX = tileX.value;
    const tileY = data.value.get('TileY');
    if (tileY?.type === 'int') this.tileY = tileY.value;
    const tileZ = data.value.get('TileZ');
    if (tileZ?.type === 'int') this.tileZ = tileZ.value;
    this.setDirection(this.direction);
    this.buildModel();
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): PaintingEntity | undefined {
    const entity = new PaintingEntity(ctx);
    entity.readFromNbt(data);
    return entity;
  }
}

/**
 * Beta shifts a painting by half a block when its size spans an even number
 * of blocks, so the art stays centred on the anchor.
 */
function offsetForSize(size: number): number {
  return size === 32 ? 0.5 : 0;
}
