import type { BlockId } from '../blocks/BlockId';
import { BlockIds } from '../blocks/BlockId';
import type { BlockUpdateWorld } from './BlockUpdateWorld';

export enum RailShape {
    NORTH_SOUTH = 0,
    EAST_WEST = 1,
    ASCENDING_EAST = 2,
    ASCENDING_WEST = 3,
    ASCENDING_NORTH = 4,
    ASCENDING_SOUTH = 5,
    SOUTH_EAST = 6,
    SOUTH_WEST = 7,
    NORTH_WEST = 8,
    NORTH_EAST = 9
}

/** 
 * Exact MATRIX from Beta 1.7.3 EntityMinecart.
 * Each shape defines two relative block endpoints [dx, dy, dz].
 */
const RAIL_MATRIX: number[][][] = [
    [[0, 0, -1], [0, 0, 1]],     // 0: NS
    [[-1, 0, 0], [1, 0, 0]],     // 1: EW
    [[-1, -1, 0], [1, 0, 0]],    // 2: Ascending East
    [[-1, 0, 0], [1, -1, 0]],    // 3: Ascending West
    [[0, 0, -1], [0, -1, 1]],    // 4: Ascending North
    [[0, -1, -1], [0, 0, 1]],    // 5: Ascending South
    [[0, 0, 1], [1, 0, 0]],      // 6: South-East
    [[0, 0, 1], [-1, 0, 0]],     // 7: South-West
    [[0, 0, -1], [-1, 0, 0]],    // 8: North-West
    [[0, 0, -1], [1, 0, 0]]      // 9: North-East
];

export interface RailInfo {
    readonly shape: RailShape;
    readonly isPowered: boolean;
    readonly isActive: boolean;
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export class RailPhysics {
    public static getRailAt(world: BlockUpdateWorld, x: number, y: number, z: number): RailInfo | null {
        let ix = Math.floor(x);
        let iy = Math.floor(y);
        let iz = Math.floor(z);

        let id = world.getBlock(ix, iy, iz);
        if (!this.isRailBlock(id)) {
            iy--;
            id = world.getBlock(ix, iy, iz);
        }

        if (this.isRailBlock(id)) {
            const meta = world.getBlockMetadata(ix, iy, iz);
            const isPoweredRail = id === BlockIds.PoweredRail;
            return {
                shape: (isPoweredRail ? (meta & 7) : meta) as RailShape,
                isPowered: isPoweredRail,
                isActive: isPoweredRail ? (meta & 8) !== 0 : false,
                x: ix, y: iy, z: iz
            };
        }
        return null;
    }

    private static isRailBlock(id: BlockId): boolean {
        return id === BlockIds.Rail || id === BlockIds.PoweredRail || id === BlockIds.DetectorRail;
    }

    /** 
     * Projects position onto rail centerline and returns the target [x, y, z].
     * Based on Beta 1.7.3 EntityMinecart.getPos().
     */
    public static project(x: number, y: number, z: number, rail: RailInfo): [number, number, number] | null {
        const matrix = RAIL_MATRIX[rail.shape];
        if (!matrix) return null;

        const p0 = matrix[0]!;
        const p1 = matrix[1]!;

        const x0 = rail.x + 0.5 + p0[0] * 0.5;
        const y0 = rail.y + 0.5 + p0[1] * 0.5;
        const z0 = rail.z + 0.5 + p0[2] * 0.5;
        const x1 = rail.x + 0.5 + p1[0] * 0.5;
        const y1 = rail.y + 0.5 + p1[1] * 0.5;
        const z1 = rail.z + 0.5 + p1[2] * 0.5;

        const dx = x1 - x0;
        const dz = z1 - z0;
        const dy = (y1 - y0) * 2.0;

        let t = 0;
        if (dx === 0) {
            t = z - rail.z;
        } else if (dz === 0) {
            t = x - rail.x;
        } else {
            const lux = x - x0;
            const luz = z - z0;
            t = (lux * dx + luz * dz) * 2.0;
        }

        let px = x0 + dx * t;
        let py = y0 + dy * t;
        let pz = z0 + dz * t;

        if (dy < 0) py++;
        if (dy > 0) py += 0.5;

        return [px, py, pz];
    }

    public static getEndpoints(rail: RailInfo): [[number, number, number], [number, number, number]] {
        const m = RAIL_MATRIX[rail.shape]!;
        return [
            [m[0]![0], m[0]![1], m[0]![2]],
            [m[1]![0], m[1]![1], m[1]![2]]
        ];
    }
}
