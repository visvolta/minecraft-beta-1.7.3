import { WorldSaveCoordinator, createDefaultMetadata } from './coordinator/WorldSaveCoordinator';
import { IndexedDbWorldStorage } from './storage/IndexedDbWorldStorage';
/** Opens the sole current world before Engine constructs generation-dependent systems. */
export async function openDefaultWorld(): Promise<WorldSaveCoordinator> {
  const storage = await IndexedDbWorldStorage.open();
  return WorldSaveCoordinator.open(storage, createDefaultMetadata());
}
