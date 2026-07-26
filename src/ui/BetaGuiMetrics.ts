/**
 * Beta 1.7.3 GUI metrics.
 *
 * Beta lays its interface out in a fixed pixel grid that is then scaled by an
 * integer GUI factor. Every screen previously hardcoded its own numbers, which
 * is how the buttons ended up with 18px text in 20px-tall elements and the
 * creative scrollbar ended up 17px out of step with its grid.
 *
 * These constants are that grid, in unscaled Beta pixels. Screens should read
 * from here rather than inventing offsets.
 */

/** Beta's bitmap font cell: 8px tall, characters advance up to 6px. */
export const FONT_HEIGHT = 8;

/**
 * Beta's font renders at 8px. Rendering it larger inside a 20px button is what
 * made button text look oversized and vertically off-centre.
 */
export const FONT_SIZE_PX = 8;

/** Beta `GuiButton`: 200x20, with 20px-tall halves in the widget texture. */
export const BUTTON_WIDTH = 200;
export const BUTTON_HEIGHT = 20;
/** Narrow variant used where two buttons share a row. */
export const BUTTON_WIDTH_HALF = 98;

/** Inventory slot art is 16x16 with an 18px pitch (1px border each side). */
export const SLOT_SIZE = 16;
export const SLOT_PITCH = 18;

/** Beta container windows are 176x166 with a 3-row, 9-column hotbar. */
export const CONTAINER_WIDTH = 176;
export const CONTAINER_HEIGHT = 166;

export const HOTBAR_COLUMNS = 9;

/**
 * Centres single-line text vertically in a widget of `height`.
 *
 * Beta draws text from its top-left at `y + (height - 8) / 2`. Returning the
 * line-height rather than a magic offset lets CSS centring do the same job
 * without per-screen tweaking.
 */
export function centredTextLineHeight(height: number): number {
  return height;
}

/** Beta's own vertical text offset inside a widget, for canvas drawing. */
export function textTopOffset(height: number, fontHeight: number = FONT_HEIGHT): number {
  return Math.floor((height - fontHeight) / 2);
}

/**
 * Creative inventory layout.
 *
 * Beta's creative screen is a container window whose item grid sits below the
 * tab row, with a scrollbar track spanning exactly the grid's vertical extent.
 * Deriving the track from the grid is what keeps the thumb aligned; the
 * previous code declared them independently and they drifted apart.
 */
export const CREATIVE = (() => {
  const columns = 9;
  const rows = 5;
  const gridX = 8;
  const gridY = 18;
  const gridWidth = columns * SLOT_PITCH;
  const gridHeight = rows * SLOT_PITCH;

  /** Scrollbar sits to the right of the grid and spans its full height. */
  const scrollbarWidth = 12;
  const scrollbarX = gridX + gridWidth + 5;
  const scrollbarY = gridY;
  const scrollbarHeight = gridHeight;
  const thumbHeight = 15;

  return {
    columns,
    rows,
    pageSize: columns * rows,
    gridX,
    gridY,
    gridWidth,
    gridHeight,
    /** Bottom edge of the grid; the hotbar must start below this. */
    gridBottom: gridY + gridHeight,
    scrollbarX,
    scrollbarY,
    scrollbarWidth,
    scrollbarHeight,
    thumbHeight,
    /** Distance the thumb may travel along the track. */
    thumbTravel: scrollbarHeight - thumbHeight,
    hotbarY: gridY + gridHeight + 4,
    windowWidth: CONTAINER_WIDTH + 19,
    windowHeight: 136,
  } as const;
})();

/**
 * Maps a scroll fraction (0..1) to a thumb offset along the track, and back.
 * Shared so the drawn position and the hit-test always agree.
 */
export function thumbOffsetForFraction(fraction: number): number {
  const clamped = Math.max(0, Math.min(1, fraction));
  return Math.round(clamped * CREATIVE.thumbTravel);
}

export function fractionForThumbOffset(offset: number): number {
  if (CREATIVE.thumbTravel <= 0) return 0;
  return Math.max(0, Math.min(1, offset / CREATIVE.thumbTravel));
}

/** Beta's font stack; the bitmap font with a monospace fallback. */
export const FONT_FAMILY = "Minecraft, monospace";

/** Shorthand `font` shorthand value at Beta's own size. */
export function betaFont(sizePx: number = FONT_SIZE_PX): string {
  return `${sizePx}px ${FONT_FAMILY}`;
}
