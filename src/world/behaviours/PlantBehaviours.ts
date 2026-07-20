import { BlockIds } from '../../blocks/BlockId';
import type { BlockId } from '../../blocks/BlockId';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import { AABB } from '../../physics/AABB';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { TreeGenerator } from '../generation/trees/TreeGenerator';
import { BigTreeGenerator } from '../generation/trees/BigTreeGenerator';
import { BirchTreeGenerator } from '../generation/trees/BirchTreeGenerator';
import { TaigaTree2Generator } from '../generation/trees/TaigaTree2Generator';
import type { TreeWorldAccessor } from '../generation/trees/TreeWorldAccessor';
import type { JavaRandom } from '../generation/random/JavaRandom';

function isWater(id: BlockId): boolean {
  return id === BlockIds.WaterFlowing || id === BlockIds.WaterStill;
}

function isSoil(id: BlockId): boolean {
  return id === BlockIds.Dirt || id === BlockIds.Grass || id === BlockIds.Farmland || id === BlockIds.Sand;
}

function isSolid(registry: BlockRegistry, id: BlockId): boolean {
  return registry.getById(id)?.solid === true;
}

abstract class SupportedPlant implements BlockBehaviour {
  public readonly randomTicks = true;

  public constructor(protected readonly registry: BlockRegistry) {}

  public abstract canSurvive(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): boolean;

  public neighborChanged(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): void {
    this.removeIfUnsupported(ctx, x, y, z);
  }

  public randomTick(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): void {
    this.removeIfUnsupported(ctx, x, y, z);
  }

  protected removeIfUnsupported(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): void {
    if (!this.canSurvive(ctx, x, y, z)) {
      ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'neighbour', notifyNeighbours: true, updateLighting: true });
    }
  }
}

class FlowerBehaviour extends SupportedPlant {
  public canSurvive(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): boolean {
    const below = ctx.world.getBlock(x, y - 1, z);
    return isSoil(below) && ctx.world.getBlock(x, y, z) !== BlockIds.WaterFlowing && ctx.world.getBlock(x, y, z) !== BlockIds.WaterStill;
  }
}

class MushroomBehaviour extends SupportedPlant {
  public canSurvive(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): boolean {
    const below = ctx.world.getBlock(x, y - 1, z);
    return isSolid(this.registry, below) && !isSoil(below) || isSoil(below);
  }

  public randomTick(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): void {
    super.randomTick(ctx, x, y, z);
    if (ctx.world.getBlock(x, y, z) !== BlockIds.BrownMushroom && ctx.world.getBlock(x, y, z) !== BlockIds.RedMushroom) return;
    if ((ctx.nextInt?.(25) ?? 0) !== 0) return;
    const dx = (ctx.nextInt?.(3) ?? 0) - 1;
    const dz = (ctx.nextInt?.(3) ?? 0) - 1;
    const targetX = x + dx;
    const targetZ = z + dz;
    if (ctx.world.getBlock(targetX, y, targetZ) === BlockIds.Air && this.canSurvive(ctx, targetX, y, targetZ)) {
      ctx.world.setBlock(targetX, y, targetZ, ctx.world.getBlock(x, y, z), { reason: 'world', notifyNeighbours: true, updateLighting: false });
    }
  }
}

class CactusBehaviour extends SupportedPlant {
  public canSurvive(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): boolean {
    if (ctx.world.getBlock(x, y - 1, z) !== BlockIds.Sand && ctx.world.getBlock(x, y - 1, z) !== BlockIds.Cactus) return false;
    return !isSolid(this.registry, ctx.world.getBlock(x + 1, y, z)) &&
      !isSolid(this.registry, ctx.world.getBlock(x - 1, y, z)) &&
      !isSolid(this.registry, ctx.world.getBlock(x, y, z + 1)) &&
      !isSolid(this.registry, ctx.world.getBlock(x, y, z - 1));
  }

  public randomTick(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): void {
    super.randomTick(ctx, x, y, z);
    if ((ctx.nextInt?.(16) ?? 0) !== 0 || !this.canSurvive(ctx, x, y, z)) return;
    let height = 1;
    while (ctx.world.getBlock(x, y - height, z) === BlockIds.Cactus) height += 1;
    if (height < 3 && ctx.world.getBlock(x, y + 1, z) === BlockIds.Air) {
      ctx.world.setBlock(x, y + 1, z, BlockIds.Cactus, { reason: 'world', notifyNeighbours: true, updateLighting: true });
    }
  }

  public getBoundingBoxes(_ctx: BlockBehaviourContext | any, x: number, y: number, z: number, type: 'collision' | 'selection' | 'interaction'): AABB[] | undefined {
    if (type === 'collision') {
      return [new AABB(x + 0.0625, y, z + 0.0625, x + 0.9375, y + 1, z + 0.9375)];
    }
    return undefined; // default
  }
}

class ReedBehaviour extends SupportedPlant {
  public canSurvive(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): boolean {
    const below = ctx.world.getBlock(x, y - 1, z);
    if (below !== BlockIds.Reed && below !== BlockIds.Dirt && below !== BlockIds.Grass && below !== BlockIds.Sand) return false;
    return isWater(ctx.world.getBlock(x + 1, y - 1, z)) || isWater(ctx.world.getBlock(x - 1, y - 1, z)) || isWater(ctx.world.getBlock(x, y - 1, z + 1)) || isWater(ctx.world.getBlock(x, y - 1, z - 1));
  }

  public randomTick(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): void {
    super.randomTick(ctx, x, y, z);
    if ((ctx.nextInt?.(16) ?? 0) !== 0 || !this.canSurvive(ctx, x, y, z)) return;
    let height = 1;
    while (ctx.world.getBlock(x, y - height, z) === BlockIds.Reed) height += 1;
    if (height < 3 && ctx.world.getBlock(x, y + 1, z) === BlockIds.Air) {
      ctx.world.setBlock(x, y + 1, z, BlockIds.Reed, { reason: 'world', notifyNeighbours: true, updateLighting: false });
    }
  }
}

class CropBehaviour extends SupportedPlant {
  public canSurvive(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): boolean {
    return ctx.world.getBlock(x, y - 1, z) === BlockIds.Farmland;
  }

  public randomTick(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): void {
    super.randomTick(ctx, x, y, z);
    if (!this.canSurvive(ctx, x, y, z) || (ctx.nextInt?.(3) ?? 0) !== 0) return;
    const metadata = ctx.world.getBlockMetadata(x, y, z);
    if (metadata < 7) ctx.world.setBlockMetadata(x, y, z, metadata + 1, { affectsMesh: true, affectsWeather: false, affectsLight: false });
  }
}

class SaplingBehaviour extends SupportedPlant {
  private readonly oak = new TreeGenerator();
  private readonly birch = new BirchTreeGenerator();
  private readonly spruce = new TaigaTree2Generator();
  public canSurvive(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): boolean { return isSoil(ctx.world.getBlock(x, y - 1, z)); }
  public randomTick(ctx: BlockBehaviourContext | any, x: number, y: number, z: number): void {
    super.randomTick(ctx, x, y, z);
    if (ctx.world.getBlock(x, y, z) !== BlockIds.Sapling || !this.canSurvive(ctx,x,y,z)) return;
    // Verified BlockSapling order: support check, combined light at y+1, then nextInt(30).
    if (ctx.world.getSkylight(x, y + 1, z) < 9 || (ctx.nextInt?.(30) ?? 1) !== 0) return;
    // Known safe deviation: a live client must not synchronously load neighbours for an attempted tree.
    if (!ctx.world.areChunksLoadedAround(x, z, 1)) return;
    const species = ctx.world.getBlockMetadata(x,y,z) & 3;
    const random = { nextInt: (bound: number) => ctx.nextInt?.(bound) ?? 0, nextLong: () => ctx.nextLong?.() ?? 0n } as JavaRandom;
    const world: TreeWorldAccessor = { getBlock: (wx,wy,wz) => ctx.world.getBlock(wx,wy,wz), setBlock: (wx,wy,wz,id) => { ctx.world.setBlock(wx,wy,wz,id,{ reason:'world', notifyNeighbours:true, updateLighting:true }); }, getHeight: (wx,wz) => { for(let yy=127;yy>=0;yy--) if(ctx.world.getBlock(wx,yy,wz)!==BlockIds.Air) return yy+1; return 0; } };
    ctx.world.setBlock(x,y,z,BlockIds.Air,{ reason:'world', notifyNeighbours:false, updateLighting:true });
    let ok: boolean;
    if (species === 1) ok=this.spruce.generate(world,random,x,y,z);
    else if (species === 2) ok=this.birch.generate(world,random,x,y,z);
    else { const generator=(random.nextInt(10)===0) ? new BigTreeGenerator() : this.oak; ok=generator.generate(world,random,x,y,z); }
    if (!ok) ctx.world.setBlock(x,y,z,BlockIds.Sapling,{metadata:species,reason:'world',notifyNeighbours:true,updateLighting:true});
  }
}

export function registerPlantBehaviours(registry: BlockBehaviourRegistry, blocks: BlockRegistry): void {
  const flowers = [BlockIds.Dandelion, BlockIds.Rose, BlockIds.TallGrass, BlockIds.DeadBush];
  for (const id of flowers) registry.register(id, new FlowerBehaviour(blocks));
  registry.register(BlockIds.BrownMushroom, new MushroomBehaviour(blocks));
  registry.register(BlockIds.RedMushroom, new MushroomBehaviour(blocks));
  registry.register(BlockIds.Cactus, new CactusBehaviour(blocks));
  registry.register(BlockIds.Reed, new ReedBehaviour(blocks));
  registry.register(BlockIds.Crops, new CropBehaviour(blocks));
  registry.register(BlockIds.Sapling, new SaplingBehaviour(blocks));
}
