import { decodeWorldMetadata, encodeWorldMetadata, type WorldMetadata, WORLD_METADATA_VERSION } from '../metadata/WorldMetadata';
import type { WorldStorage } from '../storage/WorldStorage';
export interface SaveMetrics { readonly dirty:boolean; readonly saves:number; readonly failures:number; readonly lastError:string|undefined; }
const KEY='metadata.json';
/** Persistence owns writes and dirty state; Engine deliberately owns when autosave is triggered. */
export class WorldSaveCoordinator {
  private metadata:WorldMetadata; private dirty=false; private saves=0; private failures=0; private lastError:string|undefined;
  private constructor(private readonly storage:WorldStorage, metadata:WorldMetadata) { this.metadata=metadata; }
  public static async open(storage:WorldStorage, fallback:WorldMetadata):Promise<WorldSaveCoordinator>{const bytes=await storage.get(fallback.worldId,KEY);return new WorldSaveCoordinator(storage,bytes===undefined?fallback:decodeWorldMetadata(bytes));}
  public getMetadata():WorldMetadata{return this.metadata;} public isDirty():boolean{return this.dirty;} public getMetrics():SaveMetrics{return{dirty:this.dirty,saves:this.saves,failures:this.failures,lastError:this.lastError};}
  public update(metadata:WorldMetadata):void{if(JSON.stringify(this.metadata)!==JSON.stringify(metadata)){this.metadata=metadata;this.dirty=true;}}
  public async save(force=false):Promise<void>{if(!this.dirty&&!force)return;try{this.metadata={...this.metadata,lastPlayedMs:Date.now()};await this.storage.put(this.metadata.worldId,KEY,encodeWorldMetadata(this.metadata));this.dirty=false;this.saves++;this.lastError=undefined;}catch(error){this.failures++;this.lastError=error instanceof Error?error.message:String(error);throw error;}}
}
export function createDefaultMetadata():WorldMetadata{return{formatVersion:WORLD_METADATA_VERSION,worldId:'default',name:'Default World',seed:'-47',spawn:{x:8,y:140,z:8},player:{x:8,y:140,z:8,yaw:0,pitch:0},timeTicks:0,weather:{raining:false,thundering:false,rainTime:0,thunderTime:0},autosave:{enabled:true,intervalSeconds:30},lastPlayedMs:0};}
