import * as THREE from 'three';
import { Entity } from './core/Entity';
import { EntityTypeIds } from './core/EntityType';
import type { EntityTickContext, EntityWorldContext } from './core/EntityContext';
import { AABB } from '../physics/AABB';
import { nbt, type NbtCompound, type NbtTag } from '../persistence/nbt/Nbt';
import type { BlockId } from '../blocks/BlockId';
import { BlockIds } from '../blocks/BlockId';
import { resolveBlockTexture } from '../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../blocks/resolveBlockTint';
import { DroppedItemEntity } from './items/DroppedItemEntity';

/** Beta `EntityFallingSand` is 0.98×0.98; position here is the block CENTRE. */
const FALLING_BLOCK_SIZE = 0.98;
/** Beta despawns a falling block that fails to land after 100 ticks. */
const MAX_FALL_TIME = 100;

/**
 * A falling sand/gravel entity (Beta `EntityFallingSand`).
 *
 * Built on the shared {@link Entity} base for identity, lifecycle, chunk
 * ownership, interpolation and persistence. The vertical-fall simulation and
 * landing/placement/drop logic are kept specialised here (Beta falling blocks
 * only ever fall straight down), rather than forced through the generic mover.
 *
 * Note: `position` is the block **centre** (matching the prior implementation
 * and Beta's render offset), so {@link getAABB} is overridden accordingly.
 */
export class FallingBlockEntity extends Entity {
  public readonly typeId = EntityTypeIds.FallingBlock;
  public readonly typeStringId = 'FallingSand';

  public blockId: BlockId;
  public metadata: number;

  private ctx: EntityWorldContext;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial | null = null;

  public constructor(
    ctx: EntityWorldContext,
    blockId: BlockId,
    metadata: number,
    x: number,
    y: number,
    z: number,
  ) {
    super();
    this.ctx = ctx;
    this.blockId = blockId;
    this.metadata = metadata;
    this.setSize(FALLING_BLOCK_SIZE, FALLING_BLOCK_SIZE);
    this.setPosition(x, y, z);
    this.buildRender();
  }

  /** Centre-based AABB (position is the block centre, not the feet). */
  public override getAABB(): AABB {
    const half = FALLING_BLOCK_SIZE / 2;
    return new AABB(
      this.position.x - half,
      this.position.y - half,
      this.position.z - half,
      this.position.x + half,
      this.position.y + half,
      this.position.z + half,
    );
  }

  // ---- Rendering ---------------------------------------------------------

  private buildRender(): void {
    const definition = this.ctx.blockRegistry.getById(this.blockId);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const slots = ['side', 'side', 'top', 'bottom', 'side', 'side'] as const;
    const colors: number[] = [];

    for (let face = 0; face < 6; face++) {
      const slot = slots[face]!;
      const textureName = definition === undefined ? undefined : resolveBlockTexture(definition, slot);
      const rect = textureName === undefined ? undefined : this.ctx.blockAtlas.getUvRect(textureName);
      if (rect !== undefined) {
        for (let i = 0; i < 4; i++) {
          const index = face * 4 + i;
          uv.setXY(index, rect.u0 + uv.getX(index) * (rect.u1 - rect.u0), rect.v0 + uv.getY(index) * (rect.v1 - rect.v0));
        }
      }
      const tint = definition === undefined ? ([1, 1, 1] as const) : resolveBlockTint(definition, slot);
      for (let i = 0; i < 4; i++) {
        colors.push(tint[0], tint[1], tint[2]);
      }
    }
    uv.needsUpdate = true;
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    this.material = new THREE.MeshBasicMaterial({ map: this.ctx.blockAtlas.texture, vertexColors: true });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = 5;
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    this.renderObject = this.mesh;
    this.ctx.scene.add(this.mesh);
  }

  protected override disposeRender(): void {
    if (this.mesh !== null) {
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.material !== null) {
      this.material.dispose();
      this.material = null;
    }
  }

  public override onRestore(ctx: EntityWorldContext): void {
    // Rebind context and rebuild the mesh after a chunk reload.
    this.ctx = ctx;
    this.buildRender();
  }

  // ---- Simulation --------------------------------------------------------

  public onTick(ctx: EntityTickContext): void {
    this.age += 1;
    this.velocity.y -= 0.04;

    const oldY = this.position.y;
    this.position.y += this.velocity.y;
    this.velocity.y *= 0.98;

    const x = Math.floor(this.position.x);
    const z = Math.floor(this.position.z);
    const supportY = this.findSupportY(ctx, x, z, oldY, this.position.y);

    if (supportY !== undefined) {
      this.position.y = supportY + 1.5;
      this.finishLanding(ctx, supportY + 1);
    } else if (this.age > MAX_FALL_TIME || this.position.y <= 0) {
      this.dropAndRemove(ctx, x, Math.max(0, Math.floor(this.position.y)), z);
    }
  }

  private finishLanding(ctx: EntityTickContext, landingY: number): void {
    const world = ctx.world.blockUpdateWorld;
    const x = Math.floor(this.position.x);
    const z = Math.floor(this.position.z);
    const landing = world.getBlock(x, landingY, z);

    this.markRemoved();

    if (
      this.canReplace(landing) &&
      world.setBlock(x, landingY, z, this.blockId, {
        metadata: this.metadata,
        reason: 'world',
        notifyNeighbours: true,
        updateLighting: true,
      })
    ) {
      return;
    }
    // Cannot place (e.g. unloaded target or non-replaceable): drop as an item.
    this.spawnDrop(ctx, x, landingY, z);
  }

  private dropAndRemove(ctx: EntityTickContext, x: number, y: number, z: number): void {
    this.markRemoved();
    this.spawnDrop(ctx, x, y, z);
  }

  /** Spawns the block as a dropped item (Beta `EntityFallingSand.dropItem`). */
  private spawnDrop(ctx: EntityTickContext, x: number, y: number, z: number): void {
    const drop = { type: 'block' as const, id: this.blockId, count: 1, metadata: this.metadata };
    const item = new DroppedItemEntity(ctx.world, drop, x + 0.5, y + 0.2, z + 0.5, 10);
    ctx.world.manager.add(item);
  }

  private findSupportY(ctx: EntityTickContext, x: number, z: number, fromCenterY: number, toCenterY: number): number | undefined {
    if (toCenterY >= fromCenterY) {
      return undefined;
    }
    const high = Math.floor(fromCenterY - 0.5) - 1;
    const low = Math.floor(toCenterY - 0.5) - 1;
    for (let y = high; y >= low; y--) {
      if (y < 0) {
        continue;
      }
      if (!this.canFallThrough(ctx.world.blockUpdateWorld.getBlock(x, y, z))) {
        return y;
      }
    }
    return undefined;
  }

  private canFallThrough(id: BlockId): boolean {
    if (
      id === BlockIds.Air ||
      id === BlockIds.WaterFlowing || id === BlockIds.WaterStill ||
      id === BlockIds.LavaFlowing || id === BlockIds.LavaStill
    ) {
      return true;
    }
    return this.ctx.blockRegistry.getById(id)?.replaceable === true;
  }

  private canReplace(id: BlockId): boolean {
    return this.canFallThrough(id);
  }

  // ---- Serialisation (type-specific) -------------------------------------

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    map.set('Tile', nbt.int(this.blockId));
    map.set('Metadata', nbt.int(this.metadata));
    map.set('FallTime', nbt.int(this.age));
  }

  protected readEntityNbt(data: NbtCompound): void {
    const map = data.value;
    const tile = map.get('Tile');
    if (tile?.type === 'int') {
      this.blockId = tile.value;
    } else if (tile?.type === 'byte') {
      this.blockId = tile.value;
    }
    const metadata = map.get('Metadata');
    if (metadata?.type === 'int') {
      this.metadata = metadata.value;
    }
    const fallTime = map.get('FallTime');
    if (fallTime?.type === 'int') {
      this.age = fallTime.value;
    }
  }

  /** Factory used by the entity-type registry to load a saved falling block. */
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): FallingBlockEntity | undefined {
    const tile = data.value.get('Tile');
    const blockId = tile?.type === 'int' ? tile.value : (tile?.type === 'byte' ? tile.value : undefined);
    if (blockId === undefined) {
      return undefined;
    }
    const metadataTag = data.value.get('Metadata');
    const metadata = metadataTag?.type === 'int' ? metadataTag.value : 0;
    const entity = new FallingBlockEntity(ctx, blockId, metadata, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
