import { BlockIds } from '../../../blocks/BlockId';
import type { JavaRandom } from '../random/JavaRandom';
import type { TreeWorldAccessor } from './TreeWorldAccessor';
import { isNonOpaque } from './TreeWorldAccessor';
/** Exact Beta WorldGenForest shape; birch uses species metadata via dedicated project block IDs. */
export class BirchTreeGenerator {
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    const height = random.nextInt(3) + 5;
    if (y < 1 || y + height + 1 > 128) return false;
    for (let yy=y; yy<=y+height+1; yy++) {
      const radius = yy === y ? 0 : yy >= y + height - 1 ? 2 : 1;
      for (let xx=x-radius; xx<=x+radius; xx++) for (let zz=z-radius; zz<=z+radius; zz++) {
        const block=world.getBlock(xx,yy,zz); if (yy < 0 || yy >=128 || (block !== BlockIds.Air && block !== BlockIds.BirchLeaves)) return false;
      }
    }
    const soil=world.getBlock(x,y-1,z); if ((soil!==BlockIds.Grass && soil!==BlockIds.Dirt) || y >= 128-height-1) return false;
    world.setBlock(x,y-1,z,BlockIds.Dirt);
    for(let yy=y-3+height;yy<=y+height;yy++) { const offset=yy-(y+height), radius=1-Math.trunc(offset/2); for(let xx=x-radius;xx<=x+radius;xx++) for(let zz=z-radius;zz<=z+radius;zz++) { const dx=xx-x,dz=zz-z; if ((Math.abs(dx)!==radius || Math.abs(dz)!==radius || random.nextInt(2)!==0 && offset!==0) && isNonOpaque(world.getBlock(xx,yy,zz))) world.setBlock(xx,yy,zz,BlockIds.BirchLeaves); }}
    for(let yy=0;yy<height;yy++) { const block=world.getBlock(x,y+yy,z); if(block===BlockIds.Air || block===BlockIds.BirchLeaves) world.setBlock(x,y+yy,z,BlockIds.BirchLog); }
    return true;
  }
}
