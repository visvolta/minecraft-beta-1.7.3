import { BlockIds } from '../../../blocks/BlockId';
import { JavaRandom } from '../random/JavaRandom';
import type { TreeWorldAccessor } from './TreeWorldAccessor';

/**
 * Faithful port of Beta 1.7.3's WorldGenBigTree ("Big Oak" tree),
 * verified directly against unmodified mc-dev source and cross-checked
 * against Project-Poseidon's WorldGenBigTree.java (behaviourally
 * identical, only decompiler naming/formatting differs).
 *
 * Critical verified quirk, preserved exactly and disclosed prominently:
 * real Beta's ChunkProviderGenerate constructs exactly ONE WorldGenBigTree
 * instance per chunk decoration pass (when big trees are selected at
 * all) and reuses that SAME instance for every big-tree placement in
 * that chunk's loop. The instance's trunk-height field (`e` in the
 * source, `trunkHeight` here) is lazily initialized only once — the
 * FIRST call (successful or not) permanently fixes it for every
 * subsequent call on that instance, and a later call's own ground/space
 * validation can further shrink (never grow) that same persisted value.
 * This means every big oak generated within one chunk shares the exact
 * same trunk height, and BetaTreeDecorator (the caller) MUST construct
 * one BigTreeGenerator per chunk and reuse it across that chunk's
 * placements — never a fresh instance per tree — to reproduce this
 * faithfully. This is a real, verified Beta behaviour, not a bug.
 *
 * Float precision note: several intermediate values (branch/leaf radii)
 * are Java `float`, narrowed explicitly via `(float)` casts around
 * `Math.sqrt`/`Math.pow` calls in the source; those narrowing points are
 * reproduced here with `Math.fround` at the same points, not computed
 * as one native-precision JS expression, since real Beta's ID-based
 * "can leaves grow to occupy this cell" comparisons are sensitive to
 * exactly where a value is a genuinely different, and this loop runs
 * many iterations per tree.
 */

/** Axis-swap lookup table, matching the source's `static final byte a[] = {2,0,0,1,2,1}`. */
const AXIS_SWAP: readonly number[] = [2, 0, 0, 1, 2, 1];

/**
 * Source's literal `3.1415899999999999D` (i.e. the double-precision
 * decimal literal `3.14159`, NOT full-precision Math.PI) — used only for
 * the branch-angle sample. This small truncation (~0.0000027 rad off
 * from true pi) is real Beta behaviour, preserved exactly rather than
 * "corrected" to Math.PI, per this project's no-simplification stance
 * on faithfully porting the source's literal constants.
 */
const BETA_PI_APPROX = 3.14159;

/** One branch candidate: [tipX, tipY, tipZ, trunkAttachY]. */
type Branch = readonly [number, number, number, number];

function isAirOrLeaves(blockId: number): boolean {
  return blockId === 0 || blockId === BlockIds.Leaves;
}

/** Java's `(int)` cast on a double/float: truncates toward zero (NOT floor). */
function truncToInt(value: number): number {
  return Math.trunc(value);
}

/** MathHelper.b(double): floor, matching Java's `(int)d >= d ? (int)d : (int)d - 1` idiom. */
function floorToInt(value: number): number {
  const i = Math.trunc(value);
  return value >= i ? i : i - 1;
}

export class BigTreeGenerator {
  private world!: TreeWorldAccessor;
  private readonly internalRandom = new JavaRandom(0);

  private baseX = 0;
  private baseY = 0;
  private baseZ = 0;

  /** Beta's `e` — trunk height. Lazily initialized ONCE per instance; see class doc comment. */
  private trunkHeight = 0;
  /** Beta's `f` — central-trunk-top offset, recomputed every call from the (possibly shrunk) trunkHeight. */
  private crownStartOffset = 0;

  // Configuration fields (Beta's g/h/i/j/k/m/n), set by configure().
  // Beta's `l` (the "wide double-trunk" flag) is never actually set to 2
  // anywhere reachable in the source — dead code — and is therefore not
  // ported at all (there is no code path that could exercise it).
  private readonly branchHeightFraction = 0.618; // Beta's `g`
  private readonly branchSlope = 0.381; // Beta's `i`
  private branchDensityFactor = 1.0; // Beta's `j`, set by configure()
  private heightAttenuation = 1.0; // Beta's `k`, set by configure()
  private maxHeightRandomAdd = 12; // Beta's `m`, set by configure()
  private leafClusterHeight = 4; // Beta's `n`, set by configure()

  private branches: Branch[] = [];

  /** Matches WorldGenBigTree's public `a(double,double,double)` configure method. */
  public configure(sizeFactor: number, branchDensityFactor: number, heightAttenuation: number): void {
    this.maxHeightRandomAdd = truncToInt(sizeFactor * 12);
    if (sizeFactor > 0.5) {
      this.leafClusterHeight = 5;
    }
    this.branchDensityFactor = branchDensityFactor;
    this.heightAttenuation = heightAttenuation;
  }

  /**
   * Attempts to generate one Big Oak tree with its trunk base at world
   * (x, y, z). `random` is the caller's shared per-chunk Random (only
   * ONE nextLong() is drawn from it, exactly matching the source);
   * everything else uses this instance's own internal Random, reseeded
   * from that draw.
   */
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    this.world = world;

    const seed = random.nextLong();
    this.internalRandom.setSeed(seed);

    this.baseX = x;
    this.baseY = y;
    this.baseZ = z;

    if (this.trunkHeight === 0) {
      this.trunkHeight = 5 + this.internalRandom.nextInt(this.maxHeightRandomAdd);
    }

    if (!this.validateGroundAndTrunkSpace()) {
      return false;
    }

    this.computeBranches();
    this.placeBranchCanopies();
    this.placeTrunk();
    this.placeBranches();

    return true;
  }

  /** Beta's `e()`: ground + trunk-space validation; can shrink (never grow) trunkHeight. */
  private validateGroundAndTrunkSpace(): boolean {
    const groundBlock = this.world.getBlock(this.baseX, this.baseY - 1, this.baseZ);

    if (groundBlock !== BlockIds.Grass && groundBlock !== BlockIds.Dirt) {
      return false;
    }

    const obstruction = this.findObstructionDistance(
      [this.baseX, this.baseY, this.baseZ],
      [this.baseX, this.baseY + this.trunkHeight - 1, this.baseZ],
    );

    if (obstruction === -1) {
      return true;
    }

    if (obstruction < 6) {
      return false;
    }

    this.trunkHeight = obstruction;
    return true;
  }

  /** Beta's `a()`: discovers branch candidate endpoints via randomized trigonometric sampling. */
  private computeBranches(): void {
    this.crownStartOffset = truncToInt(this.trunkHeight * this.branchHeightFraction);
    if (this.crownStartOffset >= this.trunkHeight) {
      this.crownStartOffset = this.trunkHeight - 1;
    }

    // Source: `(int)(1.382 + Math.pow((k*e)/13, 2))`, clamped to >= 1.
    const branchDensityTerm = (this.heightAttenuation * this.trunkHeight) / 13;
    const branchCountPerLevel = Math.max(1, truncToInt(1.382 + branchDensityTerm ** 2));

    const found: Branch[] = [];
    const centralTop = this.baseY + this.crownStartOffset;

    // The "central" entry (source's `ai[0]`/`o[0]`): this is NOT dead
    // data — it represents the tree's main top crown cluster, sitting
    // directly above the trunk at (baseX, baseY+trunkHeight-leafClusterHeight,
    // baseZ), with its "attach point" at the central trunk-top
    // (centralTop). Both placeBranchCanopies (Beta's b()) and
    // placeBranches (Beta's d()) iterate every entry in `this.branches`
    // uniformly, including this one — placeBranches draws a log line
    // from centralTop up to this cluster's position, effectively
    // extending the visible trunk up through the middle of the main
    // leaf ball, exactly like a real Big Oak's silhouette.
    found.push([this.baseX, this.baseY + (this.trunkHeight - this.leafClusterHeight), this.baseZ, centralTop]);

    let currentY = this.baseY + (this.trunkHeight - this.leafClusterHeight) - 1;
    let levelsRemaining = this.baseY + (this.trunkHeight - this.leafClusterHeight) - this.baseY;

    while (levelsRemaining >= 0) {
      const radius = this.branchRadiusAt(levelsRemaining);

      if (radius < 0) {
        currentY--;
        levelsRemaining--;
        continue;
      }

      for (let branchIndex = 0; branchIndex < branchCountPerLevel; branchIndex++) {
        const distance =
          this.branchDensityFactor * (radius * (this.internalRandom.nextFloat() + 0.328));
        const angle = this.internalRandom.nextFloat() * 2 * BETA_PI_APPROX;

        const tipX = truncToInt(distance * Math.sin(angle) + this.baseX + 0.5);
        const tipZ = truncToInt(distance * Math.cos(angle) + this.baseZ + 0.5);

        const tip: readonly [number, number, number] = [tipX, currentY, tipZ];
        const tipPlusLeafHeight: readonly [number, number, number] = [
          tipX,
          currentY + this.leafClusterHeight,
          tipZ,
        ];

        if (this.findObstructionDistance(tip, tipPlusLeafHeight) !== -1) {
          continue;
        }

        const dx = Math.abs(this.baseX - tipX);
        const dz = Math.abs(this.baseZ - tipZ);
        const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
        const dropFromSlope = horizontalDistance * this.branchSlope;

        let attachY: number;
        if (currentY - dropFromSlope > centralTop) {
          attachY = centralTop;
        } else {
          attachY = truncToInt(currentY - dropFromSlope);
        }

        const attachPoint: readonly [number, number, number] = [this.baseX, attachY, this.baseZ];

        if (this.findObstructionDistance(attachPoint, tip) === -1) {
          found.push([tipX, currentY, tipZ, attachY]);
        }
      }

      currentY--;
      levelsRemaining--;
    }

    this.branches = found;
  }

  /** Beta's private `a(int)`: radius available for a branch to reach outward at a given level. */
  private branchRadiusAt(levelFromTop: number): number {
    if (levelFromTop < this.trunkHeight * 0.3) {
      return -1.618;
    }

    const half = Math.fround(this.trunkHeight / 2.0);
    const offset = Math.fround(half - levelFromTop);

    let radius: number;
    if (offset === 0) {
      radius = half;
    } else if (Math.abs(offset) >= half) {
      radius = 0;
    } else {
      radius = Math.fround(Math.sqrt(Math.abs(half) ** 2 - Math.abs(offset) ** 2));
    }

    return Math.fround(radius * 0.5);
  }

  /** Beta's private `b(int)`: leaf-ring radius at a relative height within a crown cluster. */
  private crownLeafRadiusAt(relativeY: number): number {
    if (relativeY < 0 || relativeY >= this.leafClusterHeight) {
      return -1;
    }

    return relativeY !== 0 && relativeY !== this.leafClusterHeight - 1 ? 3.0 : 2.0;
  }

  /** Beta's `void a(x,y,z,radius,axisSelector,blockId)`: places a horizontal leaf disc stack (a "leaf ball" when called across a Y range). */
  private carveLeafDisc(
    x: number,
    y: number,
    z: number,
    radius: number,
    axisSelector: number,
    blockId: number,
  ): void {
    const intRadius = truncToInt(radius + 0.618);
    const axis1 = AXIS_SWAP[axisSelector]!;
    const axis2 = AXIS_SWAP[axisSelector + 3]!;

    const pos = [x, y, z];
    const cur = [0, 0, 0];
    cur[axisSelector] = pos[axisSelector]!;

    for (let d1 = -intRadius; d1 <= intRadius; d1++) {
      cur[axis1] = pos[axis1]! + d1;

      for (let d2 = -intRadius; d2 <= intRadius; d2++) {
        const dist = Math.sqrt((Math.abs(d1) + 0.5) ** 2 + (Math.abs(d2) + 0.5) ** 2);

        if (dist > radius) {
          continue;
        }

        cur[axis2] = pos[axis2]! + d2;

        const existing = this.world.getBlock(cur[0]!, cur[1]!, cur[2]!);
        if (!isAirOrLeaves(existing)) {
          continue;
        }

        this.world.setBlock(cur[0]!, cur[1]!, cur[2]!, blockId);
      }
    }
  }

  /** Beta's `void a(x,y,z)`: stacks crownLeafRadiusAt-sized leaf discs across one crown cluster's full height. */
  private placeCrownCanopy(x: number, y: number, z: number): void {
    for (let relY = 0; relY < this.leafClusterHeight; relY++) {
      const radius = this.crownLeafRadiusAt(relY);
      this.carveLeafDisc(x, y + relY, z, radius, 1, BlockIds.Leaves);
    }
  }

  /** Beta's `void b()`: places a crown canopy at every discovered branch tip. */
  private placeBranchCanopies(): void {
    for (const branch of this.branches) {
      this.placeCrownCanopy(branch[0], branch[1], branch[2]);
    }
  }

  /** Beta's `boolean c(int)`: whether a branch attached this far up the trunk gets a rendered log. */
  private isHighEnoughForLog(heightAboveBase: number): boolean {
    return heightAboveBase >= this.trunkHeight * 0.2;
  }

  /** Beta's `void c()`: draws the single central trunk log line (the "wide 2-block trunk" dead-code branch is never reachable — see class doc comment). */
  private placeTrunk(): void {
    this.drawLine(
      [this.baseX, this.baseY, this.baseZ],
      [this.baseX, this.baseY + this.crownStartOffset, this.baseZ],
      BlockIds.Log,
    );
  }

  /** Beta's `void d()`: draws a diagonal log line from the trunk to each eligible branch tip. */
  private placeBranches(): void {
    for (const branch of this.branches) {
      const attachY = branch[3];
      const heightAboveBase = attachY - this.baseY;

      if (this.isHighEnoughForLog(heightAboveBase)) {
        this.drawLine(
          [this.baseX, attachY, this.baseZ],
          [branch[0], branch[1], branch[2]],
          BlockIds.Log,
        );
      }
    }
  }

  /**
   * Beta's `void a(int[] from, int[] to, int blockId)`: draws a 3D line
   * of blocks from `from` to `to` (inclusive), stepping along whichever
   * axis has the largest delta, using MathHelper.b (floor(x+0.5)) for
   * the two secondary axes — this is the version that actually PLACES
   * blocks (see findObstructionDistance for the read-only variant using
   * plain truncation instead).
   */
  private drawLine(
    from: readonly [number, number, number],
    to: readonly [number, number, number],
    blockId: number,
  ): void {
    const delta = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    let primaryAxis = 0;

    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(delta[axis]!) > Math.abs(delta[primaryAxis]!)) {
        primaryAxis = axis;
      }
    }

    if (delta[primaryAxis] === 0) {
      return;
    }

    const axis1 = AXIS_SWAP[primaryAxis]!;
    const axis2 = AXIS_SWAP[primaryAxis + 3]!;
    const step = delta[primaryAxis]! > 0 ? 1 : -1;
    const slope1 = delta[axis1]! / delta[primaryAxis]!;
    const slope2 = delta[axis2]! / delta[primaryAxis]!;

    const limit = delta[primaryAxis]! + step;
    const cur = [0, 0, 0];

    for (let step_i = 0; step_i !== limit; step_i += step) {
      cur[primaryAxis] = floorToInt(from[primaryAxis]! + step_i + 0.5);
      cur[axis1] = floorToInt(from[axis1]! + step_i * slope1 + 0.5);
      cur[axis2] = floorToInt(from[axis2]! + step_i * slope2 + 0.5);
      this.world.setBlock(cur[0]!, cur[1]!, cur[2]!, blockId);
    }
  }

  /**
   * Beta's `int a(int[] from, int[] to)`: read-only obstruction scan
   * along the same line `drawLine` would draw, but using plain `(int)`
   * truncation (not MathHelper.b's floor) for the secondary axes, and
   * stopping at the first non-Air/non-Leaves block. Returns -1 if the
   * entire line is clear, or the (absolute) step distance reached
   * before hitting an obstruction.
   */
  private findObstructionDistance(
    from: readonly [number, number, number],
    to: readonly [number, number, number],
  ): number {
    const delta = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    let primaryAxis = 0;

    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(delta[axis]!) > Math.abs(delta[primaryAxis]!)) {
        primaryAxis = axis;
      }
    }

    if (delta[primaryAxis] === 0) {
      return -1;
    }

    const axis1 = AXIS_SWAP[primaryAxis]!;
    const axis2 = AXIS_SWAP[primaryAxis + 3]!;
    const step = delta[primaryAxis]! > 0 ? 1 : -1;
    const slope1 = delta[axis1]! / delta[primaryAxis]!;
    const slope2 = delta[axis2]! / delta[primaryAxis]!;

    const limit = delta[primaryAxis]! + step;
    const cur = [0, 0, 0];
    let stepIndex = 0;

    for (;;) {
      if (stepIndex === limit) {
        break;
      }

      cur[primaryAxis] = from[primaryAxis]! + stepIndex;
      cur[axis1] = truncToInt(from[axis1]! + stepIndex * slope1);
      cur[axis2] = truncToInt(from[axis2]! + stepIndex * slope2);

      const blockId = this.world.getBlock(cur[0]!, cur[1]!, cur[2]!);
      if (!isAirOrLeaves(blockId)) {
        break;
      }

      stepIndex += step;
    }

    return stepIndex === limit ? -1 : Math.abs(stepIndex);
  }
}
