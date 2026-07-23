import type { MobSoundEvent } from '../entities/sound/MobSoundEvent';
import type { MobSoundSink } from '../entities/sound/MobSoundSink';
import type { GameSettings } from '../settings/GameSettings';
import { DEFAULT_AUDIO_SETTINGS, toGain, type AudioSettings } from './AudioSettings';
import { AUDIO_MANIFEST, DIG_SOUND_MATERIALS, STEP_SOUND_MATERIALS, manifestByKey, type AudioEntry } from './AudioManifest';
import type { DigSoundMaterial, StepSoundMaterial } from './BlockSoundMaterial';
import type { SemanticSoundEvent } from './SoundEvent';

type LoadState =
  | { readonly state: 'loading'; readonly promise: Promise<AudioBuffer> }
  | { readonly state: 'loaded'; readonly buffer: AudioBuffer }
  | { readonly state: 'failed'; readonly lastTriedMs: number; readonly error: string };

export type MusicContext = 'menu' | 'survival' | 'creative' | 'nether' | 'none';

const RETRY_AFTER_MS = 5000;
const GAME_MUSIC_MIN_SILENCE_MS = 12_000 * 50;
const GAME_MUSIC_MAX_SILENCE_MS = 24_000 * 50;
const MENU_MUSIC_MIN_SILENCE_MS = 20_000;
const MENU_MUSIC_MAX_SILENCE_MS = 60_000;

export class AudioManager implements MobSoundSink {
  private context: AudioContext | undefined;
  private masterGain: GainNode | undefined;
  private musicGain: GainNode | undefined;
  private soundGain: GainNode | undefined;
  private readonly cache = new Map<string, LoadState>();
  private readonly warnedMissing = new Set<string>();
  private readonly manifest = manifestByKey();
  private settings: AudioSettings = DEFAULT_AUDIO_SETTINGS;
  private musicContext: MusicContext = 'none';
  private musicTimer: number | undefined;
  private currentMusic: AudioBufferSourceNode | undefined;
  private lastMusicKey: string | undefined;
  private worldSession = 0;
  private worldPaused = false;
  private readonly activeLoops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode; session: number }>();

  public constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('mc-ui-click', () => void this.activate().then(() => this.play({ type: 'ui.click' })));
      document.addEventListener('visibilitychange', () => this.handleVisibility());
    }
  }

  public applySettings(settings: GameSettings): void {
    this.settings = settings.audio ?? DEFAULT_AUDIO_SETTINGS;
    this.updateGainValues();
  }

  public async activate(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (this.context === undefined) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      this.context = new Ctor();
      this.masterGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.soundGain = this.context.createGain();
      this.musicGain.connect(this.masterGain);
      this.soundGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      this.updateGainValues();
      if (this.musicContext !== 'none') this.scheduleNextMusic(0);
    }
    if (this.context.state !== 'running') await this.context.resume().catch(() => undefined);
  }

  public emit(event: MobSoundEvent): void { this.playLegacy(event); }

  public play(event: SemanticSoundEvent): void {
    if (this.worldPaused && event.type !== 'ui.click') return;
    switch (event.type) {
      case 'ui.click': this.playGlobal(this.randomKey(['random.click']), 1, 1, 'ui'); break;
      case 'block.break': this.playBlockMaterial(event.material, event.x, event.y, event.z, 1, 0.8, 'break'); break;
      case 'block.place': this.playBlockMaterial(event.material, event.x, event.y, event.z, 0.8, 0.8, 'place'); break;
      case 'step': this.playStepMaterial(event.material, event.x, event.y, event.z, event.volume ?? 0.15); break;
      case 'random.explode': this.playPositional(this.randomKey(['random.explode1','random.explode2','random.explode3']), event.x, event.y, event.z, 4, 0.7 + Math.random() * 0.2, 64); break;
      case 'random.splash': this.playPositional('random.splash', event.x, event.y, event.z, 0.7, 1 + (Math.random() - Math.random()) * 0.2, 16); break;
      case 'weather.thunder': this.playPositional(this.randomKey(['ambient.weather.thunder1','ambient.weather.thunder2','ambient.weather.thunder3']), event.x, event.y, event.z, Math.max(4, 10 - event.distance / 32), 1, 256); break;
      case 'entity.legacy': this.playLegacy({ id: event.id, kind: event.kind as MobSoundEvent['kind'], x: event.x, y: event.y, z: event.z, volume: event.volume, pitch: event.pitch, attenuationDistance: event.attenuationDistance }); break;
    }
  }

  public updateListener(x: number, y: number, z: number, yaw: number, pitch: number): void {
    const listener = this.context?.listener;
    if (listener === undefined) return;
    listener.positionX.value = x; listener.positionY.value = y; listener.positionZ.value = z;
    const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    listener.forwardX.value = fx; listener.forwardY.value = fy; listener.forwardZ.value = fz;
    listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
  }

  public beginWorldSession(context: MusicContext): void { this.worldSession++; this.stopWorldSounds(); this.setMusicContext(context); }
  public endWorldSession(): void { this.worldSession++; this.stopWorldSounds(); this.setWorldPaused(false); this.setMusicContext('menu'); }
  public setWorldPaused(paused: boolean): void { this.worldPaused = paused; for (const loop of this.activeLoops.values()) loop.gain.gain.value = paused ? 0 : 1; }

  public setMusicContext(context: MusicContext): void {
    if (this.musicContext === context) return;
    this.musicContext = context;
    this.stopCurrentMusic();
    this.scheduleNextMusic(0);
  }

  public setRain(strength: number): void {
    if (strength <= 0.01) { this.stopLoop('weather.rain'); return; }
    this.startLoop('weather.rain', this.randomKey(['ambient.weather.rain1','ambient.weather.rain2','ambient.weather.rain3','ambient.weather.rain4','ambient.weather.rain5','ambient.weather.rain6','ambient.weather.rain7','ambient.weather.rain8']), Math.min(1, strength * 0.6));
  }

  public setMinecartLoop(id: string, inside: boolean, speed: number): void {
    const key = `minecart.${id}.${inside ? 'inside' : 'base'}`;
    const soundKey = inside ? 'minecart.inside' : 'minecart.base';
    if (speed < 0.01) { this.stopLoop(key); return; }
    this.startLoop(key, soundKey, Math.min(1, speed * 2));
  }

  public stopMinecartLoops(id: string): void { this.stopLoop(`minecart.${id}.inside`); this.stopLoop(`minecart.${id}.base`); }
  public stopWorldSounds(): void { for (const key of [...this.activeLoops.keys()]) this.stopLoop(key); }
  public getManifest(): readonly AudioEntry[] { return AUDIO_MANIFEST; }
  public getMusicTiming(): { min: number; max: number; menuMin: number; menuMax: number } { return { min: GAME_MUSIC_MIN_SILENCE_MS, max: GAME_MUSIC_MAX_SILENCE_MS, menuMin: MENU_MUSIC_MIN_SILENCE_MS, menuMax: MENU_MUSIC_MAX_SILENCE_MS }; }

  private playLegacy(event: MobSoundEvent): void {
    const keys = this.mapLegacy(event.id, event.kind);
    if (keys.length === 0) return;
    this.playPositional(this.randomKey(keys), event.x, event.y, event.z, event.volume, event.pitch, event.attenuationDistance);
  }

  private mapLegacy(id: string, kind: string): string[] {
    if (id === 'random.pop') return ['random.pop'];
    if (id === 'random.eat') return ['random.eat1','random.eat2','random.eat3'];
    if (id === 'random.hurt') return ['damage.hit1','damage.hit2','damage.hit3'];
    if (id === 'mob.zombie') return kind === 'death' ? ['mob.zombie.death'] : kind === 'hurt' ? ['mob.zombie.hurt1','mob.zombie.hurt2'] : ['mob.zombie.say1','mob.zombie.say2','mob.zombie.say3'];
    if (id === 'mob.zombiedeath') return ['mob.zombie.death'];
    if (id === 'mob.zombiehurt') return ['mob.zombie.hurt1','mob.zombie.hurt2'];
    if (id === 'mob.spider') return ['mob.spider.say1','mob.spider.say2','mob.spider.say3','mob.spider.say4'];
    if (id === 'mob.spiderdeath') return ['mob.spider.death'];
    if (id === 'mob.chicken') return ['mob.chicken.say1','mob.chicken.say2','mob.chicken.say3'];
    if (id === 'mob.chickenhurt') return ['mob.chicken.hurt1','mob.chicken.hurt2'];
    if (id === 'mob.chickenplop') return ['mob.chicken.plop'];
    if (id === 'mob.cow') return ['mob.cow.say1','mob.cow.say2','mob.cow.say3','mob.cow.say4'];
    if (id === 'mob.cowhurt') return ['mob.cow.hurt1','mob.cow.hurt2','mob.cow.hurt3'];
    if (id === 'mob.creeper') return ['mob.creeper.say1','mob.creeper.say2','mob.creeper.say3','mob.creeper.say4'];
    if (id === 'mob.creeperdeath') return ['mob.creeper.death'];
    if (id === 'mob.pig') return kind === 'death' ? ['mob.pig.death'] : ['mob.pig.say1','mob.pig.say2','mob.pig.say3'];
    if (id === 'mob.pigdeath') return ['mob.pig.death'];
    if (id === 'mob.sheep') return ['mob.sheep.say1','mob.sheep.say2','mob.sheep.say3'];
    if (id === 'step.mob') return ['step.grass1','step.grass2','step.grass3','step.grass4','step.grass5','step.grass6'];
    return [];
  }

  private playBlockMaterial(material: DigSoundMaterial, x: number, y: number, z: number, volume: number, pitch: number, _reason: 'break' | 'place'): void {
    if (material === 'glass') this.playPositional(this.randomKey(['random.glass1','random.glass2','random.glass3']), x, y, z, volume, pitch, 16);
    else this.playPositional(this.randomKey(DIG_SOUND_MATERIALS[material].map((entry) => entry.key)), x, y, z, volume, pitch, 16);
  }

  private playStepMaterial(material: StepSoundMaterial, x: number, y: number, z: number, volume: number): void {
    this.playPositional(this.randomKey(STEP_SOUND_MATERIALS[material].map((entry) => entry.key)), x, y, z, volume, 0.9 + Math.random() * 0.2, 16);
  }

  private playGlobal(key: string, volume: number, pitch: number, category: 'music' | 'ui' | 'sound'): void { void this.playBuffer(key, undefined, undefined, undefined, volume, pitch, category); }
  private playPositional(key: string, x: number, y: number, z: number, volume: number, pitch: number, distance: number): void { void this.playBuffer(key, x, y, z, volume, pitch, 'sound', distance); }

  private async playBuffer(key: string, x: number | undefined, y: number | undefined, z: number | undefined, volume: number, pitch: number, category: 'music' | 'ui' | 'sound', distance = 16): Promise<void> {
    await this.activate();
    const ctx = this.context; const dest = category === 'music' ? this.musicGain : this.soundGain;
    if (!ctx || !dest) return;
    const buffer = await this.loadBuffer(key); if (!buffer) return;
    const source = ctx.createBufferSource(); source.buffer = buffer; source.playbackRate.value = Math.max(0.25, Math.min(4, pitch));
    const gain = ctx.createGain(); gain.gain.value = Math.max(0, volume);
    source.connect(gain);
    if (x !== undefined && y !== undefined && z !== undefined) { const panner = ctx.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'linear'; panner.maxDistance = distance; panner.refDistance = 1; panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; gain.connect(panner); panner.connect(dest); }
    else gain.connect(dest);
    source.start(); source.onended = () => { source.disconnect(); gain.disconnect(); };
  }

  private async loadBuffer(key: string): Promise<AudioBuffer | undefined> {
    const entry = this.manifest.get(key); if (!entry) { console.warn(`[Audio] Unknown sound key: ${key}`); return undefined; }
    const existing = this.cache.get(key);
    if (existing?.state === 'loaded') return existing.buffer;
    if (existing?.state === 'loading') return existing.promise.catch(() => undefined);
    if (existing?.state === 'failed' && Date.now() - existing.lastTriedMs < RETRY_AFTER_MS) return undefined;
    const promise = this.fetchDecode(entry);
    this.cache.set(key, { state: 'loading', promise });
    try { const buffer = await promise; this.cache.set(key, { state: 'loaded', buffer }); return buffer; }
    catch (error) { const message = error instanceof Error ? error.message : String(error); this.cache.set(key, { state: 'failed', lastTriedMs: Date.now(), error: message }); if (!this.warnedMissing.has(entry.path)) { this.warnedMissing.add(entry.path); console.warn(`[Audio] Failed to load ${entry.path}: ${message}`); } return undefined; }
  }

  private async fetchDecode(entry: AudioEntry): Promise<AudioBuffer> {
    const ctx = this.context; if (!ctx) throw new Error('AudioContext is not active');
    const response = await fetch(entry.path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    if (data.byteLength === 0) throw new Error('empty response');
    try { return await ctx.decodeAudioData(data.slice(0)); }
    catch (error) { throw new Error(`decode failed: ${error instanceof Error ? error.message : String(error)}`); }
  }

  private startLoop(ownerKey: string, soundKey: string, volume: number): void {
    if (this.activeLoops.has(ownerKey)) { this.activeLoops.get(ownerKey)!.gain.gain.value = this.worldPaused ? 0 : volume; return; }
    void this.activate().then(async () => { const ctx=this.context,dest=this.soundGain;if(!ctx||!dest)return; const session=this.worldSession; const buffer=await this.loadBuffer(soundKey); if(!buffer||session!==this.worldSession)return; const source=ctx.createBufferSource(); source.buffer=buffer; source.loop=true; const gain=ctx.createGain(); gain.gain.value=this.worldPaused?0:volume; source.connect(gain); gain.connect(dest); source.start(); this.activeLoops.set(ownerKey,{source,gain,session}); });
  }
  private stopLoop(ownerKey: string): void { const loop=this.activeLoops.get(ownerKey); if(!loop)return; loop.source.stop(); loop.source.disconnect(); loop.gain.disconnect(); this.activeLoops.delete(ownerKey); }
  private stopCurrentMusic(): void { if (this.musicTimer !== undefined) window.clearTimeout(this.musicTimer); this.musicTimer = undefined; this.currentMusic?.stop(); this.currentMusic = undefined; }
  private scheduleNextMusic(delay: number): void { if (this.musicContext === 'none' || typeof window === 'undefined') return; if (this.musicTimer !== undefined) window.clearTimeout(this.musicTimer); this.musicTimer = window.setTimeout(() => void this.startMusic(), delay); }
  private async startMusic(): Promise<void> { if (this.context === undefined) return; const keys=this.musicKeys(); if(keys.length===0)return; let key=this.randomKey(keys); if(keys.length>1 && key===this.lastMusicKey) key=this.randomKey(keys.filter(k=>k!==this.lastMusicKey)); this.lastMusicKey=key; await this.activate(); const ctx=this.context,dest=this.musicGain;if(!ctx||!dest)return; const buffer=await this.loadBuffer(key); if(!buffer){this.scheduleNextMusic(10_000);return;} const source=ctx.createBufferSource(); source.buffer=buffer; source.connect(dest); source.onended=()=>{if(this.currentMusic===source){this.currentMusic=undefined; const min=this.musicContext==='menu'?MENU_MUSIC_MIN_SILENCE_MS:GAME_MUSIC_MIN_SILENCE_MS; const max=this.musicContext==='menu'?MENU_MUSIC_MAX_SILENCE_MS:GAME_MUSIC_MAX_SILENCE_MS; this.scheduleNextMusic(min+Math.random()*(max-min));}}; this.currentMusic=source; source.start(); }
  private musicKeys(): string[] { if(this.musicContext==='menu')return ['music.menu.menu1','music.menu.menu2','music.menu.menu3','music.menu.menu4']; if(this.musicContext==='creative')return ['music.game.creative.creative1','music.game.creative.creative2','music.game.creative.creative3','music.game.creative.creative4','music.game.creative.creative5','music.game.creative.creative6']; if(this.musicContext==='nether')return ['music.game.nether.nether1','music.game.nether.nether2','music.game.nether.nether3','music.game.nether.nether4']; if(this.musicContext==='survival')return ['music.game.calm1','music.game.calm2','music.game.calm3','music.game.hal1','music.game.hal2','music.game.hal3','music.game.hal4','music.game.nuance1','music.game.nuance2','music.game.piano1','music.game.piano2','music.game.piano3']; return []; }
  private randomKey(keys: readonly string[]): string { return keys[Math.floor(Math.random()*keys.length)]!; }
  private updateGainValues(): void { if(!this.masterGain||!this.musicGain||!this.soundGain)return; this.masterGain.gain.value=toGain(this.settings.master); this.musicGain.gain.value=toGain(this.settings.music); this.soundGain.gain.value=toGain(this.settings.sound); }
  private handleVisibility(): void { if (typeof document !== 'undefined' && document.hidden) { for (const loop of this.activeLoops.values()) loop.gain.gain.value = 0; } else this.setWorldPaused(this.worldPaused); }
}
