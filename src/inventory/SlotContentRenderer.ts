import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { BlockIconRenderer } from './BlockIconRenderer';
import { ItemIconResolver } from './ItemIconResolver';
import { classifyItemRender, isBlock3dCategory } from './ItemRenderClassifier';
import type { ItemStack } from './ItemStack';

/**
 * Shared icon and stack-count renderer.
 * Delegates 3D block icons to BlockIconRenderer and flat items/sprites to ItemIconResolver.
 */
export class SlotContentRenderer {
  public constructor(
    private readonly blockIcons: BlockIconRenderer,
    private readonly itemIcons: ItemIconResolver,
    private readonly blockRegistry: BlockRegistry
  ) {}

  public getIconUrl(stack: ItemStack): string {
    const category = classifyItemRender(stack.identity, this.blockRegistry);
    if (isBlock3dCategory(category)) {
      return this.blockIcons.icon(stack.identity.id as number, stack.metadata) || ItemIconResolver.missing();
    }
    return this.itemIcons.resolve(String(stack.identity.id));
  }

  public renderSlot(slotEl: HTMLElement, stack: ItemStack | null): void {
    const img = slotEl.querySelector<HTMLImageElement>('.stage1-icon');
    const count = slotEl.querySelector<HTMLSpanElement>('.stage1-count');
    if (!img || !count) return;

    img.hidden = stack === null;
    if (stack !== null) {
      img.src = this.getIconUrl(stack);
    }
    if (stack !== null && stack.count > 1) {
      count.hidden = false;
      count.textContent = String(stack.count);
    } else {
      count.hidden = true;
      count.textContent = '';
    }
  }
}
