import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { BlockIds } from '../src/blocks/BlockId.ts';
import { DIG_SOUND_MATERIALS, STEP_SOUND_MATERIALS } from '../src/audio/AudioManifest.ts';
function assert(v:boolean,m:string):void{if(!v)throw new Error(m);}
const blocks=new BlockRegistry(); registerDefaultBlocks(blocks);
for(const def of blocks.values()) if(def.id!==BlockIds.Air && def.replaceable!==true) assert(def.sound!==undefined, `${def.name} has sound mapping`);
assert(blocks.getById(BlockIds.Glass)?.sound?.dig==='glass','glass uses glass material');
assert(blocks.getById(BlockIds.Planks)?.sound?.dig==='wood','planks use wood');
assert(blocks.getById(BlockIds.Log)?.sound?.dig==='wood','logs use wood');
assert(blocks.getById(BlockIds.Stone)?.sound?.dig==='stone','stone uses stone');
assert(blocks.getById(BlockIds.Dirt)?.sound?.dig==='grass','dirt maps to grass');
assert(blocks.getById(BlockIds.Sand)?.sound?.dig==='sand','sand maps to sand');
assert(blocks.getById(BlockIds.Gravel)?.sound?.dig==='gravel','gravel maps to gravel');
assert(blocks.getById(BlockIds.Wool)?.sound?.dig==='cloth','wool maps to cloth');
assert(DIG_SOUND_MATERIALS.stone.length===4&&STEP_SOUND_MATERIALS.stone.length===6,'stone dig/step variants complete');
console.log('Audio block mapping validation passed.');
