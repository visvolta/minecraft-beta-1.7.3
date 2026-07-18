export const WORLD_METADATA_VERSION = 1;
export interface WorldMetadata {
  readonly formatVersion: number;
  readonly worldId: string;
  readonly name: string;
  readonly seed: string;
  readonly spawn: { readonly x: number; readonly y: number; readonly z: number };
  /** Current player transform; distinct from configured world spawn. */
  readonly player: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly pitch: number };
  readonly timeTicks: number;
  readonly weather: { readonly raining: boolean; readonly thundering: boolean; readonly rainTime: number; readonly thunderTime: number };
  readonly autosave: { readonly enabled: boolean; readonly intervalSeconds: number };
  readonly lastPlayedMs: number;
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
  const player=data.player as Record<string,unknown>; const weather=req('weather') as Record<string,unknown>; const autosave=req('autosave') as Record<string,unknown>;
  for(const value of [spawn?.x,spawn?.y,spawn?.z,player?.x,player?.y,player?.z,player?.yaw,player?.pitch,data.timeTicks,weather?.rainTime,weather?.thunderTime,data.lastPlayedMs,autosave?.intervalSeconds])if(typeof value!=='number'||!Number.isFinite(value))throw new Error('World metadata numeric field is invalid');
  if(typeof weather?.raining!=='boolean'||typeof weather?.thundering!=='boolean'||typeof autosave?.enabled!=='boolean')throw new Error('World metadata state is invalid');
  return data as unknown as WorldMetadata;
}
export function encodeWorldMetadata(metadata: WorldMetadata): Uint8Array { validateWorldMetadata(metadata); return new TextEncoder().encode(JSON.stringify(metadata)); }
export function decodeWorldMetadata(bytes: Uint8Array): WorldMetadata { try{return validateWorldMetadata(JSON.parse(new TextDecoder().decode(bytes)));}catch(error){throw new Error(`Malformed world metadata: ${error instanceof Error ? error.message : String(error)}`);} }
