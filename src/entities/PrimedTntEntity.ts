import * as THREE from 'three';
import { Entity } from './core/Entity';
import { EntityTypeIds } from './core/EntityType';
import type { EntityTickContext, EntityWorldContext } from './core/EntityContext';
import { AABB } from '../physics/AABB';
import { nbt, type NbtCompound, type NbtTag } from '../persistence/nbt/Nbt';
import { BlockIds } from '../blocks/BlockId';
import { resolveBlockTexture } from '../blocks/resolveBlockTexture';

/** Beta Primed TNT size is 0.98. */
const TNT_SIZE = 0.98;

export class PrimedTntEntity extends Entity {
  public readonly typeId = EntityTypeIds.PrimedTnt;
  public readonly typeStringId = 'PrimedTnt';

  public fuse = 80;

  private ctx: EntityWorldContext;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial | null = null;

  public constructor(
    ctx: EntityWorldContext,
    x: number,
    y: number,
    z: number,
    fuse = 80,
  ) {
    super();
    this.ctx = ctx;
    this.fuse = fuse;
    this.setSize(TNT_SIZE, TNT_SIZE);
    this.setPosition(x, y, z);
    this.buildRender();
  }

  /** Centre-based AABB. */
  public override getAABB(): AABB {
    const half = TNT_SIZE / 2;
    return new AABB(
      this.position.x - half,
      this.position.y - half,
      this.position.z - half,
      this.position.x + half,
      this.position.y + half,
      this.position.z + half,
    );
  }

  private buildRender(): void {
    const definition = this.ctx.blockRegistry.getById(BlockIds.TNT);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const slots = ['side', 'side', 'top', 'bottom', 'side', 'side'] as const;

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
    }
    uv.needsUpdate = true;

    this.material = new THREE.MeshBasicMaterial({ map: this.ctx.blockAtlas.texture });
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

  public override onRestore(_ctx: EntityWorldContext): void {
    this.buildRender();
  }

  public onTick(_ctx: EntityTickContext): void {
    this.fuse -= 1;
    if (this.fuse <= 0) {
      this.markRemoved();
      this.explode();
      return;
    }

    // Apply gravity and movement (simplified Beta mover)
    this.velocity.y -= 0.04;
    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;
    this.position.z += this.velocity.z;
    this.velocity.x *= 0.98;
    this.velocity.y *= 0.98;
    this.velocity.z *= 0.98;

    if (this.onGround) {
        this.velocity.x *= 0.7;
        this.velocity.z *= 0.7;
        this.velocity.y *= -0.5;
    }

    // Visual flashing
    if (this.material) {
        if ((this.fuse / 5) % 2 === 0) {
            this.material.color.set(0xffffff);
        } else {
            this.material.color.set(0xffffff); // Wait, Beta flash was a white overlay
            // For now, let's just make it bright
        }
    }
  }

  private explode(): void {
    if (this.ctx.explode) {
      this.ctx.explode(this, this.position.x, this.position.y, this.position.z, 4.0, false);
    }
  }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    map.set('Fuse', nbt.byte(this.fuse));
  }

  protected readEntityNbt(data: NbtCompound): void {
    const map = data.value;
    const fuse = map.get('Fuse');
    if (fuse?.type === 'byte') {
      this.fuse = fuse.value;
    }
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): PrimedTntEntity | undefined {
    const entity = new PrimedTntEntity(ctx, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
