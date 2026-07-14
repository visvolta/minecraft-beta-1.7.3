import { JavaRandom } from '../random/JavaRandom';
import { betaSin, betaCos } from './BetaSineTable';
import { BlockIds } from '../../../blocks/BlockId';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../chunkConstants';

/**
 * Faithful port of Beta 1.7.3's MapGenCaves (both `a(...)` tunnel-walk
 * overloads, plus the `a(World,...)` per-source-chunk cave-system
 * spawner), verified directly against unmodified mc-dev source and
 * cross-checked against Project-Poseidon (behaviourally identical,
 * only decompiler naming/formatting differs).
 *
 * Key structural fact confirmed by reading the source closely (easy to
 * get backwards): inside the tunnel-walk method, the `i, j` parameters
 * are always the TARGET chunk being generated — not the chunk a cave
 * system originated from. The source chunk only matters for (a) seeding
 * this source chunk's RNG stream (BetaCaveGenerator, the MapGenBase
 * port) and (b) the starting X/Z of cave systems spawned from it
 * (`d = sourceX*16 + nextInt(16)`). Once a tunnel starts walking, all
 * math — the distance-abort check, the bounding box, and every
 * `blocks[]` write — is expressed directly in the TARGET chunk's own
 * local coordinate space, because `blocks` always belongs to the target
 * chunk currently being generated. This is exactly what makes
 * cross-chunk caves work: a cave system whose start position is in a
 * neighbouring chunk still carves correctly into the target chunk's own
 * array once its wandering path re-enters the target chunk's bounds.
 *
 * Also confirmed: *every* call to the tunnel-walk method — the initial
 * call from the spawner and both recursive branch calls — constructs a
 * brand-new `Random` seeded via `sharedRandom.nextLong()`, where
 * `sharedRandom` is the same per-source-chunk stream the spawner itself
 * draws from (never the caller's own local per-call Random). This
 * project mirrors that by threading one `JavaRandom` instance
 * (`sharedRandom`, owned by BetaCaveGenerator, already reseeded per
 * source chunk) through every call in this file.
 *
 * Float precision note: Beta's tunnel-walk state (yaw, pitch, their
 * drift accumulators, and the tunnel radius) are Java `float` (32-bit)
 * values, while position (x, y, z) are `double`. Java rounds to float32
 * after every single float arithmetic operation, not just at the end of
 * a compound expression — and this is a long recursive random walk, so
 * even tiny extra precision (e.g. from using JS's native double
 * arithmetic for what should be a float multiply) compounds over many
 * steps into a visibly different tunnel path for the same seed. Every
 * float-typed operation below is therefore wrapped with `Math.fround`
 * individually, in the same grouping/order the source's bytecode would
 * apply it, rather than computed as one native-precision JS expression
 * and rounded once at the end.
 *
 * Deliberate, disclosed deviation: this project has no Lava *fluid*
 * simulation (out of scope for Stage 12B, same as Water). Carved blocks
 * below world Y=10 are set to Lava (id 10, flowing) exactly as real Beta
 * does — placed as static world data only, matching how Water is
 * already handled (registered, rendered, collision-free, never
 * animated/flowing).
 */

/** World Y below which carved cave blocks become Lava instead of Air (source: `l4 < 10`). */
const LAVA_LEVEL = 10;

/** MapGenBase's default radius field (`a = 8`); MapGenCaves does not override it. */
const CAVE_SOURCE_RADIUS = 8;

/** Horizontal (X/Z) target-chunk-local bounds a carve step's bounding box is clamped to. */
const LOCAL_XZ_MIN = 0;
const LOCAL_XZ_MAX = CHUNK_SIZE_X;

/** Vertical bounds a carve step's bounding box is clamped to (source: `i2<1 -> 1`, `j2>120 -> 120`). */
const CARVE_Y_MIN = 1;
const CARVE_Y_MAX = 120;

/** Fixed float32 constant for pi, matching the source's literal `3.141593F` (not full-precision Math.PI). */
const BETA_PI = Math.fround(3.141593);

/** Fixed float32 constant matching the source's literal `1.570796F` (~pi/2, used for branch yaw offset). */
const BETA_HALF_PI = Math.fround(1.570796);

/** Float32 multiply, matching Java's single-rounding `float * float`. */
function fmul(a: number, b: number): number {
  return Math.fround(Math.fround(a) * Math.fround(b));
}

/** Float32 divide, matching Java's single-rounding `float / float`. */
function fdiv(a: number, b: number): number {
  return Math.fround(Math.fround(a) / Math.fround(b));
}

/** Float32 add, matching Java's single-rounding `float + float`. */
function fadd(a: number, b: number): number {
  return Math.fround(Math.fround(a) + Math.fround(b));
}

/** Float32 subtract, matching Java's single-rounding `float - float`. */
function fsub(a: number, b: number): number {
  return Math.fround(Math.fround(a) - Math.fround(b));
}

/** Flat XZY index matching Chunk's own layout (x fastest, then z, then y). */
function blockIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
}

function isCarveableBlock(blockId: number): boolean {
  return blockId === BlockIds.Stone || blockId === BlockIds.Dirt || blockId === BlockIds.Grass;
}

function isWaterBlock(blockId: number): boolean {
  // Beta checks both flowing (id 8) and stationary (id 9) water. This
  // project's terrain generator only ever places stationary Water
  // (BlockIds.Water = 9); id 8 is checked too for full source fidelity
  // in case a future stage ever introduces flowing water.
  return blockId === 8 || blockId === BlockIds.Water;
}

export class CaveCarver {
  /**
   * Faithful port of MapGenCaves's `a(World, i, j, k, l, byte[])`
   * override: the per-source-chunk cave-system spawner. `sharedRandom`
   * is BetaCaveGenerator's per-source-chunk-seeded stream (already
   * reseeded by the caller before this is invoked); this method both
   * reads from it directly (for counts/positions) and passes it down
   * into walkTunnel (which draws further from it to seed each call's
   * own local Random).
   */
  public spawnCaveSystemsForSourceChunk(
    sharedRandom: JavaRandom,
    sourceChunkX: number,
    sourceChunkZ: number,
    targetChunkX: number,
    targetChunkZ: number,
    blocks: Uint8Array,
  ): void {
    let systemCount = sharedRandom.nextInt(
      sharedRandom.nextInt(sharedRandom.nextInt(40) + 1) + 1,
    );

    if (sharedRandom.nextInt(15) !== 0) {
      systemCount = 0;
    }

    for (let s = 0; s < systemCount; s++) {
      const startX = sourceChunkX * CHUNK_SIZE_X + sharedRandom.nextInt(16);
      const startY = sharedRandom.nextInt(sharedRandom.nextInt(120) + 8);
      const startZ = sourceChunkZ * CHUNK_SIZE_Z + sharedRandom.nextInt(16);

      let tunnelCount = 1;

      if (sharedRandom.nextInt(4) === 0) {
        // Room helper (MapGenCaves's 6-arg `a(...)` overload): draws its
        // own initial radius directly from the shared stream, THEN calls
        // the full tunnel-walk method with startNode=-1/totalNodes=-1
        // (room sentinel) and widthFactor=0.5.
        // Source: `1.0F + b.nextFloat() * 6F` — float arithmetic.
        const roomRadius = fadd(1.0, fmul(sharedRandom.nextFloat(), 6.0));
        this.walkTunnel(
          sharedRandom,
          targetChunkX,
          targetChunkZ,
          blocks,
          startX,
          startY,
          startZ,
          roomRadius,
          0,
          0,
          -1,
          -1,
          0.5,
        );
        tunnelCount += sharedRandom.nextInt(4);
      }

      for (let t = 0; t < tunnelCount; t++) {
        // Source: `b.nextFloat() * 3.141593F * 2.0F` — left-to-right float mults.
        const yaw = fmul(fmul(sharedRandom.nextFloat(), BETA_PI), 2.0);
        // Source: `((b.nextFloat() - 0.5F) * 2.0F) / 8F`.
        const pitch = fdiv(fmul(fsub(sharedRandom.nextFloat(), 0.5), 2.0), 8.0);
        // Source: `b.nextFloat() * 2.0F + b.nextFloat()` — note evaluation
        // order: first nextFloat() (for the `*2.0F` term) is drawn BEFORE
        // the second nextFloat() (the `+` term), matching Java's
        // left-to-right operand evaluation.
        const firstDraw = sharedRandom.nextFloat();
        const radiusTerm = fmul(firstDraw, 2.0);
        const secondDraw = sharedRandom.nextFloat();
        const radius = fadd(radiusTerm, secondDraw);

        this.walkTunnel(
          sharedRandom,
          targetChunkX,
          targetChunkZ,
          blocks,
          startX,
          startY,
          startZ,
          radius,
          yaw,
          pitch,
          0,
          0,
          1.0,
        );
      }
    }
  }

  /**
   * Faithful port of MapGenCaves's 12-arg tunnel-walk method (the
   * recursive core of cave generation). Mutates `blocks` — which always
   * belongs to (targetChunkX, targetChunkZ) — in place.
   */
  private walkTunnel(
    sharedRandom: JavaRandom,
    targetChunkX: number,
    targetChunkZ: number,
    blocks: Uint8Array,
    startX: number,
    startY: number,
    startZ: number,
    radiusIn: number,
    startYaw: number,
    startPitch: number,
    startNodeIn: number,
    totalNodesIn: number,
    widthFactor: number,
  ): void {
    const centerX = targetChunkX * CHUNK_SIZE_X + 8;
    const centerZ = targetChunkZ * CHUNK_SIZE_Z + 8;

    // Position: double precision throughout, matching source's d/d1/d2.
    let x = startX;
    let y = startY;
    let z = startZ;

    // Angular state + radius: float32 precision throughout, matching
    // source's f/f1/f2/f3/f4.
    const radius = Math.fround(radiusIn);
    let yaw = Math.fround(startYaw);
    let pitch = Math.fround(startPitch);
    let yawDrift = 0;
    let pitchDrift = 0;

    // Every call — including recursive branch calls — seeds a brand-new
    // local Random from the shared per-source-chunk stream, matching
    // the source's `Random random = new Random(b.nextLong())`.
    const random = new JavaRandom(sharedRandom.nextLong());

    let totalNodes = totalNodesIn;
    if (totalNodes <= 0) {
      const maxLength = CAVE_SOURCE_RADIUS * 16 - 16;
      totalNodes = maxLength - random.nextInt(Math.trunc(maxLength / 4));
    }

    let startNode = startNodeIn;
    let isRoom = false;
    if (startNode === -1) {
      startNode = Math.trunc(totalNodes / 2);
      isRoom = true;
    }

    const branchNode = random.nextInt(Math.trunc(totalNodes / 2)) + Math.trunc(totalNodes / 4);
    const slowSteering = random.nextInt(6) === 0;

    for (let node = startNode; node < totalNodes; node++) {
      // d6 = 1.5D + (double)(MathHelper.a(((float)k * 3.141593F) / (float)l) * f * 1.0F)
      const angle = fdiv(fmul(node, BETA_PI), totalNodes);
      const sinAngleTimesRadius = fmul(fmul(betaSin(angle), radius), 1.0);
      const horizontalRadius = 1.5 + sinAngleTimesRadius; // widen float->double, then double add
      const verticalRadius = horizontalRadius * widthFactor; // d6 * d3, both double

      // f5 = cos(pitch), f6 = sin(pitch) — computed BEFORE pitch/yaw are
      // updated later this iteration, using their current values.
      const cosPitch = betaCos(pitch);
      const sinPitch = betaSin(pitch);

      // d += MathHelper.b(f1) * f5;  (float*float, widened to double, then double add)
      x += fmul(betaCos(yaw), cosPitch);
      // d1 += f6;  (float widened to double, then double add)
      y += sinPitch;
      // d2 += MathHelper.a(f1) * f5;
      z += fmul(betaSin(yaw), cosPitch);

      pitch = slowSteering ? fmul(pitch, 0.92) : fmul(pitch, 0.7);
      pitch = fadd(pitch, fmul(pitchDrift, 0.1));
      yaw = fadd(yaw, fmul(yawDrift, 0.1));
      pitchDrift = fmul(pitchDrift, 0.9);
      yawDrift = fmul(yawDrift, 0.75);

      // f4 += (random.nextFloat() - random.nextFloat()) * random.nextFloat() * 2.0F;
      // Evaluation order matches Java's left-to-right operand evaluation:
      // first draw (minuend), second draw (subtrahend), third draw
      // (multiplicand).
      {
        const a = random.nextFloat();
        const b = random.nextFloat();
        const c = random.nextFloat();
        const term = fmul(fmul(fsub(a, b), c), 2.0);
        pitchDrift = fadd(pitchDrift, term);
      }
      // f3 += (random.nextFloat() - random.nextFloat()) * random.nextFloat() * 4F;
      {
        const a = random.nextFloat();
        const b = random.nextFloat();
        const c = random.nextFloat();
        const term = fmul(fmul(fsub(a, b), c), 4.0);
        yawDrift = fadd(yawDrift, term);
      }

      if (!isRoom && node === branchNode && radius > 1.0) {
        // Branch into two child tunnels continuing from the current
        // position/node, then stop this tunnel (source `return`s
        // immediately after spawning both branches). Each branch call
        // draws its own radius from a fresh nextFloat() (in order: left
        // branch's draw happens before the right branch's call).
        const leftRadius = fadd(fmul(random.nextFloat(), 0.5), 0.5);
        this.walkTunnel(
          sharedRandom,
          targetChunkX,
          targetChunkZ,
          blocks,
          x,
          y,
          z,
          leftRadius,
          fsub(yaw, BETA_HALF_PI),
          fdiv(pitch, 3.0),
          node,
          totalNodes,
          1.0,
        );
        const rightRadius = fadd(fmul(random.nextFloat(), 0.5), 0.5);
        this.walkTunnel(
          sharedRandom,
          targetChunkX,
          targetChunkZ,
          blocks,
          x,
          y,
          z,
          rightRadius,
          fadd(yaw, BETA_HALF_PI),
          fdiv(pitch, 3.0),
          node,
          totalNodes,
          1.0,
        );
        return;
      }

      if (!isRoom && random.nextInt(4) === 0) {
        // Cursor still advanced this step; simply skip carving+bounds work.
        continue;
      }

      const dx = x - centerX;
      const dz = z - centerZ;
      const remaining = totalNodes - node;
      // Source: `double d11 = f + 2.0F + 16F;` — f/2.0F/16F are all
      // float, so the whole sum is float arithmetic before widening to
      // double for storage; matched here via fadd rather than native
      // JS double addition (which could round differently).
      const abortRadius = fadd(fadd(radius, 2.0), 16.0);

      if (dx * dx + dz * dz - remaining * remaining > abortRadius * abortRadius) {
        return;
      }

      if (
        x < centerX - 16.0 - horizontalRadius * 2.0 ||
        z < centerZ - 16.0 - horizontalRadius * 2.0 ||
        x > centerX + 16.0 + horizontalRadius * 2.0 ||
        z > centerZ + 16.0 + horizontalRadius * 2.0
      ) {
        continue;
      }

      let minX = Math.floor(x - horizontalRadius) - targetChunkX * CHUNK_SIZE_X - 1;
      let maxX = Math.floor(x + horizontalRadius) - targetChunkX * CHUNK_SIZE_X + 1;
      let minY = Math.floor(y - verticalRadius) - 1;
      let maxY = Math.floor(y + verticalRadius) + 1;
      let minZ = Math.floor(z - horizontalRadius) - targetChunkZ * CHUNK_SIZE_Z - 1;
      let maxZ = Math.floor(z + horizontalRadius) - targetChunkZ * CHUNK_SIZE_Z + 1;

      if (minX < LOCAL_XZ_MIN) minX = LOCAL_XZ_MIN;
      if (maxX > LOCAL_XZ_MAX) maxX = LOCAL_XZ_MAX;
      if (minY < CARVE_Y_MIN) minY = CARVE_Y_MIN;
      if (maxY > CARVE_Y_MAX) maxY = CARVE_Y_MAX;
      if (minZ < LOCAL_XZ_MIN) minZ = LOCAL_XZ_MIN;
      if (maxZ > LOCAL_XZ_MAX) maxZ = LOCAL_XZ_MAX;

      if (this.scanForWater(blocks, minX, maxX, minY, maxY, minZ, maxZ)) {
        continue;
      }

      this.carveEllipsoid(
        blocks,
        minX,
        maxX,
        minY,
        maxY,
        minZ,
        maxZ,
        x,
        y,
        z,
        horizontalRadius,
        verticalRadius,
        targetChunkX,
        targetChunkZ,
      );

      if (isRoom) {
        break;
      }
    }
  }

  /**
   * Faithful port of the water-abort perimeter scan. `minX/maxX/minZ/maxZ`
   * are already target-chunk-local (see walkTunnel); this scans the
   * bounding box's outer shell (source's "skip straight to the bottom
   * once past the edge" perimeter-only optimisation) for flowing or
   * stationary water, aborting the whole carve step if any is found.
   */
  private scanForWater(
    blocks: Uint8Array,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
  ): boolean {
    for (let lx = minX; lx < maxX; lx++) {
      for (let lz = minZ; lz < maxZ; lz++) {
        for (let ly = maxY + 1; ly >= minY - 1; ly--) {
          if (ly < 0 || ly >= CHUNK_SIZE_Y) {
            continue;
          }

          const index = blockIndex(lx, ly, lz);

          if (isWaterBlock(blocks[index]!)) {
            return true;
          }

          if (ly !== minY - 1 && lx !== minX && lx !== maxX - 1 && lz !== minZ && lz !== maxZ - 1) {
            ly = minY;
          }
        }
      }
    }

    return false;
  }

  /**
   * Faithful port of the ellipsoid carve loop.
   *
   * Important verified quirk, preserved exactly (confirmed identically
   * in both mc-dev and Project-Poseidon's decompilations, not a
   * transcription error): the source's vertical loop variable used for
   * the ellipsoid distance test (`l4`, ranging `maxY-1` down to `minY`)
   * is offset by -1 from the array index actually read/written (`k4`,
   * ranging `maxY` down to `minY+1`) — i.e. the vertical shape test
   * computed at logical height `h` is applied to the block one Y level
   * ABOVE `h`, not at `h` itself. This shifts the carved ellipsoid
   * vertically by one block relative to its mathematically "centered"
   * shape. Per this stage's "do not invent simplified cave shapes"
   * requirement, this quirk is intentionally kept rather than
   * "corrected" to a symmetric ellipsoid, since real Beta 1.7.3 (and
   * every faithful decompilation of it) generates caves with this exact
   * shape.
   */
  private carveEllipsoid(
    blocks: Uint8Array,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    centerWorldX: number,
    centerWorldY: number,
    centerWorldZ: number,
    horizontalRadius: number,
    verticalRadius: number,
    targetChunkX: number,
    targetChunkZ: number,
  ): void {
    for (let lx = minX; lx < maxX; lx++) {
      const worldX = lx + targetChunkX * CHUNK_SIZE_X;
      const nx = (worldX + 0.5 - centerWorldX) / horizontalRadius;

      for (let lz = minZ; lz < maxZ; lz++) {
        const worldZ = lz + targetChunkZ * CHUNK_SIZE_Z;
        const nz = (worldZ + 0.5 - centerWorldZ) / horizontalRadius;

        let grassAboveRemoved = false;

        // arrayY is the block height actually read/written (source's
        // `k4`); the distance test below deliberately uses `arrayY - 1`
        // (source's `l4`) — see the verified off-by-one documented above.
        for (let arrayY = maxY; arrayY >= minY + 1; arrayY--) {
          const testY = arrayY - 1;
          const ny = (testY + 0.5 - centerWorldY) / verticalRadius;

          if (ny <= -0.7 || nx * nx + ny * ny + nz * nz >= 1.0) {
            continue;
          }

          const index = blockIndex(lx, arrayY, lz);
          const existing = blocks[index]!;

          if (existing === BlockIds.Grass) {
            grassAboveRemoved = true;
          }

          if (isCarveableBlock(existing)) {
            if (testY < LAVA_LEVEL) {
              blocks[index] = BlockIds.Lava;
            } else {
              blocks[index] = 0; // Air

              // Source's `abyte0[k4-1]`: one Y level below the block
              // just carved, i.e. exactly `testY` (= arrayY - 1).
              if (grassAboveRemoved && testY >= 0) {
                const belowIndex = blockIndex(lx, testY, lz);
                if (blocks[belowIndex] === BlockIds.Dirt) {
                  blocks[belowIndex] = BlockIds.Grass;
                }
              }
            }
          }
        }
      }
    }
  }
}
