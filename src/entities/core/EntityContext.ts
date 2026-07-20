import type * as THREE from 'three';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { BlockBehaviourRegistry } from '../../world/BlockBehaviour';
import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import type { ChunkManager } from '../../world/ChunkManager';
import type { TextureAtlas } from '../../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../../assets/ItemTextureAtlas';
import type { JavaRandom } from '../../world/generation/random/JavaRandom';
import type { EntityManager } from './EntityManager';
import type { EntityPhysics } from './EntityPhysics';
import type { EntityParticleSink } from '../particles/EntityParticleSink';

/**
 * Long-lived service context handed to entities and entity factories.
 *
 * This is a read-only view of the shared world systems an entity may need.
 * It deliberately carries no behaviour of its own — entities and dedicated
 * systems (physics, AI, navigation, persistence) consume the pieces they
 * need. Keeping it a plain data holder avoids a god-object while still giving
 * factories a single, stable argument list.
 */
export interface EntityWorldContext {
  readonly blockRegistry: BlockRegistry;
  readonly behaviourRegistry: BlockBehaviourRegistry;
  readonly blockUpdateWorld: BlockUpdateWorld;
  readonly chunkManager: ChunkManager;
  readonly scene: THREE.Scene;
  readonly blockAtlas: TextureAtlas;
  readonly itemAtlas: ItemTextureAtlas;
  /** Shared block-item material (atlas-textured, vertex-coloured). */
  readonly heldBlockMaterial: THREE.Material;
  /** Shared flat-item material (item-atlas textured). */
  readonly itemHeldMaterial: THREE.Material;
  /** The owning manager, used by entities to query/spawn other entities. */
  readonly manager: EntityManager;
  /** Shared collision mover (Beta `Entity.moveEntity`). Entities apply their
   * own gravity/drag, then call `physics.move(this)`. */
  readonly physics: EntityPhysics;
  /** World-owned deterministic RNG for Beta-style random decisions. */
  readonly rng: JavaRandom;
  /** Optional decoupled particle sink for hurt/death effects (headless-safe). */
  readonly particles?: EntityParticleSink | undefined;
}

/**
 * Per-simulation-tick context passed to `Entity.onTick`. The world context is
 * constant across ticks; only `gameTick` advances.
 */
export interface EntityTickContext {
  readonly world: EntityWorldContext;
  /** The authoritative 20 Hz tick count for the whole game. */
  readonly gameTick: number;
}
