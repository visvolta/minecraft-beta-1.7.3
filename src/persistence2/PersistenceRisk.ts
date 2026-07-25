/**
 * Aggregated persistence-risk snapshot used to drive the beforeunload dirty
 * warning (correction 8). The active world session publishes this as an event;
 * the DirtyWarningController subscribes rather than polling unrelated fields.
 */
export interface PersistenceRiskSnapshot {
  /** Dirty or in-flight chunks. */
  dirtyChunks: number;
  /** Active + queued writes on the serialized lane. */
  inFlightWrites: number;
  /** Metadata changed since last saved, or a metadata write in flight. */
  metadataChanged: boolean;
  /** Accepted unload operations not yet settled. */
  pendingUnloads: number;
  /** A final-save (Save-and-Quit) attempt is active. */
  finalSaveActive: boolean;
  /** An unresolved persistence failure that may have left state unsaved. */
  unresolvedFailure: boolean;
  /** Derived: any reason the world could lose data if the page closed now. */
  atRisk: boolean;
}
