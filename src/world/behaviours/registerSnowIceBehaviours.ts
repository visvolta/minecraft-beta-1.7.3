/**
 * Registers snow and ice block behaviours.
 * Follows the same pattern as registerFluidBehaviours() and registerFireBehaviour().
 */

import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { registerSnowBehaviour } from './SnowBehaviour';
import { registerIceBehaviour } from './IceBehaviour';

export function registerSnowIceBehaviours(registry: BlockBehaviourRegistry): void {
  registerSnowBehaviour(registry);
  registerIceBehaviour(registry);
}
