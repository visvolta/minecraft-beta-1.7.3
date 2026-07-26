/**
 * Shared block shapes: the single source of truth for the non-cube bounds
 * used by collision, raycasting, selection and interaction.
 *
 * Before this module each system decided a block's shape for itself, so a
 * door could be a thin panel visually while still colliding as a full cube.
 * Shapes are declared here once, in Beta's own coordinates, and every
 * consumer reads them through `BlockBehaviour.getBoundingBoxes`.
 *
 * Rendering is deliberately NOT required to be expressible as these boxes:
 * tilted torches, stairs, fences and doors keep dedicated mesh geometry. The
 * contract is semantic agreement — what you can see, select and walk into
 * describe the same object — not identical primitives.
 *
 * All values are unit-cube local (0..1) and are transcribed from the
 * decompiled Beta 1.7.3 sources; each group cites its origin.
 */

/** Local-space axis-aligned box, in unit-cube coordinates. */
export interface LocalBox {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

function box(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): LocalBox {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export const FULL_CUBE: LocalBox = box(0, 0, 0, 1, 1, 1);

// ---------------------------------------------------------------- doors
//
// Beta `BlockDoor.setDoorRotation`: thickness 0.1875, and the occupied edge is
// chosen by a 0..3 state derived from facing plus the open flag.

const DOOR_THICKNESS = 0.1875;

/**
 * Beta door state 0..3 -> occupied slab of the cell, from
 * `BlockDoor.setDoorRotation`.
 */
const DOOR_BOXES: readonly LocalBox[] = [
  box(0, 0, 0, 1, 1, DOOR_THICKNESS),                 // 0: -Z edge
  box(1 - DOOR_THICKNESS, 0, 0, 1, 1, 1),             // 1: +X edge
  box(0, 0, 1 - DOOR_THICKNESS, 1, 1, 1),             // 2: +Z edge
  box(0, 0, 0, DOOR_THICKNESS, 1, 1),                 // 3: -X edge
];

/**
 * Beta `BlockDoor.getState`, verbatim:
 *
 *     (meta & 4) == 0 ? (meta - 1) & 3 : meta & 3
 *
 * A closed door sits one quarter-turn *behind* its facing value, and opening
 * it snaps the panel to the raw facing. Deriving this the intuitive way
 * (facing, then rotate when open) is wrong for every one of the eight
 * states — it was the cause of doors blocking movement while open and of
 * their selection outline sitting on the wrong edge.
 *
 * Metadata layout: bits 0-1 facing, bit 2 (4) open, bit 3 (8) upper half.
 */
export function doorStateFromMetadata(metadata: number): number {
  return (metadata & 4) === 0 ? (metadata - 1) & 3 : metadata & 3;
}

/** Beta `BlockDoor.isOpen`. */
export function isDoorOpen(metadata: number): boolean {
  return (metadata & 4) !== 0;
}

/** Beta door metadata bit 8 marks the upper half. */
export function isDoorUpper(metadata: number): boolean {
  return (metadata & 8) !== 0;
}

export function doorShape(metadata: number): LocalBox {
  return DOOR_BOXES[doorStateFromMetadata(metadata)] ?? FULL_CUBE;
}

// --------------------------------------------------------------- torches
//
// Beta `BlockTorch.setBlockBoundsBasedOnState` with var8 = 0.15 for wall
// torches and 0.1 for a standing torch.

const WALL_TORCH_HALF = 0.15;
const STANDING_TORCH_HALF = 0.1;

/**
 * Torch metadata: 1..4 are wall mounts (east/west/south/north wall), 5 (and
 * 0 as a legacy fallback) is floor-standing.
 */
export function torchShape(metadata: number): LocalBox {
  const h = WALL_TORCH_HALF;
  switch (metadata) {
    case 1: return box(0, 0.2, 0.5 - h, h * 2, 0.8, 0.5 + h);
    case 2: return box(1 - h * 2, 0.2, 0.5 - h, 1, 0.8, 0.5 + h);
    case 3: return box(0.5 - h, 0.2, 0, 0.5 + h, 0.8, h * 2);
    case 4: return box(0.5 - h, 0.2, 1 - h * 2, 0.5 + h, 0.8, 1);
    default: {
      const s = STANDING_TORCH_HALF;
      return box(0.5 - s, 0, 0.5 - s, 0.5 + s, 0.6, 0.5 + s);
    }
  }
}

// ---------------------------------------------------------------- stairs
//
// Beta `BlockStairs.addCollidingBlockToList` contributes two boxes: a
// half-height base over the whole cell plus a half-cell full-height step on
// the side opposite the facing.

/**
 * Beta `BlockStairs.onBlockPlacedBy` facing, from the player's yaw:
 *
 *     q = floor(yaw * 4 / 360 + 0.5) & 3
 *     q -> metadata: 0->2, 1->1, 2->3, 3->0
 *
 * Yaw is in degrees. Without this the block was always placed with metadata 0,
 * so every stair faced the same way regardless of the player.
 */
export function stairFacingFromYaw(yawDegrees: number): number {
  const quadrant = Math.floor(yawDegrees * 4 / 360 + 0.5) & 3;
  switch (quadrant) {
    case 0: return 2;
    case 1: return 1;
    case 2: return 3;
    default: return 0;
  }
}

/**
 * Beta `BlockStairs.getCollidingBoundingBoxes`, verbatim.
 *
 * Beta contributes two **non-overlapping** boxes: a half-height half-cell on
 * the low side and a full-height half-cell on the high side. The previous
 * version used a full-width half-height base plus a raised step, which
 * overlapped and produced a lip the player caught on when walking up.
 *
 * Metadata 0 = ascending +X, 1 = ascending -X, 2 = ascending +Z, 3 = -Z.
 */
export function stairShapes(metadata: number): readonly LocalBox[] {
  switch (metadata & 3) {
    case 0: return [box(0, 0, 0, 0.5, 0.5, 1), box(0.5, 0, 0, 1, 1, 1)];
    case 1: return [box(0, 0, 0, 0.5, 1, 1), box(0.5, 0, 0, 1, 0.5, 1)];
    case 2: return [box(0, 0, 0, 1, 0.5, 0.5), box(0, 0, 0.5, 1, 1, 1)];
    default: return [box(0, 0, 0, 1, 1, 0.5), box(0, 0, 0.5, 1, 0.5, 1)];
  }
}

// ----------------------------------------------------------------- slabs

/**
 * Beta `BlockStep`: a half-height slab occupying the bottom of the cell.
 *
 * Beta 1.7.3 has no upper-half slab — top placement arrived in a later
 * version, and its metadata only selects the material (0 stone, 1 sandstone,
 * 2 wood, 3 cobblestone). Bit 8 is still honoured defensively so that if a
 * save ever carries it the geometry, collision and selection agree rather
 * than silently disagreeing; nothing in this project sets it.
 */
export function slabShape(metadata: number): LocalBox {
  return (metadata & 8) !== 0 ? box(0, 0.5, 0, 1, 1, 1) : box(0, 0, 0, 1, 0.5, 1);
}

// ---------------------------------------------------------------- fences
//
// Beta `BlockFence` renders a 4-wide post with rails toward connected
// neighbours, but its *collision* box is the full cell footprint raised to
// 1.5 blocks so players cannot jump it. Selection uses the visual post.

export const FENCE_COLLISION_HEIGHT = 1.5;

export function fenceCollisionShape(): LocalBox {
  return box(0, 0, 0, 1, FENCE_COLLISION_HEIGHT, 1);
}

const FENCE_POST_MIN = 0.375;
const FENCE_POST_MAX = 0.625;

/**
 * Visual/selection shape: the centre post plus a rail box toward each
 * connected neighbour.
 */
export function fenceSelectionShapes(connections: FenceConnections): readonly LocalBox[] {
  const shapes: LocalBox[] = [box(FENCE_POST_MIN, 0, FENCE_POST_MIN, FENCE_POST_MAX, 1, FENCE_POST_MAX)];
  if (connections.negX) shapes.push(box(0, 0.375, FENCE_POST_MIN, FENCE_POST_MIN, 0.9375, FENCE_POST_MAX));
  if (connections.posX) shapes.push(box(FENCE_POST_MAX, 0.375, FENCE_POST_MIN, 1, 0.9375, FENCE_POST_MAX));
  if (connections.negZ) shapes.push(box(FENCE_POST_MIN, 0.375, 0, FENCE_POST_MAX, 0.9375, FENCE_POST_MIN));
  if (connections.posZ) shapes.push(box(FENCE_POST_MIN, 0.375, FENCE_POST_MAX, FENCE_POST_MAX, 0.9375, 1));
  return shapes;
}

export interface FenceConnections {
  readonly negX: boolean;
  readonly posX: boolean;
  readonly negZ: boolean;
  readonly posZ: boolean;
}

// ----------------------------------------------------------------- chest
//
// Beta `BlockChest` uses a 1/16 inset on all horizontal sides and stops just
// below the cell top.

export function chestShape(): LocalBox {
  return box(0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375);
}

// ----------------------------------------------------------------- cactus

/** Beta `BlockCactus`: 1/16 inset horizontally, full height. */
export function cactusShape(): LocalBox {
  return box(0.0625, 0, 0.0625, 0.9375, 1, 0.9375);
}

// ------------------------------------------------------------------ snow

/** Beta `BlockSnow`: a thin layer whose height grows with metadata. */
export function snowLayerShape(metadata: number): LocalBox {
  const layers = (metadata & 7) + 1;
  return box(0, 0, 0, 1, layers / 8, 1);
}

// -------------------------------------------------------------- trapdoor

const TRAPDOOR_THICKNESS = 0.1875;

/**
 * Beta `BlockTrapDoor`: a thin lid on the floor when shut, or a panel against
 * the hinge wall when open. Metadata bits 0-1 select the hinge side, bit 2 is
 * the open flag.
 */
export function trapdoorShape(metadata: number): LocalBox {
  const open = (metadata & 4) !== 0;
  if (!open) return box(0, 0, 0, 1, TRAPDOOR_THICKNESS, 1);
  switch (metadata & 3) {
    case 0: return box(0, 0, 1 - TRAPDOOR_THICKNESS, 1, 1, 1);
    case 1: return box(0, 0, 0, 1, 1, TRAPDOOR_THICKNESS);
    case 2: return box(1 - TRAPDOOR_THICKNESS, 0, 0, 1, 1, 1);
    default: return box(0, 0, 0, TRAPDOOR_THICKNESS, 1, 1);
  }
}

// ---------------------------------------------------- buttons and levers

/** Beta `BlockButton`: a small pad on the wall face given by metadata 1..4. */
export function buttonShape(metadata: number): LocalBox {
  const pressed = (metadata & 8) !== 0;
  const depth = pressed ? 0.0625 : 0.125;
  switch (metadata & 7) {
    case 1: return box(0, 0.375, 0.3125, depth, 0.625, 0.6875);
    case 2: return box(1 - depth, 0.375, 0.3125, 1, 0.625, 0.6875);
    case 3: return box(0.3125, 0.375, 0, 0.6875, 0.625, depth);
    case 4: return box(0.3125, 0.375, 1 - depth, 0.6875, 0.625, 1);
    default: return box(0.3125, 0, 0.375, 0.6875, 0.125, 0.625);
  }
}

/** Beta `BlockLever`: a small body on the wall or floor. */
export function leverShape(metadata: number): LocalBox {
  const d = 0.1875;
  switch (metadata & 7) {
    case 1: return box(0, 0.2, 0.5 - d, d * 2, 0.8, 0.5 + d);
    case 2: return box(1 - d * 2, 0.2, 0.5 - d, 1, 0.8, 0.5 + d);
    case 3: return box(0.5 - d, 0.2, 0, 0.5 + d, 0.8, d * 2);
    case 4: return box(0.5 - d, 0.2, 1 - d * 2, 0.5 + d, 0.8, 1);
    default: return box(0.25, 0, 0.25, 0.75, 0.6, 0.75);
  }
}

// ------------------------------------------------------------------- bed
//
// Beta `BlockBed`: 9/16 tall over the full cell footprint, for both halves.

export const BED_HEIGHT = 0.5625;

export function bedShape(): LocalBox {
  return box(0, 0, 0, 1, BED_HEIGHT, 1);
}

/**
 * Beta `BlockBed.headBlockToFootBlockMap`: metadata bits 0-1 give the
 * direction from the foot toward the head.
 */
export const BED_FOOT_TO_HEAD: readonly (readonly [number, number])[] = [
  [0, 1], [-1, 0], [0, -1], [1, 0],
];

/** Beta bed metadata bit 8 marks the head half. */
export function isBedHead(metadata: number): boolean {
  return (metadata & 8) !== 0;
}

/** Direction offset from this bed block toward its partner half. */
export function bedPartnerOffset(metadata: number): readonly [number, number] {
  const direction = BED_FOOT_TO_HEAD[metadata & 3] ?? [0, 1];
  // The head looks back toward the foot.
  return isBedHead(metadata) ? [-direction[0], -direction[1]] : direction;
}

// ------------------------------------------------------------- soul sand
//
// Beta `BlockSoulSand` sets its bounds 1/8 short so entities sink slightly.

export const SOUL_SAND_HEIGHT = 1 - 0.125;

export function soulSandShape(): LocalBox {
  return box(0, 0, 0, 1, SOUL_SAND_HEIGHT, 1);
}
