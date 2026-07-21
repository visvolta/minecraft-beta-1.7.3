import type { HotbarLayout } from '../inventory/HotbarLayout';
import type { PlayerEquipment } from '../inventory/PlayerEquipment';

export type ArmourIconState = 'empty' | 'half' | 'full';

export function getArmourIconStates(value: number): ArmourIconState[] {
  const points = Math.max(0, Math.min(20, Math.floor(value)));
  return Array.from({ length: 10 }, (_, index) => {
    const units = points - index * 2;
    if (units >= 2) return 'full';
    if (units === 1) return 'half';
    return 'empty';
  });
}

const TEXTURES: Readonly<Record<ArmourIconState, string>> = {
  empty: '/textures/gui/armour_empty.png',
  half: '/textures/gui/armourfill_half.png',
  full: '/textures/gui/armourfill_full.png',
};

/** Ten-position, 20-point armour HUD row above the health row. */
export class ArmourHudRenderer {
  private readonly root = typeof document !== 'undefined'
    ? document.createElement('div')
    : ({} as HTMLDivElement);
  private readonly icons: HTMLImageElement[] = [];

  public constructor(private readonly equipment: PlayerEquipment) {
    if (typeof document === 'undefined') return;
    this.root.id = 'armour-hud';
    this.root.style.cssText = 'position:fixed;pointer-events:none;z-index:120;image-rendering:pixelated';
    for (let i = 0; i < 10; i++) {
      const icon = document.createElement('img');
      icon.draggable = false;
      icon.style.cssText = 'position:absolute;left:0;bottom:0;width:9px;height:auto;max-width:none;image-rendering:pixelated';
      this.root.append(icon);
      this.icons.push(icon);
    }
    document.body.append(this.root);
  }

  public update(layout: HotbarLayout): void {
    if (typeof document === 'undefined') return;
    const value = this.equipment.getArmourValue();
    this.root.hidden = value <= 0;
    if (value <= 0) return;

    const scale = layout.scale;
    const left = Math.floor((innerWidth - 182 * scale) / 2);
    const top = innerHeight - 42 * scale;
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.width = '90px';
    this.root.style.height = '10px';
    this.root.style.transformOrigin = 'top left';
    this.root.style.transform = `scale(${scale})`;

    const states = getArmourIconStates(value);
    for (let i = 0; i < 10; i++) {
      const icon = this.icons[i]!;
      icon.style.left = `${i * 9}px`;
      icon.src = TEXTURES[states[i]!];
    }
  }

  public dispose(): void {
    this.root.remove?.();
  }
}
