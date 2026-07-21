import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import { nbt, type NbtCompound, type NbtTag } from '../../persistence/nbt/Nbt';
import { EntityTypeIds } from '../core/EntityType';
import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import type { Entity } from '../core/Entity';
import { DamageSource } from '../damage/DamageSource';
import { LivingEntity } from '../living/LivingEntity';
import { ProjectileEntity, type ProjectileBlockHit } from './ProjectileEntity';

export class ArrowEntity extends ProjectileEntity {
  public readonly typeId = EntityTypeIds.Arrow;
  public readonly typeStringId = 'Arrow';
  protected readonly gravity = 0.05;
  protected readonly drag = 0.99;
  public inGround = false;
  public xTile = -1; public yTile = -1; public zTile = -1;
  public inTile = 0; public inData = 0; public arrowShake = 0; public ticksInGround = 0;
  private geometry: BoxGeometry | null = null; private material: MeshBasicMaterial | null = null;

  public constructor(ctx: EntityWorldContext, owner: Entity | null, x: number, y: number, z: number) {
    super(ctx, owner); this.setSize(0.5, 0.5); this.setPosition(x, y, z); this.buildModel();
  }
  public override onTick(ctx: EntityTickContext): void {
    if (this.arrowShake > 0) this.arrowShake--;
    if (this.inGround) {
      this.age++; this.ticksInGround++;
      if (this.ctx.blockUpdateWorld.getBlock(this.xTile, this.yTile, this.zTile) !== this.inTile) {
        this.inGround = false; this.ticksInGround = 0;
      } else if (this.ticksInGround >= 1200) this.markRemoved();
      return;
    }
    super.onTick(ctx);
  }
  protected onBlockImpact(hit: ProjectileBlockHit): void {
    this.xTile = hit.x; this.yTile = hit.y; this.zTile = hit.z; this.inTile = hit.blockId;
    this.inData = this.ctx.blockUpdateWorld.getBlockMetadata(hit.x, hit.y, hit.z);
    this.inGround = true; this.arrowShake = 7; this.velocity.x = this.velocity.y = this.velocity.z = 0;
  }
  protected onEntityImpact(target: LivingEntity | 'player'): void {
    if (target === 'player') this.ctx.player?.attackFromMob(4, this.owner ?? this);
    else target.attackEntityFrom(this.owner ? DamageSource.mob(this.owner) : DamageSource.generic(), 4);
    this.markRemoved();
  }
  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha); if (this.renderObject) { this.renderObject.rotation.y = this.yaw * Math.PI / 180; this.renderObject.rotation.x = this.pitch * Math.PI / 180; }
  }
  private buildModel(): void {
    this.geometry = new BoxGeometry(0.04, 0.04, 0.7); this.material = new MeshBasicMaterial({ color: 0xb9a06a });
    const mesh = new Mesh(this.geometry, this.material); this.renderObject = mesh; this.ctx.scene.add(mesh);
  }
  protected override disposeRender(): void { this.geometry?.dispose(); this.material?.dispose(); this.geometry = null; this.material = null; }
  public override onRestore(): void { this.buildModel(); }
  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    map.set('xTile', nbt.short(this.xTile)); map.set('yTile', nbt.short(this.yTile)); map.set('zTile', nbt.short(this.zTile));
    map.set('inTile', nbt.byte(this.inTile)); map.set('inData', nbt.byte(this.inData)); map.set('shake', nbt.byte(this.arrowShake));
    map.set('inGround', nbt.byte(this.inGround ? 1 : 0)); map.set('TicksInGround', nbt.int(this.ticksInGround)); map.set('TicksInAir', nbt.int(this.ticksInAir));
  }
  protected readEntityNbt(data: NbtCompound): void {
    const number = (key: string, fallback = 0): number => { const t = data.value.get(key); return t && (t.type === 'byte' || t.type === 'short' || t.type === 'int') ? t.value : fallback; };
    this.xTile = number('xTile', -1); this.yTile = number('yTile', -1); this.zTile = number('zTile', -1); this.inTile = number('inTile'); this.inData = number('inData');
    this.arrowShake = number('shake'); this.inGround = number('inGround') !== 0; this.ticksInGround = number('TicksInGround'); this.ticksInAir = number('TicksInAir'); this.owner = null;
  }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): ArrowEntity { const e = new ArrowEntity(ctx, null, 0, 0, 0); e.readFromNbt(data); return e; }
}
