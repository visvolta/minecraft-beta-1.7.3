import type { DigSoundMaterial, StepSoundMaterial } from './BlockSoundMaterial';

export interface AudioEntry { readonly key: string; readonly path: string; readonly group: string; }

const sound = (key: string, path: string, group: string): AudioEntry => ({ key, path, group });
const numbered = (prefixKey: string, basePath: string, from: number, to: number, group: string): AudioEntry[] => {
  const out: AudioEntry[] = [];
  for (let i = from; i <= to; i++) out.push(sound(`${prefixKey}${i}`, `${basePath}${i}.ogg`, group));
  return out;
};

export const AUDIO_NORMALIZATIONS = [
  'creative4.og -> creative4.ogg',
  'meun1.ogg -> menu1.ogg',
  'eat1ogg -> eat1.ogg',
  'cloth 1-4 -> cloth1.ogg through cloth4.ogg',
  'grass-6 -> grass1.ogg through grass6.ogg',
  'sheep.ogg treated as mob/sheep folder context, not a standalone required file',
] as const;

export const MUSIC_GAME = [
  'calm1','calm2','calm3','hal1','hal2','hal3','hal4','nuance1','nuance2','piano1','piano2','piano3',
].map((name) => sound(`music.game.${name}`, `/audio/music/game/${name}.ogg`, 'music.game'));
export const MUSIC_CREATIVE = numbered('music.game.creative.creative', '/audio/music/game/creative/creative', 1, 6, 'music.creative');
export const MUSIC_NETHER = numbered('music.game.nether.nether', '/audio/music/game/nether/nether', 1, 4, 'music.nether');
export const MUSIC_MENU = numbered('music.menu.menu', '/audio/music/menu/menu', 1, 4, 'music.menu');

export const FIRE_SOUNDS = ['fire','ignite'].map((name) => sound(`fire.${name}`, `/audio/sounds/fire/${name}.ogg`, 'fire'));
export const RANDOM_SOUNDS = [
  'splash','pop','glass1','glass2','glass3','chestclosed','chestopen','click','door_close','door_open','drink','eat1','eat2','eat3','explode1','explode2','explode3',
].map((name) => sound(`random.${name}`, `/audio/sounds/random/${name}.ogg`, 'random'));

export const MOB_SOUNDS = [
  sound('mob.zombie.death','/audio/sounds/mob/zombie/death.ogg','mob.zombie'), ...numbered('mob.zombie.hurt','/audio/sounds/mob/zombie/hurt',1,2,'mob.zombie'), ...numbered('mob.zombie.say','/audio/sounds/mob/zombie/say',1,3,'mob.zombie'), ...numbered('mob.zombie.step','/audio/sounds/mob/zombie/step',1,4,'mob.zombie'),
  sound('mob.spider.death','/audio/sounds/mob/spider/death.ogg','mob.spider'), ...numbered('mob.spider.say','/audio/sounds/mob/spider/say',1,4,'mob.spider'), ...numbered('mob.spider.step','/audio/sounds/mob/spider/step',1,4,'mob.spider'),
  ...numbered('mob.chicken.hurt','/audio/sounds/mob/chicken/hurt',1,2,'mob.chicken'), sound('mob.chicken.plop','/audio/sounds/mob/chicken/plop.ogg','mob.chicken'), ...numbered('mob.chicken.say','/audio/sounds/mob/chicken/say',1,3,'mob.chicken'), ...numbered('mob.chicken.step','/audio/sounds/mob/chicken/step',1,2,'mob.chicken'),
  ...numbered('mob.cow.hurt','/audio/sounds/mob/cow/hurt',1,3,'mob.cow'), ...numbered('mob.cow.say','/audio/sounds/mob/cow/say',1,4,'mob.cow'), ...numbered('mob.cow.step','/audio/sounds/mob/cow/step',1,4,'mob.cow'),
  sound('mob.creeper.death','/audio/sounds/mob/creeper/death.ogg','mob.creeper'), ...numbered('mob.creeper.say','/audio/sounds/mob/creeper/say',1,4,'mob.creeper'),
  sound('mob.pig.death','/audio/sounds/mob/pig/death.ogg','mob.pig'), ...numbered('mob.pig.say','/audio/sounds/mob/pig/say',1,3,'mob.pig'), ...numbered('mob.pig.step','/audio/sounds/mob/pig/step',1,5,'mob.pig'),
  ...numbered('mob.sheep.say','/audio/sounds/mob/sheep/say',1,3,'mob.sheep'), sound('mob.sheep.shear','/audio/sounds/mob/sheep/shear.ogg','mob.sheep'), ...numbered('mob.sheep.step','/audio/sounds/mob/sheep/step',1,5,'mob.sheep'),
];

export const CAVE_SOUNDS = numbered('ambient.cave.cave','/audio/sounds/ambient/cave/cave',1,16,'ambient.cave');
export const WEATHER_SOUNDS = [...numbered('ambient.weather.rain','/audio/sounds/ambient/weather/rain',1,8,'weather'), ...numbered('ambient.weather.thunder','/audio/sounds/ambient/weather/thunder',1,3,'weather')];
export const DAMAGE_SOUNDS = ['fallbig','fallsmall','hit1','hit2','hit3'].map((name)=>sound(`damage.${name}`,`/audio/sounds/damage/${name}.ogg`,'damage'));
export const MINECART_SOUNDS = ['base','inside'].map((name)=>sound(`minecart.${name}`,`/audio/sounds/minecart/${name}.ogg`,'minecart'));

export const DIG_SOUND_MATERIALS: Readonly<Record<Exclude<DigSoundMaterial,'glass'>, readonly AudioEntry[]>> = {
  cloth: numbered('dig.cloth','/audio/sounds/dig/cloth',1,4,'dig'), grass: numbered('dig.grass','/audio/sounds/dig/grass',1,4,'dig'), gravel: numbered('dig.gravel','/audio/sounds/dig/gravel',1,4,'dig'), sand: numbered('dig.sand','/audio/sounds/dig/sand',1,4,'dig'), snow: numbered('dig.snow','/audio/sounds/dig/snow',1,4,'dig'), stone: numbered('dig.stone','/audio/sounds/dig/stone',1,4,'dig'), wood: numbered('dig.wood','/audio/sounds/dig/wood',1,4,'dig'),
};
export const STEP_SOUND_MATERIALS: Readonly<Record<StepSoundMaterial, readonly AudioEntry[]>> = {
  cloth: numbered('step.cloth','/audio/sounds/step/cloth',1,4,'step'), grass: numbered('step.grass','/audio/sounds/step/grass',1,6,'step'), gravel: numbered('step.gravel','/audio/sounds/step/gravel',1,4,'step'), ladder: numbered('step.ladder','/audio/sounds/step/ladder',1,5,'step'), sand: numbered('step.sand','/audio/sounds/step/sand',1,5,'step'), snow: numbered('step.snow','/audio/sounds/step/snow',1,4,'step'), stone: numbered('step.stone','/audio/sounds/step/stone',1,6,'step'), wood: numbered('step.wood','/audio/sounds/step/wood',1,6,'step'),
};

export const DIG_SOUNDS = Object.values(DIG_SOUND_MATERIALS).flat();
export const STEP_SOUNDS = Object.values(STEP_SOUND_MATERIALS).flat();
export const AUDIO_MANIFEST = [...MUSIC_GAME,...MUSIC_CREATIVE,...MUSIC_NETHER,...MUSIC_MENU,...FIRE_SOUNDS,...RANDOM_SOUNDS,...MOB_SOUNDS,...CAVE_SOUNDS,...WEATHER_SOUNDS,...DAMAGE_SOUNDS,...MINECART_SOUNDS,...DIG_SOUNDS,...STEP_SOUNDS] as const;

export function entriesForKeys(keys: readonly string[]): AudioEntry[] { return keys.map((key) => { const entry = AUDIO_MANIFEST.find((candidate) => candidate.key === key); if (!entry) throw new Error(`Unknown audio key ${key}`); return entry; }); }
export function manifestByKey(): Map<string, AudioEntry> { return new Map(AUDIO_MANIFEST.map((entry) => [entry.key, entry])); }
export function validateAudioManifest(): void { const keys=new Set<string>(),paths=new Set<string>(); for(const entry of AUDIO_MANIFEST){ if(keys.has(entry.key)) throw new Error(`Duplicate audio key ${entry.key}`); keys.add(entry.key); if(paths.has(entry.path)) throw new Error(`Duplicate audio path ${entry.path}`); paths.add(entry.path); if(!entry.path.endsWith('.ogg')) throw new Error(`Audio path is not .ogg: ${entry.path}`); } }
