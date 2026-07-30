import type { HotbarLayout } from '../inventory/HotbarLayout';
import type { Player } from './Player';

/**
 * Beta air (oxygen) bubble bar.
 *
 * Transcribed from `GuiIngame.renderGameOverlay`:
 *
 *   if (player.isInsideOfMaterial(Material.water)) {
 *     full   = ceil((air - 2) * 10 / 300)
 *     popped = ceil(air * 10 / 300) - full
 *     for (i = 0; i < full + popped; i++)
 *       drawTexturedModalRect(width/2 - 91 + i*8, height - 32 - 9,
 *                             i < full ? 16 : 25, 18, 9, 9)
 *   }
 *
 * Notes that matter for fidelity:
 * - The bar is drawn ONLY while the head is inside water; it disappears the
 *   instant the player surfaces, it does not linger or refill visibly.
 * - Maximum is 10 bubbles (`air` 300 → 10). Bubbles are 9×9 and step 8px, so
 *   they overlap by one pixel exactly like hearts.
 * - It sits one row (9px) above the hunger row: `height - 32 - 9`.
 * - `full` uses `air - 2`, so the last full bubble converts to a popped bubble
 *   slightly before the air value would otherwise round down. That single
 *   popped bubble is the "low air" transition — there is no flashing or
 *   colour change in Beta.
 * - Popped bubbles are only ever drawn as the tail of the row; once they pop
 *   they are not re-drawn as empty slots.
 */

/** Beta: 300 ticks of air renders as at most 10 bubbles. */
const MAX_BUBBLES = 10;
const MAX_AIR = 300;

/** Bubble sprite is 9×9 and advances 8px per bubble. */
const BUBBLE_SIZE = 9;
const BUBBLE_STEP = 8;

/** Beta's x origin: `width / 2 - 91`. */
const ROW_X_ORIGIN = -91;

/** Beta's y origin: `height - 32 - 9` (one row above hunger). */
const ROW_Y_OFFSET = 32 + 9;

export interface AirBubbleCounts {
  readonly full: number;
  readonly popped: number;
}

/**
 * Beta's bubble split for an air value. Pure, so it can be unit-tested against
 * the source formula without a DOM.
 */
export function getAirBubbleCounts(air: number, maxAir: number = MAX_AIR): AirBubbleCounts {
  const clamped = Math.max(0, Math.min(maxAir, air));
  const full = Math.ceil(((clamped - 2) * MAX_BUBBLES) / maxAir);
  const popped = Math.ceil((clamped * MAX_BUBBLES) / maxAir) - full;
  return { full: Math.max(0, full), popped: Math.max(0, popped) };
}

export class AirHudRenderer {
  private readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly bubbles: HTMLImageElement[] = [];

  public constructor(private readonly player: Player) {
    if (typeof document === 'undefined') return;
    this.root.style.cssText = 'position:fixed;pointer-events:none;z-index:120;image-rendering:pixelated;display:none';
    for (let i = 0; i < MAX_BUBBLES; i++) {
      const bubble = document.createElement('img');
      bubble.style.cssText = `position:absolute;left:${i * BUBBLE_STEP}px;top:0;width:${BUBBLE_SIZE}px;height:${BUBBLE_SIZE}px;image-rendering:pixelated`;
      bubble.hidden = true;
      this.root.append(bubble);
      this.bubbles.push(bubble);
    }
    document.body.append(this.root);
  }

  public update(layout: HotbarLayout): void {
    if (typeof document === 'undefined') return;

    // Beta gates the whole bar on the head being inside water.
    if (!this.player.headUnderwater) {
      this.root.style.display = 'none';
      return;
    }

    const { full, popped } = getAirBubbleCounts(this.player.air, this.player.maxAir);
    const total = Math.min(MAX_BUBBLES, full + popped);
    if (total <= 0) {
      this.root.style.display = 'none';
      return;
    }

    const scale = layout.scale;
    this.root.style.display = 'block';
    this.root.style.left = `${Math.floor(innerWidth / 2) + ROW_X_ORIGIN * scale}px`;
    this.root.style.top = `${innerHeight - ROW_Y_OFFSET * scale}px`;
    this.root.style.transformOrigin = 'top left';
    this.root.style.transform = `scale(${scale})`;

    for (let i = 0; i < MAX_BUBBLES; i++) {
      const bubble = this.bubbles[i]!;
      if (i >= total) {
        bubble.hidden = true;
        continue;
      }
      bubble.hidden = false;
      // Leading bubbles are full; the tail is the popping bubble.
      const src = i < full ? '/textures/gui/bubble.png' : '/textures/gui/bubble_popped.png';
      if (bubble.getAttribute('src') !== src) bubble.setAttribute('src', src);
    }
  }

  public dispose(): void {
    this.root.remove?.();
  }
}
