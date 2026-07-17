/**
 * F2 developer block test grid.
 *
 * Places every registered non-air block in a deterministic horizontal grid
 * near the player. Automatically includes new blocks added to the registry.
 * Rebuilding on repeat F2 presses clears the previous grid.
 *
 * All placement uses the existing BlockUpdateWorld mutation gateway so
 * lighting, neighbour notifications, metadata, and mesh rebuilds work
 * correctly.
 */

import type { BlockId } from '../blocks/BlockId';
import { BlockIds } from '../blocks/BlockId';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';

/** Block IDs excluded from the test grid (internal/debug, or Air). */
const EXCLUDED_IDS = new Set<number>([
  BlockIds.Air,
  // Fire is included — it gets special support below.
]);

/** Metadata to use for blocks that need specific states. */
const SPECIAL_METADATA = new Map<BlockId, number>();

interface GridCell {
  readonly blockId: BlockId;
  readonly blockName: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly row: number;
  readonly col: number;
}

interface TestGridState {
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellSpacing: number;
  readonly cells: readonly GridCell[];
}

/** Excluded block IDs that are not meant to appear in-world. */
const INTERNAL_IDS = new Set<number>([
  // Podzol (254), SpruceLog (252), SpruceLeaves (253) are temporary
  // project-internal IDs. Include them in the grid for inspection.
]);

export class BlockTestGrid {
  private currentGrid: TestGridState | null = null;

  public constructor(
    private readonly blockRegistry: BlockRegistry,
    private readonly world: BlockUpdateWorld,
  ) {}

  /**
   * Generates (or rebuilds) the test grid at the player's position.
   * Called on F2 press (edge-triggered).
   */
  public generate(playerX: number, playerZ: number): void {
    // 1. Clear previous grid if it exists
    if (this.currentGrid !== null) {
      this.clearGrid(this.currentGrid);
    }

    // 2. Collect eligible blocks sorted by ID
    const blocks = this.collectEligibleBlocks();
    if (blocks.length === 0) return;

    // 3. Compute layout
    const columns = Math.max(1, Math.ceil(Math.sqrt(blocks.length)));
    const cellSpacing = 4; // 3 blocks between cells, 1 for the block itself
    const originX = Math.floor(playerX) + 2;
    const originZ = Math.floor(playerZ) + 2;

    // Place grid at a fixed Y above the player's feet, on top of a foundation
    const gridY = 64; // Fixed Y for consistency

    const cells: GridCell[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const def = blocks[i]!;
      const col = i % columns;
      const row = Math.floor(i / columns);
      const wx = originX + col * cellSpacing;
      const wz = originZ + row * cellSpacing;
      cells.push({
        blockId: def.id,
        blockName: def.name,
        worldX: wx,
        worldY: gridY,
        worldZ: wz,
        row,
        col,
      });
    }

    const rows = Math.ceil(blocks.length / columns);

    this.currentGrid = {
      originX,
      originY: gridY,
      originZ,
      columns,
      rows,
      cellSpacing,
      cells,
    };

    // 4. Place blocks
    this.placeGrid(this.currentGrid);
  }

  /**
   * Returns debug info about the current test grid.
   */
  public getInfo(): {
    blockId: BlockId;
    blockName: string;
    worldX: number;
    worldY: number;
    worldZ: number;
    row: number;
    col: number;
  }[] {
    if (this.currentGrid === null) return [];
    return this.currentGrid.cells.map((c) => ({
      blockId: c.blockId,
      blockName: c.blockName,
      worldX: c.worldX,
      worldY: c.worldY,
      worldZ: c.worldZ,
      row: c.row,
      col: c.col,
    }));
  }

  /**
   * Returns the current grid state for debug inspection.
   */
  public getGridState(): TestGridState | null {
    return this.currentGrid;
  }

  // ── Private ────────────────────────────────────────────────────────────

  private collectEligibleBlocks(): { id: BlockId; name: string }[] {
    const result: { id: BlockId; name: string }[] = [];
    for (const def of this.blockRegistry.values()) {
      if (EXCLUDED_IDS.has(def.id)) continue;
      if (INTERNAL_IDS.has(def.id)) continue;
      result.push({ id: def.id, name: def.name });
    }
    result.sort((a, b) => a.id - b.id);
    return result;
  }

  private placeGrid(grid: TestGridState): void {
    for (const cell of grid.cells) {
      this.placeCell(cell);
    }
  }

  private placeCell(cell: GridCell): void {
    const { worldX: x, worldY: y, worldZ: z, blockId } = cell;

    // Foundation: solid stone below the test block
    this.world.setBlock(x, y - 1, z, BlockIds.Stone, {
      reason: 'world',
      notifyNeighbours: false,
      updateLighting: true,
    });

    // Special support for specific block types
    this.setupSpecialSupport(x, y, z, blockId);

    // Place the test block
    const metadata = SPECIAL_METADATA.get(blockId) ?? 0;
    this.world.setBlock(x, y, z, blockId, {
      metadata,
      reason: 'world',
      notifyNeighbours: true,
      updateLighting: true,
    });
  }

  /**
   * Sets up special support blocks for blocks that need them.
   * Uses block definitions and IDs rather than a hard-coded switch.
   */
  private setupSpecialSupport(x: number, y: number, z: number, blockId: BlockId): void {
    const def = this.blockRegistry.getById(blockId);
    if (def === undefined) return;

    // Fire: needs netherrack below (infinite fire support)
    if (blockId === BlockIds.Fire) {
      this.world.setBlock(x, y - 1, z, BlockIds.Netherrack, {
        reason: 'world',
        notifyNeighbours: false,
        updateLighting: false,
      });
      return;
    }

    // Cactus: needs sand below and clear horizontal neighbours
    if (blockId === BlockIds.Cactus) {
      this.world.setBlock(x, y - 1, z, BlockIds.Sand, {
        reason: 'world',
        notifyNeighbours: false,
        updateLighting: false,
      });
      // Clear horizontal neighbours (cactus needs air beside it)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        this.world.setBlock(x + dx, y, z + dz, BlockIds.Air, {
          reason: 'world',
          notifyNeighbours: false,
          updateLighting: false,
        });
      }
      return;
    }

    // Reed: needs dirt/grass below and adjacent water
    if (blockId === BlockIds.Reed) {
      this.world.setBlock(x, y - 1, z, BlockIds.Dirt, {
        reason: 'world',
        notifyNeighbours: false,
        updateLighting: false,
      });
      // Place water adjacent for reed support
      this.world.setBlock(x + 1, y - 1, z, BlockIds.WaterStill, {
        reason: 'world',
        notifyNeighbours: false,
        updateLighting: false,
      });
      // Contain the water with stone
      this.world.setBlock(x + 2, y - 1, z, BlockIds.Stone, {
        reason: 'world',
        notifyNeighbours: false,
        updateLighting: false,
      });
      return;
    }

    // Crops: need farmland below
    if (blockId === BlockIds.Crops) {
      this.world.setBlock(x, y - 1, z, BlockIds.Farmland, {
        reason: 'world',
        notifyNeighbours: false,
        updateLighting: false,
      });
      return;
    }

    // Saplings and plants: use dirt/grass foundation (already stone above)
    if (def.renderType === 'cross' && !def.solid) {
      // Cross-type non-solid blocks (flowers, grass, mushrooms, saplings)
      // Stone foundation is fine for most; saplings need soil
      if (blockId === BlockIds.Sapling || blockId === BlockIds.TallGrass || blockId === BlockIds.DeadBush) {
        this.world.setBlock(x, y - 1, z, BlockIds.Grass, {
          reason: 'world',
          notifyNeighbours: false,
          updateLighting: false,
        });
      }
      return;
    }

    // Fluids: contain them with stone walls
    if (def.isLiquid) {
      this.world.setBlock(x, y - 1, z, BlockIds.Stone, {
        reason: 'world',
        notifyNeighbours: false,
        updateLighting: false,
      });
      // Stone walls around the fluid to prevent spreading
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        this.world.setBlock(x + dx, y, z + dz, BlockIds.Stone, {
          reason: 'world',
          notifyNeighbours: false,
          updateLighting: false,
        });
      }
      return;
    }

    // Falling blocks (sand, gravel): they have stone below which is fine,
    // but they'll start falling once scheduled. Place them and accept that
    // they may fall — this is expected Beta behaviour. The stone foundation
    // gives them a landing spot.
    // No special handling needed — stone below is already placed.
  }

  private clearGrid(grid: TestGridState): void {
    for (const cell of grid.cells) {
      const { worldX: x, worldY: y, worldZ: z } = cell;

      // Clear the test block and support
      this.world.setBlock(x, y, z, BlockIds.Air, {
        reason: 'world',
        notifyNeighbours: true,
        updateLighting: true,
      });
      this.world.setBlock(x, y - 1, z, BlockIds.Air, {
        reason: 'world',
        notifyNeighbours: false,
        updateLighting: true,
      });

      // Clear special support blocks (neighbours used for containment)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        this.world.setBlock(x + dx, y, z + dz, BlockIds.Air, {
          reason: 'world',
          notifyNeighbours: false,
          updateLighting: true,
        });
        this.world.setBlock(x + dx, y - 1, z + dz, BlockIds.Air, {
          reason: 'world',
          notifyNeighbours: false,
          updateLighting: true,
        });
      }
    }
  }
}
