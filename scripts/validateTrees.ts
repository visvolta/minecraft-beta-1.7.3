import { BlockIds } from '../src/blocks/BlockId.ts';
import { JavaRandom } from '../src/world/generation/random/JavaRandom.ts';
import { TreeGenerator } from '../src/world/generation/trees/TreeGenerator.ts';
import { BirchTreeGenerator } from '../src/world/generation/trees/BirchTreeGenerator.ts';
import { TaigaTree1Generator } from '../src/world/generation/trees/TaigaTree1Generator.ts';
import { TaigaTree2Generator } from '../src/world/generation/trees/TaigaTree2Generator.ts';
import { BigTreeGenerator } from '../src/world/generation/trees/BigTreeGenerator.ts';
import { VEGETATION_BASE_COLORS, blendVegetationColor } from '../src/world/generation/climate/VegetationColors.ts';
import type { TreeWorldAccessor } from '../src/world/generation/trees/TreeWorldAccessor.ts';
class World implements TreeWorldAccessor { private readonly blocks=new Map<string,number>(); public getBlock(x:number,y:number,z:number):number{return this.blocks.get(`${x},${y},${z}`)??0;} public setBlock(x:number,y:number,z:number,id:number):void{this.blocks.set(`${x},${y},${z}`,id);} public getHeight(x:number,z:number):number{for(let y=127;y>=0;y--)if(this.getBlock(x,y,z)!==0)return y+1;return 0;} public soil():void{this.setBlock(0,63,0,BlockIds.Grass);} public count(id:number):number{return [...this.blocks.values()].filter(v=>v===id).length;} }
function assert(v:boolean,m:string):void{if(!v)throw new Error(m);}
for (const [name, gen] of [['oak',new TreeGenerator()],['birch',new BirchTreeGenerator()],['spruce',new TaigaTree2Generator()],['tall spruce',new TaigaTree1Generator()],['big oak',new BigTreeGenerator()]] as const) { const world=new World(); world.soil(); assert(gen.generate(world,new JavaRandom(123n),0,64,0),`${name} failed`); assert(world.count(BlockIds.Log)+world.count(BlockIds.BirchLog)+world.count(BlockIds.SpruceLog)>0,`${name} no trunk`); }
assert(blendVegetationColor(VEGETATION_BASE_COLORS.grass,[1,0,0],0)[1]===VEGETATION_BASE_COLORS.grass[1],'zero blend');
assert(blendVegetationColor(VEGETATION_BASE_COLORS.grass,[1,0,0],1)[0]===1,'full blend');
console.log('Tree generator and vegetation colour validation passed.');
