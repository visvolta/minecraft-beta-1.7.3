import type { SerializedFurnace } from '../../furnace/FurnaceManager';
import type { SerializedChest } from '../../chest/ChestContainer';
import { Difficulty, isDifficulty } from '../../world/Difficulty';

export const WORLD_METADATA_VERSION = 1;

export interface SerializedItemStack {
  readonly id: number | string;
  readonly count: number;
  readonly metadata:number;
  readonly damage?:number;
  readonly type: 'block' | 'item';
}

export interface WorldMetadata {
  readonly formatVersion: number;
  readonly worldId: string;
  readonly name: string;
  readonly seed: string;
  readonly spawn: { readonly x: number; readonly y: number; readonly z: number };
  /** Current player transform; distinct from configured world spawn. */
  readonly player: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly pitch: number };
  readonly playerHealth?: {readonly health:number;readonly maxHealth:number};
  readonly playerFood?: {readonly hunger:number;readonly saturation:number;readonly exhaustion:number};
  readonly timeTicks: number;
  readonly difficulty: Difficulty;
  readonly weather: { readonly raining: boolean; readonly thundering: boolean; readonly rainTime: number; readonly thunderTime: number };
  readonly autosave: { readonly enabled: boolean; readonly intervalSeconds: number };
  readonly lastPlayedMs: number;
  readonly inventory?: (SerializedItemStack | null)[];
  readonly selectedHotbarSlot?: number;
  readonly furnaces?: SerializedFurnace[];
  readonly chests?: SerializedChest[];
}
export function validateWorldMetadata(value: unknown): WorldMetadata {
  if (typeof value !== 'object' || value === null) throw new Error('World metadata must be an object');
  const data=value as Record<string,unknown>; const req=(key:string)=>{if(!(key in data))throw new Error(`World metadata missing ${key}`);return data[key];};
  if(data.formatVersion!==WORLD_METADATA_VERSION)throw new Error(`Unsupported world metadata version: ${String(data.formatVersion)}`);
  if(typeof req('worldId')!=='string'||typeof req('name')!=='string'||typeof req('seed')!=='string')throw new Error('World metadata identity is invalid');
  try { BigInt(data.seed as string); } catch { throw new Error('World metadata seed is not a decimal bigint'); }
  const spawn=req('spawn') as Record<string,unknown>;
  // Version-1 metadata written before player state existed is migrated from spawn.
  if (!('player' in data)) data.player = { x: spawn.x, y: spawn.y, z: spawn.z, yaw: 0, pitch: 0 };
  if (!('difficulty' in data)) data.difficulty = Difficulty.Normal;
  if (!isDifficulty(data.difficulty)) throw new Error('World difficulty is invalid');
  if(!('playerHealth'in data))data.playerHealth={health:20,maxHealth:20};const survival=data.playerHealth as Record<string,unknown>;if(!Number.isFinite(survival?.health)||!Number.isFinite(survival?.maxHealth)||(survival.maxHealth as number)<1)throw new Error('Player health metadata is invalid');survival.maxHealth=Math.max(1,Math.floor(survival.maxHealth as number));survival.health=Math.max(0,Math.min(survival.maxHealth as number,survival.health as number));if(!('playerFood'in data))data.playerFood={hunger:20,saturation:5,exhaustion:0};const food=data.playerFood as Record<string,unknown>;if(!Number.isFinite(food?.hunger)||!Number.isFinite(food?.saturation)||!Number.isFinite(food?.exhaustion))throw new Error('Player food metadata is invalid');food.hunger=Math.max(0,Math.min(20,food.hunger as number));food.saturation=Math.max(0,Math.min(food.hunger as number,food.saturation as number));food.exhaustion=Math.max(0,food.exhaustion as number);
  const player=data.player as Record<string,unknown>; const weather=req('weather') as Record<string,unknown>; const autosave=req('autosave') as Record<string,unknown>;
  for(const value of [spawn?.x,spawn?.y,spawn?.z,data.timeTicks,weather?.rainTime,weather?.thunderTime,data.lastPlayedMs,autosave?.intervalSeconds])if(typeof value!=='number'||!Number.isFinite(value))throw new Error('World metadata numeric field is invalid');
  if(typeof weather?.raining!=='boolean'||typeof weather?.thundering!=='boolean'||typeof autosave?.enabled!=='boolean')throw new Error('World metadata state is invalid');

  const isValidPlayer = Number.isFinite(player?.x) && Number.isFinite(player?.y) && Number.isFinite(player?.z) && Number.isFinite(player?.yaw) && Number.isFinite(player?.pitch) && (player.y as number) > -100 && (player.y as number) < 300;
  if (!isValidPlayer) {
    console.warn('Invalid player position in metadata. Falling back to world spawn.', player);
    data.player = { x: spawn.x as number + 0.5, y: -2000, z: spawn.z as number + 0.5, yaw: 0, pitch: 0 };
  }

  return data as unknown as WorldMetadata;
}
export function encodeWorldMetadata(metadata: WorldMetadata): Uint8Array { validateWorldMetadata(metadata); return new TextEncoder().encode(JSON.stringify(metadata)); }
export function decodeWorldMetadata(bytes: Uint8Array): WorldMetadata { try{return validateWorldMetadata(JSON.parse(new TextDecoder().decode(bytes)));}catch(error){throw new Error(`Malformed world metadata: ${error instanceof Error ? error.message : String(error)}`);} }
