import type { BlockId } from '../../blocks/BlockId';
import type { EntityManager } from '../../entities/core/EntityManager';
import { FallingBlockEntity } from '../../entities/FallingBlockEntity';

/** Read-only snapshot of a falling block for debug inspection. */
export interface FallingBlockDebugSnapshot {
  readonly id: number;
  readonly blockId: BlockId;
  readonly metadata: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly ageTicks: number;
  readonly ownerChunkX: number;
  readonly ownerChunkZ: number;
}

/**
 * Thin facade for falling-block entities on top of the shared
 * {@link EntityManager}.
 *
 * All storage, ticking, interpolation, chunk streaming, persistence and
 * disposal are handled by the EntityManager and {@link FallingBlockEntity}.
 * This facade only provides the spawn entry point used by the falling-block
 * block behaviour plus the debug metrics the overlay historically read.
 */
export class FallingBlockManager {
  public constructor(private readonly entityManager: EntityManager) {}

  /** Spawns a falling block entity at the given (centre) coordinates. */
  public spawn(blockId: BlockId, metadata: number, x: number, y: number, z: number): void {
    const entity = new FallingBlockEntity(this.entityManager.context, blockId, metadata, x, y, z);
    this.entityManager.add(entity);
  }

  private countActive(): number {
    let count = 0;
    this.entityManager.forEachActive((entity) => {
      if (entity instanceof FallingBlockEntity) {
        count += 1;
      }
    });
    return count;
  }

  public getCount(): number {
    return this.countActive();
  }

  public getMeshCount(): number {
    return this.countActive();
  }

  public getPersistedCount(): number {
    return this.entityManager.parkedCount;
  }

  public getSimulationTick(): number {
    return this.entityManager.currentTick;
  }

  public getInterpolationAlpha(): number {
    // Interpolation is now driven centrally by EntityManager.render(alpha).
    return 0;
  }

  public getDebugEntities(): readonly FallingBlockDebugSnapshot[] {
    const out: FallingBlockDebugSnapshot[] = [];
    this.entityManager.forEachActive((entity) => {
      if (entity instanceof FallingBlockEntity) {
        out.push({
          id: entity.id,
          blockId: entity.blockId,
          metadata: entity.metadata,
          x: entity.position.x,
          y: entity.position.y,
          z: entity.position.z,
          ageTicks: entity.age,
          ownerChunkX: entity.chunkX,
          ownerChunkZ: entity.chunkZ,
        });
      }
    });
    return out;
  }

  public dispose(): void {
    // Entities are disposed by EntityManager.dispose(); nothing owned here.
  }
}
