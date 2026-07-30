/**
 * Main-menu splash text.
 *
 * Beta's `GuiMainMenu` picks one random line from `title/splashes.txt` at
 * construction and draws it beside the logo, rotated -20° and pulsing.
 *
 * The lines live in a data file, never in source, so a custom splash file can
 * replace them without touching any TypeScript. This module owns loading and
 * selection only; it has no knowledge of the panorama system (they are
 * independent menu features) and no knowledge of how the text is drawn.
 */

/** Default location of the splash data file. */
export const DEFAULT_SPLASH_PATH = '/texts/splashes.txt';

/**
 * Shown when the splash file cannot be loaded. Deterministic (never random) so
 * a failed load is visually obvious rather than looking like a normal splash.
 */
export const FALLBACK_SPLASH = 'missingno';

/**
 * Parses splash file contents into usable lines.
 *
 * - one splash per line
 * - blank/whitespace-only lines are ignored
 * - CR is stripped so CRLF files behave identically to LF files
 * - all other characters are preserved exactly, including punctuation,
 *   accents and emoji
 */
export function parseSplashes(contents: string): string[] {
  return contents
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0);
}

/**
 * Loads and owns the splash list.
 *
 * A failed fetch is not an error the menu should care about: `current()`
 * simply returns {@link FALLBACK_SPLASH}, so the menu always has something to
 * draw and never blocks on the network.
 */
export class SplashTextProvider {
  private splashes: string[] = [];
  private selected: string = FALLBACK_SPLASH;
  private loaded = false;

  public constructor(private readonly path: string = DEFAULT_SPLASH_PATH) {}

  /**
   * Fetches and parses the splash file, then picks one at random.
   *
   * `random` is injectable so tests can select deterministically.
   */
  public async load(random: () => number = Math.random): Promise<void> {
    try {
      const response = await fetch(this.path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parseSplashes(await response.text());
      if (parsed.length === 0) throw new Error('Splash file contained no usable lines');
      this.splashes = parsed;
      this.loaded = true;
      this.reroll(random);
    } catch (error) {
      console.warn(`[SplashText] Falling back to "${FALLBACK_SPLASH}":`, error);
      this.splashes = [];
      this.loaded = false;
      this.selected = FALLBACK_SPLASH;
    }
  }

  /** Picks a new random splash from the loaded set. */
  public reroll(random: () => number = Math.random): void {
    if (this.splashes.length === 0) {
      this.selected = FALLBACK_SPLASH;
      return;
    }
    const index = Math.min(this.splashes.length - 1, Math.max(0, Math.floor(random() * this.splashes.length)));
    this.selected = this.splashes[index] ?? FALLBACK_SPLASH;
  }

  /** The splash to display right now. Always returns something drawable. */
  public current(): string {
    return this.selected;
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public count(): number {
    return this.splashes.length;
  }
}
