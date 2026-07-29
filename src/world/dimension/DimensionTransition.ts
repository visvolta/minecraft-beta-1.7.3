import type { DimensionId } from './DimensionId';

/**
 * Phases of an asynchronous dimension transition.
 *
 * The transition must not reveal the destination until the critical area
 * around the player is genuinely renderable, otherwise the player drops into
 * a blank or half-lit world. Equally it must not wait for the full render
 * distance, which would stall for seconds.
 */
export const enum TransitionPhase {
  Idle = 0,
  /** Loading screen shown; source simulation frozen. */
  Preparing = 1,
  /** Destination chunks generating/loading. */
  LoadingDestination = 2,
  /** Destination ready; player placed, about to reveal. */
  Revealing = 3,
}

/** How many chunks around the destination must be ready before revealing. */
export const TRANSITION_CRITICAL_RADIUS = 1;

export interface TransitionTarget {
  readonly dimensionId: DimensionId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TransitionReadiness {
  /** Destination world context has been created/activated. */
  readonly contextReady: boolean;
  /** Chunk holding the destination portal is resident. */
  readonly targetChunkLoaded: boolean;
  /** Critical ring around the target is resident. */
  readonly criticalChunksLoaded: number;
  readonly criticalChunksRequired: number;
  /** Initial lighting has been applied to the target chunk. */
  readonly lightingReady: boolean;
  /** Meshes for the critical area exist (or are queued and uploading). */
  readonly meshesReady: boolean;
  /** A destination portal was located or built. */
  readonly portalReady: boolean;
  /** Player has been positioned at a valid destination. */
  readonly playerPlaced: boolean;
}

/**
 * True only when every readiness condition holds. Deliberately requires the
 * critical ring rather than the whole render distance.
 */
export function isDestinationReady(state: TransitionReadiness): boolean {
  return (
    state.contextReady &&
    state.targetChunkLoaded &&
    state.criticalChunksLoaded >= state.criticalChunksRequired &&
    state.lightingReady &&
    state.meshesReady &&
    state.portalReady &&
    state.playerPlaced
  );
}

/** Number of chunks in the critical ring for a given radius. */
export function criticalChunkCount(radius: number = TRANSITION_CRITICAL_RADIUS): number {
  const side = radius * 2 + 1;
  return side * side;
}

/**
 * Tracks one in-flight dimension transition.
 *
 * A single owner of the phase means input, simulation and rendering can all
 * ask one question ("are we transitioning?") and cannot disagree, and a second
 * portal trigger cannot start while one is running.
 */
export class DimensionTransition {
  private phase: TransitionPhase = TransitionPhase.Idle;
  private target: TransitionTarget | undefined;
  private readiness: TransitionReadiness = emptyReadiness();
  private startedAtMs = 0;

  public isActive(): boolean {
    return this.phase !== TransitionPhase.Idle;
  }

  public getPhase(): TransitionPhase {
    return this.phase;
  }

  public getTarget(): TransitionTarget | undefined {
    return this.target;
  }

  public getReadiness(): TransitionReadiness {
    return this.readiness;
  }

  public getElapsedMs(): number {
    return this.startedAtMs === 0 ? 0 : performance.now() - this.startedAtMs;
  }

  /** Begins a transition. Ignored (returns false) if one is already running. */
  public begin(target: TransitionTarget): boolean {
    if (this.phase !== TransitionPhase.Idle) return false;
    this.phase = TransitionPhase.Preparing;
    this.target = target;
    this.readiness = emptyReadiness();
    this.startedAtMs = performance.now();
    return true;
  }

  public beginLoadingDestination(): void {
    if (this.phase === TransitionPhase.Preparing) this.phase = TransitionPhase.LoadingDestination;
  }

  public updateReadiness(readiness: Partial<TransitionReadiness>): void {
    this.readiness = { ...this.readiness, ...readiness };
    if (this.phase === TransitionPhase.LoadingDestination && isDestinationReady(this.readiness)) {
      this.phase = TransitionPhase.Revealing;
    }
  }

  public isReadyToReveal(): boolean {
    return this.phase === TransitionPhase.Revealing;
  }

  /** Ends the transition and resumes normal gameplay. */
  public complete(): void {
    this.phase = TransitionPhase.Idle;
    this.target = undefined;
    this.startedAtMs = 0;
  }

  /** Aborts on failure so the player is never left frozen behind a screen. */
  public abort(): void {
    this.phase = TransitionPhase.Idle;
    this.target = undefined;
    this.startedAtMs = 0;
  }
}

function emptyReadiness(): TransitionReadiness {
  return {
    contextReady: false,
    targetChunkLoaded: false,
    criticalChunksLoaded: 0,
    criticalChunksRequired: criticalChunkCount(),
    lightingReady: false,
    meshesReady: false,
    portalReady: false,
    playerPlaced: false,
  };
}
