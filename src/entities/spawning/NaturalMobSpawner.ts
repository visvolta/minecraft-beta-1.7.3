import type { BlockRegistry } from '../../blocks/BlockRegistry';
import { AABB } from '../../physics/AABB';
import type { Player } from '../../player/Player';
import { Difficulty } from '../../world/Difficulty';
import { getBlockBounds, type BlockBehaviourRegistry } from '../../world/BlockBehaviour';
import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import type { ChunkManager } from '../../world/ChunkManager';
import { CHUNK_SIZE_Y } from '../../world/chunkConstants';
import type { ClimateSampler } from '../../world/generation/climate/ClimateSampler';
import { selectBiome } from '../../world/generation/climate/BiomeSelector';
import type { HostileMobKind, HostileSpawnEntry } from '../../world/generation/climate/biomes';
import type { JavaRandom } from '../../world/generation/random/JavaRandom';
import type { Entity } from '../core/Entity';
import type { EntityManager } from '../core/EntityManager';
import { CreeperEntity } from '../hostile/CreeperEntity';
import { SkeletonEntity } from '../hostile/SkeletonEntity';
import { SpiderEntity } from '../hostile/SpiderEntity';
import { ZombieEntity } from '../hostile/ZombieEntity';
import { NaturalPassiveSpawner, PASSIVE_ELIGIBLE_CHUNK_RADIUS, PASSIVE_ATTEMPTS_PER_ROUND, PASSIVE_GROUP_ROUNDS, PASSIVE_MAX_GROUP_SIZE } from './NaturalPassiveSpawner';

export const HOSTILE_CREATURE_CAP = 70;

interface ChunkCoordinate { x: number; z: number; }
export interface NaturalMobSpawnResult { readonly hostile: number; readonly passive: number; }
export interface NaturalMobSpawnerOptions {
  readonly chunkManager: ChunkManager; readonly entityManager: EntityManager;
  readonly blockRegistry: BlockRegistry; readonly behaviourRegistry: BlockBehaviourRegistry;
  readonly world: BlockUpdateWorld; readonly climateSampler: ClimateSampler;
  readonly rng: JavaRandom; readonly player: Player;
  readonly worldSpawn: Readonly<{ x: number; y: number; z: number }>;
  readonly getSkylightSubtracted: () => number;
  readonly getDifficulty: () => Difficulty;
  readonly isThundering: () => boolean;
}

const HOSTILE_DIMENSIONS: Readonly<Record<HostileMobKind, readonly [number, number]>> = {
  zombie: [0.6, 1.8], skeleton: [0.6, 1.8], spider: [1.4, 0.9], creeper: [0.6, 1.8],
};

export function scaledHostileCap(eligibleChunkCount: number): number {
  return Math.floor(HOSTILE_CREATURE_CAP * eligibleChunkCount / 256);
}
export function isHostileSpawningEnabled(difficulty: Difficulty): boolean { return difficulty !== Difficulty.Peaceful; }

export function selectWeightedHostileSpawn(entries: readonly HostileSpawnEntry[], nextInt: (bound: number) => number): HostileSpawnEntry {
  let total = 0; for (const entry of entries) total += entry.weight;
  let roll = nextInt(total);
  for (const entry of entries) { roll -= entry.weight; if (roll < 0) return entry; }
  return entries[0]!;
}

/** Single Engine-owned coordinator. Hostile pass precedes its passive delegate, matching Beta category order. */
export class NaturalMobSpawner {
  private readonly passive: NaturalPassiveSpawner;
  private readonly eligibleChunks: ChunkCoordinate[] = [];
  private readonly eligibleKeys = new Set<string>();
  private readonly acceptedThisPass: AABB[] = [];
  private readonly biomeSpawnCache = new Map<string, readonly HostileSpawnEntry[]>();
  private lastPlayerChunkX: number | null = null; private lastPlayerChunkZ: number | null = null;

  public constructor(private readonly options: NaturalMobSpawnerOptions) {
    this.passive = new NaturalPassiveSpawner({
      chunkManager: options.chunkManager, entityManager: options.entityManager,
      blockRegistry: options.blockRegistry, behaviourRegistry: options.behaviourRegistry,
      world: options.world, climateSampler: options.climateSampler, rng: options.rng,
      player: options.player, worldSpawn: options.worldSpawn,
      getSkylightSubtracted: options.getSkylightSubtracted,
    });
  }

  public tick(): NaturalMobSpawnResult {
    const hostile = isHostileSpawningEnabled(this.options.getDifficulty()) ? this.tickHostiles() : 0;
    const passive = this.passive.tick();
    return { hostile, passive };
  }

  public getEligibleChunkCount(): number { this.buildEligibleChunks(); return this.eligibleChunks.length; }
  public getScaledHostileCap(): number { return scaledHostileCap(this.getEligibleChunkCount()); }

  private tickHostiles(): number {
    this.acceptedThisPass.length = 0; this.buildEligibleChunks();
    if (this.options.entityManager.activeHostileMobCount > scaledHostileCap(this.eligibleChunks.length)) return 0;
    let spawned = 0;
    for (const chunk of this.eligibleChunks) {
      if (this.options.chunkManager.hasChunk(chunk.x, chunk.z)) spawned += this.spawnInChunk(chunk.x, chunk.z);
    }
    return spawned;
  }

  private buildEligibleChunks(): void {
    const centerX = Math.floor(this.options.player.position.x / 16); const centerZ = Math.floor(this.options.player.position.z / 16);
    if (centerX === this.lastPlayerChunkX && centerZ === this.lastPlayerChunkZ) return;
    this.lastPlayerChunkX = centerX; this.lastPlayerChunkZ = centerZ; this.eligibleChunks.length = 0; this.eligibleKeys.clear();
    for (let dx = -PASSIVE_ELIGIBLE_CHUNK_RADIUS; dx <= PASSIVE_ELIGIBLE_CHUNK_RADIUS; dx++) for (let dz = -PASSIVE_ELIGIBLE_CHUNK_RADIUS; dz <= PASSIVE_ELIGIBLE_CHUNK_RADIUS; dz++) {
      const x = centerX + dx; const z = centerZ + dz; const key = `${x},${z}`;
      if (!this.eligibleKeys.has(key)) { this.eligibleKeys.add(key); this.eligibleChunks.push({ x, z }); }
    }
  }

  private spawnInChunk(chunkX: number, chunkZ: number): number {
    const originX = chunkX * 16; const originZ = chunkZ * 16;
    const entries = this.getSpawnList(chunkX, chunkZ, originX, originZ); if (entries.length === 0) return 0;
    const entry = selectWeightedHostileSpawn(entries, bound => this.options.rng.nextInt(bound));
    const initialX = originX + this.options.rng.nextInt(16); const initialY = this.options.rng.nextInt(CHUNK_SIZE_Y); const initialZ = originZ + this.options.rng.nextInt(16);
    const initial = this.options.blockRegistry.getById(this.options.world.getBlock(initialX, initialY, initialZ));
    if (initial !== undefined && initial.id !== 0) return 0;
    let groupCount = 0;
    for (let round = 0; round < PASSIVE_GROUP_ROUNDS; round++) {
      let x = initialX; const y = initialY; let z = initialZ;
      for (let attempt = 0; attempt < PASSIVE_ATTEMPTS_PER_ROUND; attempt++) {
        x += this.options.rng.nextInt(6) - this.options.rng.nextInt(6); z += this.options.rng.nextInt(6) - this.options.rng.nextInt(6);
        const spawnX = x + 0.5; const spawnZ = z + 0.5;
        if (!this.isValidSpawn(entry.kind, spawnX, y, spawnZ)) continue;
        const entity = this.createEntity(entry.kind, spawnX, y, spawnZ); this.acceptedThisPass.push(entity.getAABB());
        entity.yaw = this.options.rng.nextFloat() * 360; this.options.entityManager.add(entity); groupCount++;
        if (groupCount >= PASSIVE_MAX_GROUP_SIZE) return groupCount;
      }
    }
    return groupCount;
  }

  private isValidSpawn(kind: HostileMobKind, x: number, y: number, z: number): boolean {
    if (y < 1 || y >= CHUNK_SIZE_Y - 1) return false;
    const bx = Math.floor(x); const bz = Math.floor(z); if (!this.options.world.isLoaded(bx, bz)) return false;
    const below = this.options.blockRegistry.getById(this.options.world.getBlock(bx, y - 1, bz));
    const at = this.options.blockRegistry.getById(this.options.world.getBlock(bx, y, bz));
    const above = this.options.blockRegistry.getById(this.options.world.getBlock(bx, y + 1, bz));
    if (!below?.solid || at?.solid || at?.isLiquid || above?.solid || above?.isLiquid) return false;
    if (!this.passesDistanceRules(x, y, z)) return false;
    // Beta EntityMob consumes these random checks before EntityLiving's final collision test.
    const sky = this.options.world.getSkylight(bx, y, bz); if (sky > this.options.rng.nextInt(32)) return false;
    const subtraction = this.options.isThundering() ? 10 : this.options.getSkylightSubtracted();
    const effective = Math.max(this.options.world.getBlocklight(bx, y, bz), sky - subtraction);
    if (effective > this.options.rng.nextInt(8)) return false;
    const [width, height] = HOSTILE_DIMENSIONS[kind]; const half = width / 2;
    const box = new AABB(x - half, y, z - half, x + half, y + height, z + half);
    if (!this.areAabbChunksLoaded(box) || this.hasBlockOrLiquidCollision(box)) return false;
    if (this.options.entityManager.getEntitiesInAABB(box).length > 0 || box.intersects(this.options.player.getAABB())) return false;
    for (const accepted of this.acceptedThisPass) if (box.intersects(accepted)) return false;
    return true;
  }

  private passesDistanceRules(x: number, y: number, z: number): boolean {
    const p = this.options.player.position; const pd = (x-p.x)**2 + (y-p.y)**2 + (z-p.z)**2; if (pd < 576) return false;
    const s = this.options.worldSpawn; return (x-s.x)**2 + (y-s.y)**2 + (z-s.z)**2 >= 576;
  }
  private areAabbChunksLoaded(box: AABB): boolean {
    for (let cx=Math.floor(box.minX/16);cx<=Math.floor((box.maxX-Number.EPSILON)/16);cx++) for(let cz=Math.floor(box.minZ/16);cz<=Math.floor((box.maxZ-Number.EPSILON)/16);cz++) if(!this.options.chunkManager.hasChunk(cx,cz))return false; return true;
  }
  private hasBlockOrLiquidCollision(box: AABB): boolean {
    for(let x=Math.floor(box.minX);x<=Math.floor(box.maxX);x++)for(let y=Math.floor(box.minY);y<=Math.floor(box.maxY);y++)for(let z=Math.floor(box.minZ);z<=Math.floor(box.maxZ);z++){
      const def=this.options.blockRegistry.getById(this.options.world.getBlock(x,y,z));if(def?.isLiquid)return true;
      for(const blockBox of getBlockBounds(this.options.blockRegistry,this.options.behaviourRegistry,this.options.world,x,y,z,'collision'))if(box.intersects(blockBox))return true;
    } return false;
  }
  private getSpawnList(chunkX:number,chunkZ:number,originX:number,originZ:number):readonly HostileSpawnEntry[]{
    const key=`${chunkX},${chunkZ}`;const cached=this.biomeSpawnCache.get(key);if(cached)return cached;
    const climate=this.options.climateSampler.sampleRegion(originX,originZ,1,1)[0];const list=climate?selectBiome(climate).hostileSpawns:[];this.biomeSpawnCache.set(key,list);return list;
  }
  private createEntity(kind:HostileMobKind,x:number,y:number,z:number):Entity{const ctx=this.options.entityManager.context;switch(kind){case'zombie':return new ZombieEntity(ctx,x,y,z);case'skeleton':return new SkeletonEntity(ctx,x,y,z);case'spider':return new SpiderEntity(ctx,x,y,z);case'creeper':return new CreeperEntity(ctx,x,y,z);}}
}
