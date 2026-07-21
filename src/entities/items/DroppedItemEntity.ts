import * as THREE from 'three';
import { Entity } from '../core/Entity';
import { EntityTypeIds } from '../core/EntityType';
import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { nbt, type NbtCompound, type NbtTag } from '../../persistence/nbt/Nbt';
import { BlockIds } from '../../blocks/BlockId';
import type { Drop } from './BlockDropResolver';
import { classifyItemRender, isBlock3dCategory, isFlatItemCategory, isToolCategory } from '../../inventory/ItemRenderClassifier';
import { BlockItemModelBuilder } from '../../inventory/BlockItemModelBuilder';
import { resolveBlockTexture } from '../../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../../blocks/resolveBlockTint';
import { ItemIconResolver } from '../../inventory/ItemIconResolver';

/** Dropped-item cube footprint (Beta `EntityItem` is 0.25×0.25). */
const ITEM_SIZE = 0.25;
/** Beta despawn age: 6000 ticks (5 minutes). */
const DESPAWN_AGE = 6000;
/** Terminal fall speed used by the current implementation (blocks/tick). */
const TERMINAL_VELOCITY = -1.0;

/**
 * A dropped item entity (Beta `EntityItem`).
 *
 * Now built on the shared {@link Entity} base: identity, transform, lifecycle,
 * chunk ownership and base serialisation come from the base; per-tick gravity,
 * drag, pickup-delay, despawn and the item visuals are item-specific and live
 * here. Collision uses the shared metadata-aware mover.
 */
export class DroppedItemEntity extends Entity {
  public readonly typeId = EntityTypeIds.DroppedItem;
  public readonly typeStringId = 'Item';

  /** The dropped stack. `count` mutates on partial pickup. */
  public drop: Drop;
  public delayBeforeCanPickup: number;
  public hoverStart: number;
  /** Beta item health (fire/damage); kept for parity, not yet applied. */
  public health = 5;

  private readonly icons = new ItemIconResolver();
  private group: THREE.Group | null = null;

  public constructor(
    ctx: EntityWorldContext,
    drop: Drop,
    x: number,
    y: number,
    z: number,
    delay = 10,
    hoverStart?: number,
  ) {
    super();
    this.drop = drop;
    this.delayBeforeCanPickup = delay;
    this.hoverStart = hoverStart ?? Math.random() * Math.PI * 2;

    this.setSize(ITEM_SIZE, ITEM_SIZE);
    this.setPosition(x, y, z);

    // Beta initial launch velocity.
    this.velocity.x = Math.random() * 0.2 - 0.1;
    this.velocity.y = 0.2;
    this.velocity.z = Math.random() * 0.2 - 0.1;

    this.ctx = ctx;
    this.buildRender();
  }

  /** World context captured at construction for render rebuilds on restore. */
  private ctx: EntityWorldContext;

  // ---- Rendering ---------------------------------------------------------

  private buildRender(): void {
    const group = new THREE.Group();
    group.position.set(this.position.x, this.position.y, this.position.z);
    this.group = group;
    this.renderObject = group;
    this.rebuildVisualsForCount(this.drop.count);
    this.ctx.scene.add(group);
  }

  public rebuildVisualsForCount(count: number): void {
    const group = this.group;
    if (group === null) {
      return;
    }

    // Clear old visual meshes cleanly.
    while (group.children.length > 0) {
      const child = group.children[0]!;
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (
          child.material instanceof THREE.Material &&
          child.material !== this.ctx.heldBlockMaterial &&
          child.material !== this.ctx.itemHeldMaterial
        ) {
          child.material.dispose();
        }
      }
    }

    const category = classifyItemRender({ id: this.drop.id, type: this.drop.type }, this.ctx.blockRegistry);
    const def = this.ctx.blockRegistry.getById(this.drop.id as number);

    let copyCount = 1;
    if (count > 20) copyCount = 4;
    else if (count > 5) copyCount = 3;
    else if (count > 1) copyCount = 2;

    for (let i = 0; i < copyCount; i++) {
      let mesh: THREE.Mesh | undefined;

      if (category === 'unsupported' || category === 'empty') {
        mesh = new THREE.Mesh(BlockItemModelBuilder.buildDebugPlaceholder(), this.ctx.heldBlockMaterial);
      } else if (isBlock3dCategory(category) && def !== undefined) {
        mesh = new THREE.Mesh(BlockItemModelBuilder.build3DGeometry(def, this.ctx.blockAtlas), this.ctx.heldBlockMaterial);
        mesh.scale.set(0.25, 0.25, 0.25);
      } else if ((isFlatItemCategory(category) || isToolCategory(category)) && this.drop.type === 'block' && def !== undefined) {
        const texName = resolveBlockTexture(def, 'side') || resolveBlockTexture(def, 'top') || 'stone';
        let uvRect = this.ctx.blockAtlas.getUvRect(texName);
        const tint = resolveBlockTint(def, 'side');
        let useItemAtlas = false;

        if (uvRect === undefined) {
          const itemPath = this.icons.resolve(String(this.drop.id));
          const nameMatch = itemPath.match(/\/textures\/items\/([^/]+)\.png$/);
          if (nameMatch && nameMatch[1]) {
            uvRect = this.ctx.itemAtlas.getUvRect(nameMatch[1]);
            useItemAtlas = uvRect !== undefined;
          }
        }

        if (uvRect === undefined) {
          mesh = new THREE.Mesh(BlockItemModelBuilder.buildDebugPlaceholder(), this.ctx.heldBlockMaterial);
        } else {
          const geometry = this.createOpposedQuadsGeometry(uvRect.u0, uvRect.v0, uvRect.u1, uvRect.v1, tint[0], tint[1], tint[2]);
          mesh = new THREE.Mesh(geometry, useItemAtlas ? this.ctx.itemHeldMaterial : this.ctx.heldBlockMaterial);
        }
      } else if (isFlatItemCategory(category) || isToolCategory(category)) {
        const itemKey = String(this.drop.id);
        let uvRect = this.ctx.itemAtlas.getUvRect(itemKey);
        let useBlockAtlas = false;

        if (uvRect === undefined) {
          const resolvedPath = this.icons.resolve(itemKey);
          const itemMatch = resolvedPath.match(/\/textures\/items\/([^/]+)\.png$/);
          const blockMatch = resolvedPath.match(/\/textures\/blocks\/([^/]+)\.png$/);
          if (itemMatch && itemMatch[1]) {
            uvRect = this.ctx.itemAtlas.getUvRect(itemMatch[1]);
          } else if (blockMatch && blockMatch[1]) {
            uvRect = this.ctx.blockAtlas.getUvRect(blockMatch[1]);
            useBlockAtlas = uvRect !== undefined;
          }
        }

        if (uvRect === undefined) {
          mesh = new THREE.Mesh(BlockItemModelBuilder.buildDebugPlaceholder(), this.ctx.itemHeldMaterial);
        } else {
          const geometry = this.createOpposedQuadsGeometry(uvRect.u0, uvRect.v0, uvRect.u1, uvRect.v1, 1.0, 1.0, 1.0);
          mesh = new THREE.Mesh(geometry, useBlockAtlas ? this.ctx.heldBlockMaterial : this.ctx.itemHeldMaterial);
        }
      } else {
        mesh = new THREE.Mesh(BlockItemModelBuilder.buildDebugPlaceholder(), this.ctx.heldBlockMaterial);
      }

      if (i > 0) {
        mesh.position.set(
          (Math.random() * 2 - 1) * 0.15,
          (Math.random() * 2 - 1) * 0.15,
          (Math.random() * 2 - 1) * 0.15,
        );
      }
      group.add(mesh);
    }
  }

  public override updateRenderInterpolation(alpha: number): void {
    const group = this.group;
    if (group === null) {
      return;
    }
    const p = this.previousPosition;
    const c = this.position;
    const x = p.x + (c.x - p.x) * alpha;
    const y = p.y + (c.y - p.y) * alpha;
    const z = p.z + (c.z - p.z) * alpha;

    // Beta spin + bob, driven by integer age (as before).
    group.rotation.y = (this.age / 20.0) + this.hoverStart;
    const bobOffset = Math.sin(this.age / 10.0 + this.hoverStart) * 0.1 + 0.1;
    group.position.set(x, y + bobOffset, z);
  }

  protected override disposeRender(): void {
    const group = this.group;
    if (group === null) {
      return;
    }
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (
          child.material instanceof THREE.Material &&
          child.material !== this.ctx.heldBlockMaterial &&
          child.material !== this.ctx.itemHeldMaterial
        ) {
          child.material.dispose();
        }
      }
    });
    this.group = null;
  }

  public override onRestore(ctx: EntityWorldContext): void {
    this.ctx = ctx;
    this.buildRender();
  }

  // ---- Simulation --------------------------------------------------------

  public onTick(ctx: EntityTickContext): void {
    if (this.delayBeforeCanPickup > 0) {
      this.delayBeforeCanPickup--;
    }

    // Gravity + terminal clamp (preserves current behaviour).
    this.velocity.y -= 0.04;
    if (this.velocity.y < TERMINAL_VELOCITY) {
      this.velocity.y = TERMINAL_VELOCITY;
    }

    // Shared metadata-aware collision mover (sets onGround, zeroes blocked axes).
    ctx.world.physics.move(this);

    // Drag / ground friction (Beta: air 0.98; ground slipperiness×0.98).
    let friction = 0.98;
    if (this.onGround) {
      let slipperiness = 0.6;
      const belowId = ctx.world.blockUpdateWorld.getBlock(
        Math.floor(this.position.x),
        Math.floor(this.position.y - 0.1),
        Math.floor(this.position.z),
      );
      if (belowId === BlockIds.Ice) {
        slipperiness = 0.98;
      }
      friction = slipperiness * 0.98;
    }
    this.velocity.x *= friction;
    this.velocity.z *= friction;
    this.velocity.y *= 0.98;

    if (this.onGround) {
      this.velocity.y *= -0.5;
    }

    this.age++;
    if (this.age >= DESPAWN_AGE) {
      this.markRemoved();
    }
  }

  private createOpposedQuadsGeometry(
    u0: number, v0: number, u1: number, v1: number,
    r = 1.0, g = 1.0, b = 1.0,
  ): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry();
    const half = 0.2;

    const positions = new Float32Array([
      -half, half, 0.001,
      half, half, 0.001,
      -half, -half, 0.001,
      half, -half, 0.001,
      -half, half, -0.001,
      half, half, -0.001,
      -half, -half, -0.001,
      half, -half, -0.001,
    ]);

    const uvs = new Float32Array([
      u0, v0,
      u1, v0,
      u0, v1,
      u1, v1,
      u1, v0,
      u0, v0,
      u1, v1,
      u0, v1,
    ]);

    const colors = new Float32Array(24);
    for (let i = 0; i < 8; i++) {
      colors[i * 3 + 0] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    const indices = [
      0, 2, 1,
      1, 2, 3,
      5, 6, 4,
      7, 6, 5,
    ];

    geom.setIndex(indices);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    return geom;
  }

  // ---- Serialisation (type-specific) -------------------------------------

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    map.set('Health', nbt.short(this.health));
    map.set('PickupDelay', nbt.short(this.delayBeforeCanPickup));
    map.set('HoverStart', nbt.float(this.hoverStart));
    const item = new Map<string, NbtTag>();
    item.set('Type', nbt.string(this.drop.type));
    item.set('Id', nbt.string(String(this.drop.id)));
    item.set('Count', nbt.int(this.drop.count));
    item.set('Metadata',nbt.int(this.drop.metadata));item.set('Damage',nbt.int(this.drop.damage??0));
    map.set('Item', nbt.compound(item));
  }

  protected readEntityNbt(data: NbtCompound): void {
    const map = data.value;

    const health = map.get('Health');
    if (health?.type === 'short') {
      this.health = health.value;
    }

    const delay = map.get('PickupDelay');
    if (delay?.type === 'short') {
      this.delayBeforeCanPickup = delay.value;
    } else if (delay?.type === 'int') {
      this.delayBeforeCanPickup = delay.value;
    }

    const hover = map.get('HoverStart');
    if (hover?.type === 'float') {
      this.hoverStart = hover.value;
    }

    const item = map.get('Item');
    if (item?.type === 'compound') {
      const parsed = DroppedItemEntity.parseDrop(item.value);
      if (parsed !== undefined) {
        this.drop = parsed;
        this.rebuildVisualsForCount(parsed.count);
      }
    }
  }

  private static parseDrop(map: ReadonlyMap<string, NbtTag>): Drop | undefined {
    const type = map.get('Type');
    const id = map.get('Id');
    const count = map.get('Count');
    const metadata=map.get('Metadata');const damage=map.get('Damage');
    if (type?.type !== 'string' || id?.type !== 'string') {
      return undefined;
    }
    if (type.value !== 'block' && type.value !== 'item') {
      return undefined;
    }
    const dropId = type.value === 'block' ? Number(id.value) : id.value;
    if (type.value === 'block' && !Number.isFinite(dropId as number)) {
      return undefined;
    }
    return {
      type: type.value,
      id: dropId,
      count: count?.type === 'int' ? count.value : (count?.type === 'short' ? count.value : 1),
      metadata:metadata?.type==='int'?metadata.value:(metadata?.type==='short'?metadata.value:0),damage:damage?.type==='int'?damage.value:(damage?.type==='short'?damage.value:0),
    };
  }

  /** Factory used by the entity-type registry to load a saved item. */
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): DroppedItemEntity | undefined {
    const item = data.value.get('Item');
    const drop = item?.type === 'compound' ? DroppedItemEntity.parseDrop(item.value) : undefined;
    if (drop === undefined) {
      return undefined;
    }
    const entity = new DroppedItemEntity(ctx, drop, 0, 0, 0, 10);
    entity.readFromNbt(data);
    return entity;
  }
}
