import type { TextureAtlas } from '../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../assets/ItemTextureAtlas';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { Inventory } from './Inventory';
import type { ItemStack } from './ItemStack';
import { HotbarLayout } from './HotbarLayout';
import { HotbarUi } from './HotbarUi';
import { ItemIconResolver } from './ItemIconResolver';
import { BlockIconRenderer } from './BlockIconRenderer';
import { SlotContentRenderer } from './SlotContentRenderer';

/** One active hotbar coordinator: DOM items plus one shared cached 3D block-icon surface. */
export class HotbarHudRenderer {
  private layout = new HotbarLayout();
  private ui = new HotbarUi();
  private icons = new ItemIconResolver();
  private blocksIcons: BlockIconRenderer;
  private slotContentRenderer?: SlotContentRenderer;
  private resize = () => this.layout.resize();

  constructor(
    atlas: TextureAtlas,
    _itemAtlas: ItemTextureAtlas,
    private blocksRegistry: BlockRegistry,
    private inventory: Inventory
  ) {
    this.blocksIcons = new BlockIconRenderer(blocksRegistry, atlas);
    this.layout.resize();
    addEventListener('resize', this.resize);
  }

  public getLayout(): HotbarLayout {
    return this.layout;
  }

  public getSlotContentRenderer(): SlotContentRenderer {
    if (!this.slotContentRenderer) {
      this.slotContentRenderer = new SlotContentRenderer(this.blocksIcons, this.icons, this.blocksRegistry);
    }
    return this.slotContentRenderer;
  }

  private icon(stack: ItemStack): string {
    return this.getSlotContentRenderer().getIconUrl(stack);
  }

  update(selected: number): void {
    this.ui.render(
      this.inventory.getSlots().slice(0, 9),
      Math.max(0, Math.min(8, selected)),
      this.layout.slots(),
      (s) => this.icon(s)
    );
  }

  render(): void {}

  dispose(): void {
    removeEventListener('resize', this.resize);
    this.ui.dispose();
    this.blocksIcons.dispose();
  }
}
