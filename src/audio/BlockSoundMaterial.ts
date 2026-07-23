export type DigSoundMaterial = 'cloth' | 'grass' | 'gravel' | 'sand' | 'snow' | 'stone' | 'wood' | 'glass';
export type StepSoundMaterial = 'cloth' | 'grass' | 'gravel' | 'ladder' | 'sand' | 'snow' | 'stone' | 'wood';

export interface BlockSoundDefinition {
  readonly dig: DigSoundMaterial;
  readonly step: StepSoundMaterial;
  readonly volume?: number;
  readonly pitch?: number;
}

export const DEFAULT_BLOCK_SOUND: BlockSoundDefinition = { dig: 'stone', step: 'stone', volume: 1, pitch: 1 };

export function stepFromDig(material: DigSoundMaterial): StepSoundMaterial {
  return material === 'glass' ? 'stone' : material;
}
