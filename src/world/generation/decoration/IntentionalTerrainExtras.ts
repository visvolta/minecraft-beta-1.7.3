import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../chunkConstants';
import { BlockIds } from '../../../blocks/BlockId';
import { TALL_GRASS_META_FERN } from '../../../blocks/TallGrassMeta';
import { JavaRandom } from '../random/JavaRandom';
import type { BiomeId } from '../climate/biomes';
import { ClimateSampler } from '../climate/ClimateSampler';
import { selectBiome } from '../climate/BiomeSelector';
import { classifyTaigaColumn } from '../climate/OldGrowthSpruceTaiga';
import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import { MegaSpruceTreeGenerator } from '../trees/MegaSpruceTreeGenerator';
import { TaigaTree1Generator } from '../trees/TaigaTree1Generator';
import { TaigaTree2Generator } from '../trees/TaigaTree2Generator';
import { WorldGenTallGrass } from './WorldGenTallGrass';
import { WorldGenFlowers } from './WorldGenFlowers';
import { WorldGenForestRock } from './WorldGenForestRock';
import { OctaveSimplexNoise2D } from '../noise/OctaveSimplexNoise2D';

/**
 * Intentional non-Beta terrain extras.
 *
 * ALWAYS uses a separate salted RNG stream — never the Beta populate Random.
 * Runs only after the complete Beta population sequence for a source chunk.
 */
export class IntentionalTerrainExtras {
  private readonly worldSeed: bigint;
  private readonly climate: ClimateSampler;
  private readonly groundNoise: OctaveSimplexNoise2D;
  private readonly megaSpruce = new MegaSpruceTreeGenerator();
  private readonly taiga1 = new TaigaTree1Generator();
  private readonly taiga2 = new TaigaTree2Generator();
  private readonly fernGen = new WorldGenTallGrass(BlockIds.TallGrass, TALL_GRASS_META_FERN);
  private readonly brownMushroom = new WorldGenFlowers(BlockIds.BrownMushroom);
  private readonly redMushroom = new WorldGenFlowers(BlockIds.RedMushroom);
  private readonly rockGen = new WorldGenForestRock();

  public constructor(worldSeed: bigint) {
    this.worldSeed = worldSeed;
    this.climate = new ClimateSampler(worldSeed);
    // Independent of Beta climate multipliers.
    this.groundNoise = new OctaveSimplexNoise2D(new JavaRandom(worldSeed ^ 0x5441494741n), 4);
  }

  public apply(world: TreeWorldAccessor, chunkX: number, chunkZ: number, _chunkBiomeId: BiomeId): void {
    const originX = chunkX * CHUNK_SIZE_X;
    const originZ = chunkZ * CHUNK_SIZE_Z;
    const random = this.makeExtrasRandom(chunkX, chunkZ);

    let taigaColumns = 0;
    let ogstColumns = 0;

    // Per-column surface patches (normal taiga vs OGST). Column biome is authoritative.
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const wx = originX + lx;
        const wz = originZ + lz;
        const colBiome = selectBiome(this.climate.sampleRegion(wx, wz, 1, 1)[0]!);
        if (colBiome.id !== 'taiga') continue;
        taigaColumns++;

        const kind = classifyTaigaColumn(this.worldSeed, wx, wz);
        if (kind === 'oldGrowthSpruceTaiga') ogstColumns++;

        const replaceY = this.findSurfaceY(world, wx, wz);
        if (replaceY <= 0 || replaceY >= 127) continue;

        const n = this.sampleGround(wx, wz);
        // Quantize noise into stable patch cells so podzol/coarse form clumps.
        const patch = this.sampleGround(Math.floor(wx / 4) * 4, Math.floor(wz / 4) * 4);
        if (kind === 'oldGrowthSpruceTaiga') {
          // Heavy podzol / coarse dirt (majority non-grass), grass pockets remain.
          if (patch > 0.35) {
            world.setBlock(wx, replaceY, wz, n > 0.5 ? BlockIds.CoarseDirt : BlockIds.Podzol);
          }
        } else {
          // Moderate patches — still mostly grass (Beta taiga character).
          if (patch > 0.52 && patch <= 0.68) {
            world.setBlock(wx, replaceY, wz, BlockIds.Podzol);
          } else if (patch > 0.68 && patch <= 0.78) {
            world.setBlock(wx, replaceY, wz, BlockIds.CoarseDirt);
          }
        }
      }
    }

    if (taigaColumns === 0) return;

    // Ferns: moderate in normal taiga, dense when chunk has substantial OGST.
    const fernAttempts = ogstColumns > 40 ? 18 : 6;
    for (let i = 0; i < fernAttempts; i++) {
      const rx = originX + random.nextInt(16) + 8;
      const rz = originZ + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      if (selectBiome(this.climate.sampleRegion(rx, rz, 1, 1)[0]!).id !== 'taiga') continue;
      this.fernGen.generate(world, random, rx, ry, rz);
    }

    if (ogstColumns > 40) {
      const megaCount = 2 + random.nextInt(3);
      for (let i = 0; i < megaCount; i++) {
        const rx = originX + random.nextInt(16) + 8;
        const rz = originZ + random.nextInt(16) + 8;
        if (classifyTaigaColumn(this.worldSeed, rx, rz) !== 'oldGrowthSpruceTaiga') continue;
        const ry = world.getHeight(rx, rz);
        this.megaSpruce.generate(world, random, rx, ry, rz);
      }

      const underCount = 3 + random.nextInt(3);
      for (let i = 0; i < underCount; i++) {
        const rx = originX + random.nextInt(16) + 8;
        const rz = originZ + random.nextInt(16) + 8;
        if (classifyTaigaColumn(this.worldSeed, rx, rz) !== 'oldGrowthSpruceTaiga') continue;
        const ry = world.getHeight(rx, rz);
        if (random.nextInt(2) === 0) this.taiga1.generate(world, random, rx, ry, rz);
        else this.taiga2.generate(world, random, rx, ry, rz);
      }

      const rockCount = 2 + random.nextInt(3);
      for (let i = 0; i < rockCount; i++) {
        const rx = originX + random.nextInt(16) + 8;
        const rz = originZ + random.nextInt(16) + 8;
        if (classifyTaigaColumn(this.worldSeed, rx, rz) !== 'oldGrowthSpruceTaiga') continue;
        const ry = world.getHeight(rx, rz);
        this.rockGen.generate(world, random, rx, ry, rz);
      }

      for (let i = 0; i < 4; i++) {
        const rx = originX + random.nextInt(16) + 8;
        const rz = originZ + random.nextInt(16) + 8;
        const ry = random.nextInt(128);
        if (random.nextInt(2) === 0) this.brownMushroom.generate(world, random, rx, ry, rz);
        else this.redMushroom.generate(world, random, rx, ry, rz);
      }
    }
  }

  /**
   * Find the topmost soil-like block in the column (grass/dirt/podzol/coarse),
   * scanning down past leaves/snow/plants. Tree canopy must not hide ground.
   */
  private findSurfaceY(world: TreeWorldAccessor, wx: number, wz: number): number {
    for (let y = 127; y >= 1; y--) {
      const id = world.getBlock(wx, y, wz);
      if (
        id === BlockIds.Grass ||
        id === BlockIds.Dirt ||
        id === BlockIds.Podzol ||
        id === BlockIds.CoarseDirt
      ) {
        return y;
      }
    }
    return -1;
  }

  private makeExtrasRandom(chunkX: number, chunkZ: number): JavaRandom {
    const r = new JavaRandom(this.worldSeed ^ 0x58545241n);
    const a = (r.nextLong() / 2n) * 2n + 1n;
    const b = (r.nextLong() / 2n) * 2n + 1n;
    r.setSeed(BigInt(chunkX) * a + BigInt(chunkZ) * b ^ (this.worldSeed + 0x45585452n));
    return r;
  }

  /**
   * Deterministic [0,1) field for surface patches. Uses octave noise only as a
   * high-frequency mixer on top of a stable integer hash so thresholds are
   * meaningful (raw octave sums are not unit-scale).
   */
  private sampleGround(worldX: number, worldZ: number): number {
    // Integer hash → [0,1)
    let h = Math.imul(worldX | 0, 374761393) + Math.imul(worldZ | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const hash01 = ((h >>> 0) % 10000) / 10000;
    // Low-weight noise for clump softness (not the primary value).
    const [raw] = this.groundNoise.fillArray(worldX * 0.25, worldZ * 0.25, 1, 1, 1, 1, 0.5);
    const mix = ((raw ?? 0) * 0.05 + 0.5) % 1;
    const v = (hash01 * 0.85 + Math.abs(mix) * 0.15) % 1;
    return v < 0 ? v + 1 : v;
  }
}
