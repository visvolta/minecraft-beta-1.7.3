import { BlockIds } from '../../blocks/BlockId';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import { AABB } from '../../physics/AABB';
import type { Player } from '../../player/Player';
import { getBlockBounds, type BlockBehaviourRegistry } from '../../world/BlockBehaviour';
import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import type { ChunkManager } from '../../world/ChunkManager';
import { CHUNK_SIZE_Y } from '../../world/chunkConstants';
import type { ClimateSampler } from '../../world/generation/climate/ClimateSampler';
import { selectBiome } from '../../world/generation/climate/BiomeSelector';
import type { PassiveMobKind, PassiveSpawnEntry } from '../../world/generation/climate/biomes';
import type { JavaRandom } from '../../world/generation/random/JavaRandom';
import type { Entity } from '../core/Entity';
import type { EntityManager } from '../core/EntityManager';
import { ChickenEntity } from '../living/ChickenEntity';
import { CowEntity } from '../living/CowEntity';
import { PigEntity } from '../living/PigEntity';
import { SheepEntity } from '../living/SheepEntity';

/** Beta `EnumCreatureType.creature` base cap. */
export const PASSIVE_CREATURE_CAP = 15;
/** Beta builds a 17×17 square around every player. */
export const PASSIVE_ELIGIBLE_CHUNK_RADIUS = 8;
/** Beta does three rounds of four attempts for the selected herd type. */
export const PASSIVE_GROUP_ROUNDS = 3;
export const PASSIVE_ATTEMPTS_PER_ROUND = 4;
export const PASSIVE_MAX_GROUP_SIZE = 4;
export const PASSIVE_MIN_DISTANCE = 24;

interface ChunkCoordinate {
  x: number;
  z: number;
}

export interface PassiveSpawnerOptions {
  readonly chunkManager: ChunkManager;
  readonly entityManager: EntityManager;
  readonly blockRegistry: BlockRegistry;
  readonly behaviourRegistry: BlockBehaviourRegistry;
  readonly world: BlockUpdateWorld;
  readonly climateSampler: ClimateSampler;
  readonly rng: JavaRandom;
  readonly player: Player;
  readonly worldSpawn: Readonly<{ x: number; y: number; z: number }>;
  readonly getSkylightSubtracted: () => number;
}

export function scaledPassiveCap(eligibleChunkCount: number): number {
  return Math.floor(PASSIVE_CREATURE_CAP * eligibleChunkCount / 256);
}

export function selectWeightedPassiveSpawn(
  entries: readonly PassiveSpawnEntry[],
  nextInt: (bound: number) => number,
): PassiveSpawnEntry {
  let total = 0;
  for (const entry of entries) total += entry.weight;
  let roll = nextInt(total);
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return entries[0]!;
}

const MOB_DIMENSIONS: Readonly<Record<PassiveMobKind, readonly [number, number]>> = {
  pig: [0.9, 0.9],
  cow: [0.9, 1.3],
  sheep: [0.9, 1.3],
  chicken: [0.3, 0.4],
};

/**
 * Beta 1.7.3 `SpawnerAnimals` for the passive `creature` category only.
 * Engine owns this service and calls it exactly once per authoritative tick;
 * EntityManager remains the sole owner of every entity created here.
 */
export class NaturalPassiveSpawner {
  private readonly eligibleChunks: ChunkCoordinate[] = [];
  private readonly eligibleKeys = new Set<string>();
  private readonly biomeSpawnCache = new Map<string, readonly PassiveSpawnEntry[]>();
  private lastPlayerChunkX: number | null = null;
  private lastPlayerChunkZ: number | null = null;
  /** Candidates joined during this pass are still in EntityManager's add queue. */
  private readonly acceptedThisPass: AABB[] = [];

  public constructor(private readonly options: PassiveSpawnerOptions) {}

  /** Performs one Beta passive spawn pass and returns the number joined. */
  public tick(): number {
    this.acceptedThisPass.length = 0;
    this.buildEligibleChunks();
    const eligibleCount = this.eligibleChunks.length;
    if (eligibleCount === 0) return 0;

    const scaledCap = scaledPassiveCap(eligibleCount);
    // Beta uses <=, so a pass is still allowed exactly at the scaled cap.
    if (this.options.entityManager.activePassiveCreatureCount > scaledCap) return 0;

    let spawned = 0;
    for (const chunk of this.eligibleChunks) {
      if (!this.options.chunkManager.hasChunk(chunk.x, chunk.z)) continue;
      spawned += this.spawnInChunk(chunk.x, chunk.z);
    }
    return spawned;
  }

  public getEligibleChunkCount(): number {
    return this.eligibleChunks.length;
  }

  public getScaledCap(): number {
    return scaledPassiveCap(this.eligibleChunks.length);
  }

  private buildEligibleChunks(): void {
    const centerX = Math.floor(this.options.player.position.x / 16);
    const centerZ = Math.floor(this.options.player.position.z / 16);
    if (centerX === this.lastPlayerChunkX && centerZ === this.lastPlayerChunkZ) return;
    this.lastPlayerChunkX = centerX;
    this.lastPlayerChunkZ = centerZ;
    this.eligibleChunks.length = 0;
    this.eligibleKeys.clear();
    // Stable player-centred insertion replaces unspecified Java HashSet order.
    for (let dx = -PASSIVE_ELIGIBLE_CHUNK_RADIUS; dx <= PASSIVE_ELIGIBLE_CHUNK_RADIUS; dx++) {
      for (let dz = -PASSIVE_ELIGIBLE_CHUNK_RADIUS; dz <= PASSIVE_ELIGIBLE_CHUNK_RADIUS; dz++) {
        const x = centerX + dx;
        const z = centerZ + dz;
        const key = `${x},${z}`;
        if (this.eligibleKeys.has(key)) continue;
        this.eligibleKeys.add(key);
        this.eligibleChunks.push({ x, z });
      }
    }
  }

  private spawnInChunk(chunkX: number, chunkZ: number): number {
    const originX = chunkX * 16;
    const originZ = chunkZ * 16;
    const spawnList = this.getSpawnList(chunkX, chunkZ, originX, originZ);
    if (spawnList.length === 0) return 0;
    const entry = selectWeightedPassiveSpawn(spawnList, (bound) => this.options.rng.nextInt(bound));

    const initialX = originX + this.options.rng.nextInt(16);
    const initialY = this.options.rng.nextInt(CHUNK_SIZE_Y);
    const initialZ = originZ + this.options.rng.nextInt(16);
    const initialDefinition = this.options.blockRegistry.getById(this.options.world.getBlock(initialX, initialY, initialZ));
    // Passive creature material is Material.air in Beta.
    if (initialDefinition !== undefined && (initialDefinition.solid || initialDefinition.isLiquid || initialDefinition.id !== 0)) return 0;

    let groupCount = 0;
    for (let round = 0; round < PASSIVE_GROUP_ROUNDS; round++) {
      let x = initialX;
      const y = initialY; // Beta nextInt(1)-nextInt(1) is always zero.
      let z = initialZ;
      for (let attempt = 0; attempt < PASSIVE_ATTEMPTS_PER_ROUND; attempt++) {
        x += this.options.rng.nextInt(6) - this.options.rng.nextInt(6);
        z += this.options.rng.nextInt(6) - this.options.rng.nextInt(6);
        const spawnX = x + 0.5;
        const spawnZ = z + 0.5;
        if (!this.isValidSpawn(entry.kind, spawnX, y, spawnZ)) continue;

        const entity = this.createEntity(entry.kind, spawnX, y, spawnZ);
        this.acceptedThisPass.push(entity.getAABB());
        entity.yaw = this.options.rng.nextFloat() * 360;
        this.options.entityManager.add(entity);
        groupCount += 1;
        if (groupCount >= PASSIVE_MAX_GROUP_SIZE) return groupCount;
      }
    }
    return groupCount;
  }

  private getSpawnList(
    chunkX: number,
    chunkZ: number,
    originX: number,
    originZ: number,
  ): readonly PassiveSpawnEntry[] {
    const key = `${chunkX},${chunkZ}`;
    const cached = this.biomeSpawnCache.get(key);
    if (cached !== undefined) return cached;
    const climate = this.options.climateSampler.sampleRegion(originX, originZ, 1, 1)[0];
    const list = climate === undefined ? [] : selectBiome(climate).passiveSpawns;
    this.biomeSpawnCache.set(key, list);
    return list;
  }

  private isValidSpawn(kind: PassiveMobKind, x: number, y: number, z: number): boolean {
    if (y < 1 || y >= CHUNK_SIZE_Y) return false;
    const blockX = Math.floor(x);
    const blockZ = Math.floor(z);
    if (!this.options.world.isLoaded(blockX, blockZ)) return false;

    const below = this.options.blockRegistry.getById(this.options.world.getBlock(blockX, y - 1, blockZ));
    const at = this.options.blockRegistry.getById(this.options.world.getBlock(blockX, y, blockZ));
    const above = this.options.blockRegistry.getById(this.options.world.getBlock(blockX, y + 1, blockZ));
    if (below?.id !== BlockIds.Grass || !below.solid) return false;
    if (at?.solid || at?.isLiquid || above?.solid) return false;

    const light = Math.max(
      this.options.world.getBlocklight(blockX, y, blockZ),
      this.options.world.getSkylight(blockX, y, blockZ) - this.options.getSkylightSubtracted(),
    );
    if (light <= 8) return false;

    const [width, height] = MOB_DIMENSIONS[kind];
    const half = width / 2;
    const box = new AABB(x - half, y, z - half, x + half, y + height, z + half);
    if (!this.areAabbChunksLoaded(box) || this.hasBlockOrLiquidCollision(box)) return false;
    if (this.options.entityManager.getEntitiesInAABB(box).length > 0) return false;
    for (const accepted of this.acceptedThisPass) if (box.intersects(accepted)) return false;
    if (box.intersects(this.options.player.getAABB())) return false;

    const playerDx = x - this.options.player.position.x;
    const playerDy = y - this.options.player.position.y;
    const playerDz = z - this.options.player.position.z;
    if (playerDx * playerDx + playerDy * playerDy + playerDz * playerDz < PASSIVE_MIN_DISTANCE ** 2) return false;

    const spawnDx = x - this.options.worldSpawn.x;
    const spawnDy = y - this.options.worldSpawn.y;
    const spawnDz = z - this.options.worldSpawn.z;
    return spawnDx * spawnDx + spawnDy * spawnDy + spawnDz * spawnDz >= PASSIVE_MIN_DISTANCE ** 2;
  }

  private areAabbChunksLoaded(box: AABB): boolean {
    const minX = Math.floor(box.minX / 16);
    const maxX = Math.floor((box.maxX - Number.EPSILON) / 16);
    const minZ = Math.floor(box.minZ / 16);
    const maxZ = Math.floor((box.maxZ - Number.EPSILON) / 16);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        if (!this.options.chunkManager.hasChunk(cx, cz)) return false;
      }
    }
    return true;
  }

  private hasBlockOrLiquidCollision(box: AABB): boolean {
    for (let x = Math.floor(box.minX); x <= Math.floor(box.maxX); x++) {
      for (let y = Math.floor(box.minY); y <= Math.floor(box.maxY); y++) {
        for (let z = Math.floor(box.minZ); z <= Math.floor(box.maxZ); z++) {
          const definition = this.options.blockRegistry.getById(this.options.world.getBlock(x, y, z));
          if (definition?.isLiquid) return true;
          const bounds = getBlockBounds(
            this.options.blockRegistry,
            this.options.behaviourRegistry,
            this.options.world,
            x, y, z,
            'collision',
          );
          for (const blockBox of bounds) if (box.intersects(blockBox)) return true;
        }
      }
    }
    return false;
  }

  private createEntity(kind: PassiveMobKind, x: number, y: number, z: number): Entity {
    const context = this.options.entityManager.context;
    switch (kind) {
      case 'pig': return new PigEntity(context, x, y, z);
      case 'cow': return new CowEntity(context, x, y, z);
      case 'sheep': return new SheepEntity(context, x, y, z);
      case 'chicken': return new ChickenEntity(context, x, y, z);
    }
  }
}
