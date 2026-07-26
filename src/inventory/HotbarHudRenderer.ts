import type { TextureAtlas } from '../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../assets/ItemTextureAtlas';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { Inventory } from './Inventory';
import type { ItemStack } from './ItemStack';
import { HotbarLayout } from './HotbarLayout';
import type { GuiScaleSetting } from '../ui/GuiScale';
import { HotbarUi } from './HotbarUi';
import { ItemIconResolver } from './ItemIconResolver';
import { BlockIconRenderer } from './BlockIconRenderer';
import { SlotContentRenderer } from './SlotContentRenderer';
import { AnimatedIconFrames, DEFAULT_ANIMATED_ICON_SOURCES } from './AnimatedIconFrames';

/** One active hotbar coordinator: DOM items plus one shared cached 3D block-icon surface. */
export class HotbarHudRenderer {
  private layout: HotbarLayout;
  private ui = new HotbarUi();
  private icons = new ItemIconResolver();
  private blocksIcons: BlockIconRenderer;
  /** Shared single-frame source for the clock and compass icons. */
  private readonly animatedIcons = new AnimatedIconFrames(DEFAULT_ANIMATED_ICON_SOURCES);

  private slotContentRenderer?: SlotContentRenderer;
  private resize = () => this.layout.resize();

  constructor(
    atlas: TextureAtlas,
    _itemAtlas: ItemTextureAtlas,
    private blocksRegistry: BlockRegistry,
    private inventory: Inventory,
    guiScaleSetting: GuiScaleSetting = 0
  ) {
    this.layout = new HotbarLayout(guiScaleSetting);
    this.blocksIcons = new BlockIconRenderer(blocksRegistry, atlas);
    this.layout.resize();
    addEventListener('resize', this.resize);
  }

  public getLayout(): HotbarLayout {
    return this.layout;
  }

  public setGuiScale(setting: GuiScaleSetting): void {
    this.layout.setGuiScale(setting);
  }

  /** Shared animated-icon frame source, driven by the engine from world time. */
  public getAnimatedIcons(): AnimatedIconFrames {
    return this.animatedIcons;
  }

  public getSlotContentRenderer(): SlotContentRenderer {
    if (!this.slotContentRenderer) {
      this.slotContentRenderer = new SlotContentRenderer(this.blocksIcons, this.icons, this.blocksRegistry, this.animatedIcons);
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
