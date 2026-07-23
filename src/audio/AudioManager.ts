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

type SpatialAudioNodeCompat = {
  readonly positionX?: AudioParam;
  readonly positionY?: AudioParam;
  readonly positionZ?: AudioParam;
  setPosition?: (x: number, y: number, z: number) => void;
};

type AudioListenerCompat = AudioListener & SpatialAudioNodeCompat & {
  readonly forwardX?: AudioParam;
  readonly forwardY?: AudioParam;
  readonly forwardZ?: AudioParam;
  readonly upX?: AudioParam;
  readonly upY?: AudioParam;
  readonly upZ?: AudioParam;
  setPosition?: (x: number, y: number, z: number) => void;
  setOrientation?: (forwardX: number, forwardY: number, forwardZ: number, upX: number, upY: number, upZ: number) => void;
};

export type MusicContext = 'menu' | 'survival' | 'creative' | 'nether' | 'none';

const RETRY_AFTER_MS = 5000;
const GAME_MUSIC_MIN_SILENCE_MS = 12_000 * 50;
const GAME_MUSIC_MAX_SILENCE_MS = 24_000 * 50;
const MENU_MUSIC_MIN_SILENCE_MS = 20_000;
const MENU_MUSIC_MAX_SILENCE_MS = 60_000;

/** Browser-safe equivalent of Beta's bounded rotating source namespace. */
export const WORLD_AUDIO_LIMITS = {
  maxActiveSources: 48,
  maxPendingStarts: 16,
  defaultDistance: 16,
  nearbyDistance: 1.5,
  shortDedupeMs: 35,
  ambientDedupeMs: 90,
  splashDedupeMs: 120,
} as const;

type PlaybackPriority = 'critical' | 'important' | 'player' | 'normal' | 'ambient';
const PRIORITY_RANK: Readonly<Record<PlaybackPriority, number>> = { critical: 4, important: 3, player: 2, normal: 1, ambient: 0 };
type WorldSource = { readonly source: AudioBufferSourceNode; readonly gain: GainNode; readonly panner?: PannerNode; readonly key: string; readonly priority: PlaybackPriority; readonly x?: number; readonly y?: number; readonly z?: number; readonly startedAt: number; };
type RainLayer = { readonly source: AudioBufferSourceNode; readonly gain: GainNode; readonly filter: BiquadFilterNode; };
type AudioTelemetry = { started: number; ended: number; rejectedDistance: number; rejectedDeduplication: number; rejectedSaturation: number; evicted: number; pending: number; };
const AUDIO_TELEMETRY_ENABLED = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

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
  private musicGeneration = 0;
  private lastMusicKey: string | undefined;
  private worldSession = 0;
  private worldPaused = false;
  private listenerPosition: { x: number; y: number; z: number } | undefined;
  private readonly activeWorldSources = new Set<WorldSource>();
  private pendingWorldStarts = 0;
  private readonly recentWorldEvents = new Map<string, number>();
  private readonly telemetry: AudioTelemetry = { started: 0, ended: 0, rejectedDistance: 0, rejectedDeduplication: 0, rejectedSaturation: 0, evicted: 0, pending: 0 };
  private readonly lastVariantByFamily = new Map<string, string>();
  private rainStrength = 0;
  private rainCover = 0;
  private rainPrimary: RainLayer | undefined;
  private rainFading: RainLayer | undefined;
  private rainTimer: number | undefined;
  private rainFadeTimer: number | undefined;
  private rainGeneration = 0;
  private rainStartPending = false;
  private readonly pendingLoopStarts = new Map<string, number>();
  private nextLoopStartToken = 0;
  private readonly activeLoops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode; session: number; volume: number }>();

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
      case 'block.mine': this.playBlockMaterial(event.material, event.x, event.y, event.z, 0.25, 0.5, 'mine'); break;
      case 'step': this.playStepMaterial(event.material, event.x, event.y, event.z, event.volume ?? 0.15, event.pitch ?? 1); break;
      case 'random.explode': this.playPositional(this.randomKey(['random.explode1','random.explode2','random.explode3']), event.x, event.y, event.z, 4, 0.7 + Math.random() * 0.2, 64, 'critical', 'random.explode'); break;
      case 'random.splash': this.playPositional('random.splash', event.x, event.y, event.z, event.volume ?? 0.7, 1 + (Math.random() - Math.random()) * 0.2, 16, 'ambient', 'random.splash', WORLD_AUDIO_LIMITS.splashDedupeMs); break;
      case 'weather.thunder': this.playPositional(this.randomKey(['ambient.weather.thunder1','ambient.weather.thunder2','ambient.weather.thunder3']), event.x, event.y, event.z, Math.max(4, 10 - event.distance / 32), 1, 256, 'important', 'weather.thunder'); break;
      case 'entity.legacy': this.playLegacy({ id: event.id, kind: event.kind as MobSoundEvent['kind'], x: event.x, y: event.y, z: event.z, volume: event.volume, pitch: event.pitch, attenuationDistance: event.attenuationDistance }); break;
    }
  }

  public updateListener(x: number, y: number, z: number, yaw: number, pitch: number): void {
    const listener = this.context?.listener as AudioListenerCompat | undefined;
    if (listener === undefined) return;

    const cosPitch = Math.cos(pitch);
    const forwardX = -Math.sin(yaw) * cosPitch;
    const forwardY = Math.sin(pitch);
    const forwardZ = -Math.cos(yaw) * cosPitch;
    const upX = 0;
    const upY = 1;
    const upZ = 0;

    this.listenerPosition = { x, y, z };
    this.setSpatialPosition(listener, x, y, z);
    const hasOrientationParams = this.setAudioParam(listener.forwardX, forwardX)
      && this.setAudioParam(listener.forwardY, forwardY)
      && this.setAudioParam(listener.forwardZ, forwardZ)
      && this.setAudioParam(listener.upX, upX)
      && this.setAudioParam(listener.upY, upY)
      && this.setAudioParam(listener.upZ, upZ);
    if (!hasOrientationParams && typeof listener.setOrientation === 'function') listener.setOrientation(forwardX, forwardY, forwardZ, upX, upY, upZ);
  }

  public beginWorldSession(context: MusicContext): void { this.worldSession++; this.stopWorldSounds(); this.setMusicContext(context); }
  public endWorldSession(): void { this.worldSession++; this.stopWorldSounds(); this.setWorldPaused(false); this.setMusicContext('menu'); }
  public setWorldPaused(paused: boolean): void { this.worldPaused = paused; for (const loop of this.activeLoops.values()) loop.gain.gain.value = paused ? 0 : loop.volume; this.applyRainMix(); }

  public setMusicContext(context: MusicContext): void {
    if (this.musicContext === context) return;
    this.musicContext = context;
    this.stopCurrentMusic();
    this.scheduleNextMusic(0);
  }

  /** Updates rain intensity without recreating active ambience layers. */
  public setRain(strength: number): void {
    this.rainStrength = Math.max(0, Math.min(1, strength));
    if (this.rainStrength <= 0.01) { this.stopRain(); return; }
    this.applyRainMix();
    if (this.rainPrimary === undefined && this.rainTimer === undefined && !this.rainStartPending) this.startRainSegment();
  }

  /** Cover is sampled by the engine at a low rate: 0=open sky, 1=deep cover. */
  public setRainCover(cover: number): void { this.rainCover = Math.max(0, Math.min(1, cover)); this.applyRainMix(); }

  public setMinecartLoop(id: string, inside: boolean, speed: number): void {
    const key = `minecart.${id}.${inside ? 'inside' : 'base'}`;
    const soundKey = inside ? 'minecart.inside' : 'minecart.base';
    if (speed < 0.01) { this.stopLoop(key); return; }
    this.startLoop(key, soundKey, Math.min(1, speed * 2));
  }

  public stopMinecartLoops(id: string): void { this.stopLoop(`minecart.${id}.inside`); this.stopLoop(`minecart.${id}.base`); }
  public stopWorldSounds(): void {
    for (const source of [...this.activeWorldSources]) this.stopWorldSource(source);
    this.rainStrength = 0;
    this.stopRain();
    for (const key of [...this.activeLoops.keys()]) this.stopLoop(key);
    this.recentWorldEvents.clear();
  }
  public getDebugInfo(): Readonly<AudioTelemetry & { activeWorldSources: number; activeLoops: number }> { return { ...this.telemetry, pending: this.pendingWorldStarts, activeWorldSources: this.activeWorldSources.size, activeLoops: this.activeLoops.size + (this.rainPrimary === undefined ? 0 : 1) + (this.rainFading === undefined ? 0 : 1) }; }
  public getManifest(): readonly AudioEntry[] { return AUDIO_MANIFEST; }
  public getMusicTiming(): { min: number; max: number; menuMin: number; menuMax: number } { return { min: GAME_MUSIC_MIN_SILENCE_MS, max: GAME_MUSIC_MAX_SILENCE_MS, menuMin: MENU_MUSIC_MIN_SILENCE_MS, menuMax: MENU_MUSIC_MAX_SILENCE_MS }; }

  private playLegacy(event: MobSoundEvent): void {
    const keys = this.mapLegacy(event.id, event.kind);
    if (keys.length === 0) return;
    const priority: PlaybackPriority = event.kind === 'death' || event.kind === 'hurt' || event.kind === 'attack' ? 'important' : event.kind === 'pickup' || event.kind === 'eat' ? 'player' : event.kind === 'ambient' || event.kind === 'step' ? 'ambient' : 'normal';
    this.playPositional(this.randomKey(keys), event.x, event.y, event.z, event.volume, event.pitch, event.attenuationDistance, priority, event.id, priority === 'ambient' ? WORLD_AUDIO_LIMITS.ambientDedupeMs : WORLD_AUDIO_LIMITS.shortDedupeMs);
  }

  private mapLegacy(id: string, kind: string): string[] {
    if (id === 'random.pop') return ['random.pop'];
    if (id === 'random.eat') return ['random.eat1','random.eat2','random.eat3'];
    if (id === 'random.hurt') return ['damage.hit1','damage.hit2','damage.hit3'];
    if (id === 'fire.fire') return ['fire.fire'];
    if (id === 'fire.ignite') return ['fire.ignite'];
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

  private playBlockMaterial(material: DigSoundMaterial, x: number, y: number, z: number, volume: number, pitch: number, reason: 'break' | 'place' | 'mine'): void {
    const key = material === 'glass' ? this.randomVariant(`dig.${reason}.glass`, ['random.glass1','random.glass2','random.glass3']) : this.randomVariant(`dig.${reason}.${material}`, DIG_SOUND_MATERIALS[material].map((entry) => entry.key));
    this.playPositional(key, x, y, z, volume, pitch, WORLD_AUDIO_LIMITS.defaultDistance, 'player', `block.${reason}.${material}`, WORLD_AUDIO_LIMITS.shortDedupeMs);
  }

  private setAudioParam(param: AudioParam | undefined, value: number): boolean {
    if (param === undefined) return false;
    const ctx = this.context;
    if (ctx !== undefined && typeof param.setValueAtTime === 'function') param.setValueAtTime(value, ctx.currentTime);
    else param.value = value;
    return true;
  }

  private setSpatialPosition(node: SpatialAudioNodeCompat, x: number, y: number, z: number): void {
    const modern = this.setAudioParam(node.positionX, x) && this.setAudioParam(node.positionY, y) && this.setAudioParam(node.positionZ, z);
    if (!modern && typeof node.setPosition === 'function') node.setPosition(x, y, z);
  }

  private playStepMaterial(material: StepSoundMaterial, x: number, y: number, z: number, volume: number, pitch: number): void {
    this.playPositional(this.randomVariant(`step.${material}`, STEP_SOUND_MATERIALS[material].map((entry) => entry.key)), x, y, z, volume, pitch, WORLD_AUDIO_LIMITS.defaultDistance, 'ambient', `step.${material}`, WORLD_AUDIO_LIMITS.ambientDedupeMs);
  }

  private playGlobal(key: string, volume: number, pitch: number, category: 'music' | 'ui' | 'sound'): void { void this.playBuffer(key, undefined, undefined, undefined, volume, pitch, category); }
  private playPositional(key: string, x: number, y: number, z: number, volume: number, pitch: number, distance: number, priority: PlaybackPriority, dedupeKey: string, dedupeMs: number = WORLD_AUDIO_LIMITS.shortDedupeMs): void {
    if (!this.isAudible(x, y, z, distance, volume)) { this.count('rejectedDistance'); return; }
    const now = performance.now();
    const nearbyKey = `${this.worldSession}:${dedupeKey}:${Math.round(x / WORLD_AUDIO_LIMITS.nearbyDistance)}:${Math.round(y / WORLD_AUDIO_LIMITS.nearbyDistance)}:${Math.round(z / WORLD_AUDIO_LIMITS.nearbyDistance)}`;
    const previous = this.recentWorldEvents.get(nearbyKey);
    if (previous !== undefined && now - previous < dedupeMs) { this.count('rejectedDeduplication'); return; }
    this.recentWorldEvents.set(nearbyKey, now);
    if (this.recentWorldEvents.size > 256) for (const [entryKey, at] of this.recentWorldEvents) if (now - at > WORLD_AUDIO_LIMITS.splashDedupeMs) this.recentWorldEvents.delete(entryKey);
    void this.playBuffer(key, x, y, z, Math.min(1, Math.max(0, volume)), pitch, 'sound', distance, priority);
  }

  private isAudible(x: number, y: number, z: number, distance: number, volume: number): boolean {
    const listener = this.listenerPosition;
    if (listener === undefined) return true;
    const range = distance * Math.max(1, volume);
    const dx = listener.x - x; const dy = listener.y - y; const dz = listener.z - z;
    return dx * dx + dy * dy + dz * dz < range * range;
  }

  private async playBuffer(key: string, x: number | undefined, y: number | undefined, z: number | undefined, volume: number, pitch: number, category: 'music' | 'ui' | 'sound', distance: number = WORLD_AUDIO_LIMITS.defaultDistance, priority: PlaybackPriority = 'normal'): Promise<void> {
    const isWorld = category === 'sound' && x !== undefined && y !== undefined && z !== undefined;
    const session = this.worldSession;
    if (isWorld) {
      if (this.pendingWorldStarts >= WORLD_AUDIO_LIMITS.maxPendingStarts || !this.makeWorldSourceRoom(priority)) { this.count('rejectedSaturation'); return; }
      this.pendingWorldStarts++; this.telemetry.pending = this.pendingWorldStarts;
    }
    try {
      await this.activate();
      const ctx = this.context; const dest = category === 'music' ? this.musicGain : this.soundGain;
      if (!ctx || !dest || (isWorld && session !== this.worldSession)) return;
      const buffer = await this.loadBuffer(key);
      if (!buffer || (isWorld && session !== this.worldSession)) return;
      if (isWorld && !this.makeWorldSourceRoom(priority)) { this.count('rejectedSaturation'); return; }
      const source = ctx.createBufferSource(); source.buffer = buffer; source.playbackRate.value = Math.max(0.25, Math.min(4, pitch));
      const gain = ctx.createGain(); gain.gain.value = volume; source.connect(gain);
      let panner: PannerNode | undefined;
      if (x !== undefined && y !== undefined && z !== undefined) { panner = ctx.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'linear'; panner.maxDistance = distance; panner.refDistance = 1; this.setSpatialPosition(panner as PannerNode & SpatialAudioNodeCompat, x, y, z); gain.connect(panner); panner.connect(dest); }
      else gain.connect(dest);
      if (isWorld) { const tracked: WorldSource = panner === undefined ? { source, gain, key, priority, x, y, z, startedAt: performance.now() } : { source, gain, panner, key, priority, x, y, z, startedAt: performance.now() }; this.activeWorldSources.add(tracked); source.onended = () => this.finishWorldSource(tracked); this.count('started'); }
      else source.onended = () => { source.disconnect(); gain.disconnect(); panner?.disconnect(); };
      source.start();
    } finally {
      if (isWorld) { this.pendingWorldStarts--; this.telemetry.pending = this.pendingWorldStarts; }
    }
  }

  private makeWorldSourceRoom(priority: PlaybackPriority): boolean {
    if (this.activeWorldSources.size < WORLD_AUDIO_LIMITS.maxActiveSources) return true;
    let candidate: WorldSource | undefined;
    for (const source of this.activeWorldSources) if ((candidate === undefined || PRIORITY_RANK[source.priority] < PRIORITY_RANK[candidate.priority] || (source.priority === candidate.priority && source.startedAt < candidate.startedAt)) && PRIORITY_RANK[source.priority] < PRIORITY_RANK[priority]) candidate = source;
    if (candidate === undefined) return false;
    this.stopWorldSource(candidate); this.count('evicted'); return true;
  }

  private finishWorldSource(tracked: WorldSource): void { if (!this.activeWorldSources.delete(tracked)) return; tracked.source.disconnect(); tracked.gain.disconnect(); tracked.panner?.disconnect(); this.count('ended'); }
  private stopWorldSource(tracked: WorldSource): void { this.activeWorldSources.delete(tracked); tracked.source.onended = null; tracked.source.stop(); tracked.source.disconnect(); tracked.gain.disconnect(); tracked.panner?.disconnect(); }
  private count(field: Exclude<keyof AudioTelemetry, 'pending'>): void { if (AUDIO_TELEMETRY_ENABLED) this.telemetry[field]++; }

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

  private rainGain(): number { return this.worldPaused ? 0 : this.rainStrength * 0.6 * (1 - this.rainCover * 0.92); }
  private applyRainMix(): void {
    const ctx=this.context; if(!ctx)return; const gain=this.rainGain(), cutoff=20_000-(19_100*this.rainCover);
    for(const layer of [this.rainPrimary,this.rainFading]) if(layer!==undefined) { layer.gain.gain.cancelScheduledValues(ctx.currentTime); layer.gain.gain.linearRampToValueAtTime(gain,ctx.currentTime+.2); layer.filter.frequency.cancelScheduledValues(ctx.currentTime); layer.filter.frequency.linearRampToValueAtTime(cutoff,ctx.currentTime+.2); }
  }
  private startRainSegment(): void {
    if(this.rainStrength<=.01||this.rainTimer!==undefined||this.rainStartPending)return;
    this.rainStartPending=true;
    const generation=this.rainGeneration, key=this.randomVariant('weather.rain',['ambient.weather.rain1','ambient.weather.rain2','ambient.weather.rain3','ambient.weather.rain4','ambient.weather.rain5','ambient.weather.rain6','ambient.weather.rain7','ambient.weather.rain8']);
    void this.activate().then(async()=>{const ctx=this.context,dest=this.soundGain;if(!ctx||!dest||generation!==this.rainGeneration)return;const buffer=await this.loadBuffer(key);if(!buffer||generation!==this.rainGeneration||this.rainStrength<=.01)return;const source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(); source.buffer=buffer; filter.type='lowpass'; filter.frequency.value=20_000; gain.gain.value=0; source.connect(filter);filter.connect(gain);gain.connect(dest);const layer={source,gain,filter};const previous=this.rainPrimary;this.rainPrimary=layer;source.start();const target=this.rainGain();gain.gain.linearRampToValueAtTime(target,ctx.currentTime+.25);if(previous!==undefined){this.rainFading=previous;previous.gain.gain.cancelScheduledValues(ctx.currentTime);previous.gain.gain.linearRampToValueAtTime(0,ctx.currentTime+.25);if(this.rainFadeTimer!==undefined)window.clearTimeout(this.rainFadeTimer);this.rainFadeTimer=window.setTimeout(()=>{this.rainFadeTimer=undefined;this.disposeRainLayer(previous);},250);}const delay=Math.max(100,Math.floor((buffer.duration-.25)*1000));this.rainTimer=window.setTimeout(()=>{this.rainTimer=undefined;this.startRainSegment();},delay);}).catch((error)=>console.warn('[Audio] Rain ambience start failed.',error)).finally(()=>{this.rainStartPending=false;});
  }
  private disposeRainLayer(layer: RainLayer): void { if(this.rainPrimary===layer)this.rainPrimary=undefined;if(this.rainFading===layer)this.rainFading=undefined;layer.source.onended=null;layer.source.stop();layer.source.disconnect();layer.filter.disconnect();layer.gain.disconnect();if(this.rainStrength>.01&&this.rainPrimary===undefined&&this.rainTimer===undefined&&!this.rainStartPending)this.startRainSegment(); }
  private stopRain(): void { this.rainGeneration++;if(this.rainTimer!==undefined)window.clearTimeout(this.rainTimer);if(this.rainFadeTimer!==undefined)window.clearTimeout(this.rainFadeTimer);this.rainTimer=undefined;this.rainFadeTimer=undefined;const ctx=this.context;for(const layer of [this.rainPrimary,this.rainFading])if(layer!==undefined){if(ctx!==undefined){layer.gain.gain.cancelScheduledValues(ctx.currentTime);layer.gain.gain.linearRampToValueAtTime(0,ctx.currentTime+.15);window.setTimeout(()=>this.disposeRainLayer(layer),150);}else this.disposeRainLayer(layer);} }

  private startLoop(ownerKey: string, soundKey: string, volume: number): void {
    const existing = this.activeLoops.get(ownerKey);
    if (existing !== undefined) { existing.volume = volume; existing.gain.gain.value = this.worldPaused ? 0 : volume; return; }
    if (this.pendingLoopStarts.has(ownerKey)) return;
    const token = ++this.nextLoopStartToken;
    this.pendingLoopStarts.set(ownerKey, token);
    const session = this.worldSession;
    void this.activate().then(async () => { const ctx=this.context,dest=this.soundGain;if(!ctx||!dest)return; const buffer=await this.loadBuffer(soundKey); if(!buffer||session!==this.worldSession||this.pendingLoopStarts.get(ownerKey)!==token)return; const source=ctx.createBufferSource(); source.buffer=buffer; source.loop=true; const gain=ctx.createGain(); gain.gain.value=this.worldPaused?0:volume; source.connect(gain); gain.connect(dest); source.start(); this.activeLoops.set(ownerKey,{source,gain,session,volume}); }).finally(() => { if (this.pendingLoopStarts.get(ownerKey) === token) this.pendingLoopStarts.delete(ownerKey); });
  }
  private stopLoop(ownerKey: string): void { this.pendingLoopStarts.delete(ownerKey); const loop=this.activeLoops.get(ownerKey); if(!loop)return; loop.source.stop(); loop.source.disconnect(); loop.gain.disconnect(); this.activeLoops.delete(ownerKey); }
  private stopCurrentMusic(): void { if (this.musicTimer !== undefined) window.clearTimeout(this.musicTimer); this.musicTimer = undefined; this.musicGeneration++; const source = this.currentMusic; this.currentMusic = undefined; if (source !== undefined) { source.onended = null; source.stop(); source.disconnect(); } }
  private scheduleNextMusic(delay: number): void { if (this.musicContext === 'none' || typeof window === 'undefined') return; if (this.musicTimer !== undefined) window.clearTimeout(this.musicTimer); this.musicTimer = window.setTimeout(() => void this.startMusic(), delay); }
  private async startMusic(): Promise<void> { if (this.context === undefined) return; const generation=this.musicGeneration; const keys=this.musicKeys(); if(keys.length===0)return; let key=this.randomKey(keys); if(keys.length>1 && key===this.lastMusicKey) key=this.randomKey(keys.filter(k=>k!==this.lastMusicKey)); this.lastMusicKey=key; await this.activate(); const ctx=this.context,dest=this.musicGain;if(!ctx||!dest||generation!==this.musicGeneration)return; const buffer=await this.loadBuffer(key); if(generation!==this.musicGeneration)return; if(!buffer){this.scheduleNextMusic(10_000);return;} const source=ctx.createBufferSource(); source.buffer=buffer; source.connect(dest); source.onended=()=>{source.disconnect(); if(this.currentMusic===source){this.currentMusic=undefined; const min=this.musicContext==='menu'?MENU_MUSIC_MIN_SILENCE_MS:GAME_MUSIC_MIN_SILENCE_MS; const max=this.musicContext==='menu'?MENU_MUSIC_MAX_SILENCE_MS:GAME_MUSIC_MAX_SILENCE_MS; this.scheduleNextMusic(min+Math.random()*(max-min));}}; this.currentMusic=source; source.start(); }
  private musicKeys(): string[] { if(this.musicContext==='menu')return ['music.menu.menu1','music.menu.menu2','music.menu.menu3','music.menu.menu4']; if(this.musicContext==='creative')return ['music.game.creative.creative1','music.game.creative.creative2','music.game.creative.creative3','music.game.creative.creative4','music.game.creative.creative5','music.game.creative.creative6']; if(this.musicContext==='nether')return ['music.game.nether.nether1','music.game.nether.nether2','music.game.nether.nether3','music.game.nether.nether4']; if(this.musicContext==='survival')return ['music.game.calm1','music.game.calm2','music.game.calm3','music.game.hal1','music.game.hal2','music.game.hal3','music.game.hal4','music.game.nuance1','music.game.nuance2','music.game.piano1','music.game.piano2','music.game.piano3']; return []; }
  private randomKey(keys: readonly string[]): string { return keys[Math.floor(Math.random()*keys.length)]!; }
  private randomVariant(family: string, keys: readonly string[]): string { const previous=this.lastVariantByFamily.get(family); const choices=keys.length>1&&previous!==undefined?keys.filter((key)=>key!==previous):keys; const key=this.randomKey(choices); this.lastVariantByFamily.set(family,key); return key; }
  private updateGainValues(): void { if(!this.masterGain||!this.musicGain||!this.soundGain)return; this.masterGain.gain.value=toGain(this.settings.master); this.musicGain.gain.value=toGain(this.settings.music); this.soundGain.gain.value=toGain(this.settings.sound); }
  private handleVisibility(): void { if (typeof document !== 'undefined' && document.hidden) { for (const loop of this.activeLoops.values()) loop.gain.gain.value = 0; } else { for (const loop of this.activeLoops.values()) loop.gain.gain.value = this.worldPaused ? 0 : loop.volume; } }
}
