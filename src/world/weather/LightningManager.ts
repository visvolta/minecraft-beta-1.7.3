import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { ChunkManager } from '../ChunkManager';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../chunkConstants';
import { JavaRandom } from '../generation/random/JavaRandom';
import { blockIdBlocksWeather } from './WeatherBlocking';
import type { WeatherState } from './WeatherState';
import { LightningState, type LightningBoltState } from './LightningState';

const MAX_VISUAL_BOLTS = 8;
const BOLT_VISIBLE_TICKS = 8;
const STRIKE_CHUNK_RADIUS = 9;
const STRIKE_CHANCE_PER_CHUNK_PER_TICK = 100000;

export type ThunderAudioHook = (x: number, y: number, z: number, distance: number) => void;

interface MutableBolt {
  x: number;
  y: number;
  z: number;
  seed: bigint;
  ageTicks: number;
  stateTicks: number;
}

/**
 * Vanilla-shaped lightning simulation for visual weather effects. It owns
 * strike scheduling, strike placement, flash timing, and active bolt state;
 * rendering reads LightningState and has no weather/gameplay decisions.
 */
export class LightningManager {
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly random: JavaRandom;
  private readonly state = new LightningState();
  private readonly bolts: MutableBolt[] = [];
  private tickAccumulator = 0;
  private flashTicks = 0;
  private audioHook: ThunderAudioHook | null = null;

  public constructor(chunkManager: ChunkManager, blockRegistry: BlockRegistry, sessionSeed: bigint) {
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
    this.random = new JavaRandom(sessionSeed ^ 0x1e17b01n);
  }

  public setAudioHook(hook: ThunderAudioHook | null): void {
    this.audioHook = hook;
  }

  public update(
    deltaSeconds: number,
    weather: WeatherState,
    cameraX: number,
    cameraY: number,
    cameraZ: number,
  ): void {
    this.tickAccumulator += deltaSeconds * 20;
    while (this.tickAccumulator >= 1) {
      this.tickOnce(weather, cameraX, cameraY, cameraZ);
      this.tickAccumulator -= 1;
    }

    this.publishState();
  }

  public getState(): LightningState {
    return this.state;
  }

  private tickOnce(weather: WeatherState, cameraX: number, cameraY: number, cameraZ: number): void {
    if (this.flashTicks > 0) {
      this.flashTicks -= 1;
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i]!;
      bolt.ageTicks += 1;
      bolt.stateTicks -= 1;
      if (bolt.ageTicks >= BOLT_VISIBLE_TICKS || bolt.stateTicks < -this.random.nextInt(10)) {
        this.bolts.splice(i, 1);
      }
    }

    if (weather.getRainStrength(weather.partialTick) <= 0.2 || weather.getThunderStrength(weather.partialTick) <= 0.9) {
      return;
    }

    for (let dz = -STRIKE_CHUNK_RADIUS; dz <= STRIKE_CHUNK_RADIUS; dz++) {
      for (let dx = -STRIKE_CHUNK_RADIUS; dx <= STRIKE_CHUNK_RADIUS; dx++) {
        if (this.random.nextInt(STRIKE_CHANCE_PER_CHUNK_PER_TICK) !== 0) {
          continue;
        }

        const chunkX = Math.floor(cameraX / CHUNK_SIZE_X) + dx;
        const chunkZ = Math.floor(cameraZ / CHUNK_SIZE_Z) + dz;
        this.tryStrikeChunk(chunkX, chunkZ, cameraX, cameraY, cameraZ);
      }
    }
  }

  private tryStrikeChunk(
    chunkX: number,
    chunkZ: number,
    cameraX: number,
    cameraY: number,
    cameraZ: number,
  ): void {
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined || this.bolts.length >= MAX_VISUAL_BOLTS) {
      return;
    }

    const localX = this.random.nextInt(CHUNK_SIZE_X);
    const localZ = this.random.nextInt(CHUNK_SIZE_Z);
    const worldX = chunkX * CHUNK_SIZE_X + localX;
    const worldZ = chunkZ * CHUNK_SIZE_Z + localZ;
    const y = chunk.getPrecipitationHeight(
      localX,
      localZ,
      (blockId) => blockIdBlocksWeather(this.blockRegistry, blockId),
    );

    if (y <= 0) {
      return;
    }

    this.bolts.push({
      x: worldX,
      y,
      z: worldZ,
      seed: this.random.nextLong(),
      ageTicks: 0,
      stateTicks: 2,
    });
    this.flashTicks = 2;

    const distance = Math.hypot(worldX - cameraX, y - cameraY, worldZ - cameraZ);
    this.audioHook?.(worldX, y, worldZ, distance);
  }

  private publishState(): void {
    const snapshot: LightningBoltState[] = this.bolts.map((bolt) => ({
      x: bolt.x,
      y: bolt.y,
      z: bolt.z,
      seed: bolt.seed,
      ageTicks: bolt.ageTicks,
      stateTicks: bolt.stateTicks,
    }));
    this.state.replaceBolts(snapshot);
    this.state.setFlashTicks(this.flashTicks);
  }
}
