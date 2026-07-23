import { AudioManager } from '../src/audio/AudioManager.ts';
import { toGain } from '../src/audio/AudioSettings.ts';
import { DEFAULT_GAME_SETTINGS, validateGameSettings } from '../src/settings/GameSettings.ts';
function assert(v:boolean,m:string):void{if(!v)throw new Error(m);}
const audio=new AudioManager();
audio.applySettings(validateGameSettings({audio:{master:0.5,music:0,sound:1}}));
assert(toGain(0)===0,'zero volume maps to zero gain');
assert(toGain(0.5)===0.25,'perceptual volume uses square curve');
assert(toGain(2)===1&&toGain(-1)===0,'volume gain clamps safely');
assert(audio.getManifest().length===208,'AudioManager exposes complete manifest');
const timing=audio.getMusicTiming();
assert(timing.min===600000&&timing.max===1200000,'game music silent interval is 12k-24k Beta ticks at 50ms/tick');
assert(timing.menuMin===20000&&timing.menuMax===60000,'menu music has separate shorter policy');
audio.beginWorldSession('creative');
audio.setWorldPaused(true);
audio.setWorldPaused(false);
audio.endWorldSession();
for(let i=0;i<10;i++){audio.beginWorldSession(i%2===0?'survival':'creative');audio.endWorldSession();}
audio.setMusicContext('menu');audio.setMusicContext('menu');audio.setMusicContext('survival');
assert(DEFAULT_GAME_SETTINGS.audio.master===1&&DEFAULT_GAME_SETTINGS.audio.music===1&&DEFAULT_GAME_SETTINGS.audio.sound===1,'audio settings defaults exist');
console.log('Audio lifecycle validation passed.');
