import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import type { NbtCompound, NbtTag } from '../../persistence/nbt/Nbt';
import { BipedHostileEntity } from './BipedHostileEntity';
import { ZombieModel } from './models/ZombieModel';
import type { Drop } from '../items/BlockDropResolver';

export class ZombieEntity extends BipedHostileEntity {
  public readonly typeId = EntityTypeIds.Zombie;
  public readonly typeStringId = 'Zombie';
  public readonly meleeDamage = 5;
  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx); this.setSize(0.6, 1.8); this.setPosition(x, y, z); this.moveSpeed = 0.5; this.rebuildModel();
  }
  public override onTick(ctx: EntityTickContext): void {
    const exposure = this.getDaylightExposure();
    if (exposure.canIgnite && this.nextInt(30000) / 1000 < (exposure.brightness - 0.4) * 2) this.setOnFire(300);
    super.onTick(ctx);
  }
  protected rebuildModel(): void { this.attachBiped(new ZombieModel()); }
  protected override getDropItems(): Drop[] { const count=this.nextInt(3); return count ? [{type:'item',id:'feather',count,metadata:0}] : []; }
  protected override getAmbientSoundId(): string { return 'mob.zombie'; }
  protected override getHurtSoundId(): string { return 'mob.zombiehurt'; }
  protected override getDeathSoundId(): string { return 'mob.zombiedeath'; }
  protected writeEntityNbt(map: Map<string, NbtTag>): void { this.writeHostileNbt(map); }
  protected readEntityNbt(data: NbtCompound): void { this.readHostileNbt(data); }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): ZombieEntity { const e = new ZombieEntity(ctx, 0, 0, 0); e.readFromNbt(data); return e; }
}
