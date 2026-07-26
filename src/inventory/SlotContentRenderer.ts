import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { BlockIconRenderer } from './BlockIconRenderer';
import { ItemIconResolver } from './ItemIconResolver';
import { classifyItemRender, isBlock3dCategory } from './ItemRenderClassifier';
import type { ItemStack } from './ItemStack';import { renderDurabilityBar } from './DurabilityBarRenderer';
import type { AnimatedIconFrames } from './AnimatedIconFrames';
import { DEFAULT_ITEM_DEFINITIONS } from '../items/ItemDefinitionRegistry';

/**
 * Shared icon and stack-count renderer.
 * Delegates 3D block icons to BlockIconRenderer and flat items/sprites to ItemIconResolver.
 */
export class SlotContentRenderer {
  public constructor(
    private readonly blockIcons: BlockIconRenderer,
    private readonly itemIcons: ItemIconResolver,
    private readonly blockRegistry: BlockRegistry,
    /**
     * Supplies a single 16x16 frame for animated icons. Without it the raw
     * strip PNG would be shown, which is what made the clock render as a
     * tall column of frames.
     */
    private readonly animatedIcons?: AnimatedIconFrames,
  ) {}

  public getIconUrl(stack: ItemStack): string {
    const category = classifyItemRender(stack.identity, this.blockRegistry);
    if (isBlock3dCategory(category)) {
      return this.blockIcons.icon(stack.identity.id as number, stack.metadata) || ItemIconResolver.missing();
    }
    const animated = this.animatedFrameUrl(stack);
    if (animated !== null) return animated;
    return this.itemIcons.resolve(String(stack.identity.id));
  }

  /**
   * Current frame for clock/compass, or null for every other item. Resolves
   * the stack through the registry first so numeric and string ids agree.
   */
  private animatedFrameUrl(stack: ItemStack): string | null {
    const frames = this.animatedIcons;
    if (frames === undefined) return null;
    const definition = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
    const id = definition?.id ?? String(stack.identity.id);
    if (!frames.isAnimated(id)) return null;
    return frames.getCurrentFrameUrl(id);
  }

  public renderSlot(slotEl: HTMLElement, stack: ItemStack | null): void {
    const img = slotEl.querySelector<HTMLImageElement>('.stage1-icon');
    const count = slotEl.querySelector<HTMLSpanElement>('.stage1-count');
    if (!img || !count) return;

    img.hidden = stack === null;
    if (stack !== null) {
      img.src = this.getIconUrl(stack);
    }
    renderDurabilityBar(slotEl,stack);
    if (stack !== null && stack.count > 1) {
      count.hidden = false;
      count.textContent = String(stack.count);
    } else {
      count.hidden = true;
      count.textContent = '';
    }
  }
}
