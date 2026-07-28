import type { DigSoundMaterial, StepSoundMaterial } from './BlockSoundMaterial';

export type SemanticSoundEvent =
  | { readonly type: 'ui.click' }
  /**
   * Positional one-shot triggered by a block's own behaviour (door hinge,
   * chest lid). Distinct from `block.place`/`block.break`, which are keyed by
   * dig material rather than by a specific sound.
   */
  | { readonly type: 'block.action'; readonly id: 'door_open' | 'door_close' | 'chestopen' | 'chestclosed' | 'click'; readonly x: number; readonly y: number; readonly z: number; readonly pitch?: number; readonly volume?: number }
  | { readonly type: 'block.break'; readonly material: DigSoundMaterial; readonly x: number; readonly y: number; readonly z: number }
  | { readonly type: 'block.place'; readonly material: DigSoundMaterial; readonly x: number; readonly y: number; readonly z: number }
  | { readonly type: 'block.mine'; readonly material: DigSoundMaterial; readonly x: number; readonly y: number; readonly z: number }
  | { readonly type: 'step'; readonly material: StepSoundMaterial; readonly x: number; readonly y: number; readonly z: number; readonly volume?: number; readonly pitch?: number }
  | { readonly type: 'entity.legacy'; readonly id: string; readonly kind: string; readonly x: number; readonly y: number; readonly z: number; readonly volume: number; readonly pitch: number; readonly attenuationDistance: number }
  | { readonly type: 'player.damage'; readonly kind: 'hurt' | 'fall-small' | 'fall-big'; readonly x: number; readonly y: number; readonly z: number }
  | { readonly type: 'random.explode'; readonly x: number; readonly y: number; readonly z: number }
  | { readonly type: 'random.splash'; readonly x: number; readonly y: number; readonly z: number; readonly volume?: number }
  | { readonly type: 'weather.thunder'; readonly x: number; readonly y: number; readonly z: number; readonly distance: number };
