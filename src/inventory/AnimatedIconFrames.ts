/**
 * Single-frame icons for Beta's animated items (clock and compass).
 *
 * Those textures ship as tall vertical strips of 16x16 frames. Anything that
 * points an `<img>` at the raw PNG shows the *whole strip*, which is why the
 * clock rendered as a long column instead of a dial.
 *
 * This module slices the current frame into a 16x16 canvas and hands out a
 * data URL for it. Frames are cached per (icon, frame), so scrubbing through
 * a day of world time costs one small canvas per distinct frame and nothing
 * per render.
 */

const FRAME_SIZE = 16;

/** Items whose texture is a vertical animation strip. */
export type AnimatedIconId = 'clock' | 'compass';

interface StripState {
  readonly image: HTMLImageElement;
  readonly frameCount: number;
  readonly frames: Map<number, string>;
  loaded: boolean;
}

export class AnimatedIconFrames {
  private readonly strips = new Map<AnimatedIconId, StripState>();
  /** Current frame per icon, driven by world state. */
  private readonly currentFrame = new Map<AnimatedIconId, number>();
  private readonly listeners = new Set<() => void>();

  public constructor(sources: Readonly<Record<AnimatedIconId, string>>) {
    if (typeof document === 'undefined') return;
    for (const id of Object.keys(sources) as AnimatedIconId[]) {
      const image = new Image();
      const state: StripState = { image, frameCount: 1, frames: new Map(), loaded: false };
      image.onload = (): void => {
        // Frame count comes from the strip's own aspect ratio.
        const count = image.width > 0 ? Math.max(1, Math.floor(image.height / image.width)) : 1;
        this.strips.set(id, { ...state, frameCount: count, loaded: true, frames: state.frames });
        this.notify();
      };
      image.onerror = (): void => {
        console.warn(`[AnimatedIconFrames] failed to load strip for "${id}"`);
      };
      image.src = sources[id];
      this.strips.set(id, state);
      this.currentFrame.set(id, 0);
    }
  }

  /** Registers a callback fired whenever a visible frame changes. */
  public onFrameChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  public getFrameCount(id: AnimatedIconId): number {
    return this.strips.get(id)?.frameCount ?? 1;
  }

  /**
   * Selects the visible frame. Returns true when it changed, so callers can
   * avoid redundant DOM writes.
   */
  public setFrame(id: AnimatedIconId, frame: number): boolean {
    const count = this.getFrameCount(id);
    const wrapped = ((Math.floor(frame) % count) + count) % count;
    if (this.currentFrame.get(id) === wrapped) return false;
    this.currentFrame.set(id, wrapped);
    this.notify();
    return true;
  }

  public getFrame(id: string): number {
    return this.currentFrame.get(id as AnimatedIconId) ?? 0;
  }

  /**
   * Data URL for the current frame, or null while the strip is still
   * loading. Callers fall back to their normal path until then.
   */
  public getCurrentFrameUrl(id: string): string | null {
    const state = this.strips.get(id as AnimatedIconId);
    if (state === undefined || !state.loaded) return null;
    const frame = this.currentFrame.get(id as AnimatedIconId) ?? 0;
    const cached = state.frames.get(frame);
    if (cached !== undefined) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = FRAME_SIZE;
    canvas.height = FRAME_SIZE;
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.imageSmoothingEnabled = false;
    // Source rect is exactly one frame; never the whole strip.
    context.drawImage(
      state.image,
      0, frame * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE,
      0, 0, FRAME_SIZE, FRAME_SIZE,
    );
    const url = canvas.toDataURL('image/png');
    state.frames.set(frame, url);
    return url;
  }

  public isAnimated(id: string): id is AnimatedIconId {
    return this.strips.has(id as AnimatedIconId);
  }
}

/** Default strip locations, matching the shipped assets. */
export const DEFAULT_ANIMATED_ICON_SOURCES: Readonly<Record<AnimatedIconId, string>> = {
  clock: '/textures/items/clock.png',
  compass: '/textures/items/compass.png',
};
