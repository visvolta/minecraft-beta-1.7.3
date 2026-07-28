import type { DebugStats } from './DebugStats';

/**
 * Beta 1.7.3-style F3 overlay.
 *
 * Beta draws a short list of left-aligned, shadowed white strings straight
 * onto the HUD (`GuiIngame.drawStringWithShadow` at x=2, one line every 8-10
 * px) with no panel, no background box and no section headings. This mirrors
 * that: a compact block of dense lines in the Minecraft font, no cards, no
 * graphs, no developer labels.
 *
 * Detailed profiling is intentionally absent — it lives in
 * PerformanceProfiler behind the `window.__mcDebug` console API.
 */
export class DebugOverlay {
  private readonly element: HTMLDivElement;
  private visible = false;
  /** Last rendered text, so an unchanged frame does not touch the DOM. */
  private lastText = '';

  public constructor() {
    this.element = document.createElement('div');
    this.applyStyles(this.element);
    this.element.style.display = 'none';
  }

  /** Mounts the overlay element into the document. Call once, e.g. on Engine.start(). */
  public mount(): void {
    document.body.appendChild(this.element);
  }

  /** Removes the overlay element from the document. Call on Engine.stop(). */
  public dispose(): void {
    this.element.remove();
  }

  public toggle(): void {
    this.visible = !this.visible;
    this.element.style.display = this.visible ? 'block' : 'none';
  }

  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * Updates the overlay text. No-op while hidden, and the DOM is only
   * written when the formatted text actually changed — the overlay must
   * never become a per-frame cost of its own.
   */
  public render(stats: DebugStats): void {
    if (!this.visible) return;

    const text = this.formatLines(stats).join('\n');
    if (text === this.lastText) return;
    this.lastText = text;
    this.element.textContent = text;
  }

  private formatLines(stats: DebugStats): string[] {
    const memory = stats.memoryTotalMb > 0
      ? `Memory: ${stats.memoryUsedMb.toFixed(0)} / ${stats.memoryTotalMb.toFixed(0)} MB`
      : 'Memory: n/a';

    return [
      'Minecraft Beta 1.7.3 Clone',
      `${stats.fps.toFixed(0)} fps (${stats.frameTimeMs.toFixed(1)} ms)`,
      `x: ${stats.playerX.toFixed(2)}`,
      `y: ${stats.playerY.toFixed(2)}`,
      `z: ${stats.playerZ.toFixed(2)}`,
      `f: ${stats.facingIndex} ${stats.facingName}`,
      `Chunk: ${stats.chunkX}, ${stats.chunkZ}`,
      `Dimension: ${stats.dimensionLabel}`,
      `Chunks: ${stats.loadedChunks}`,
      `Entities: ${stats.entityCount}`,
      `Tris: ${stats.triangleCount}  Draws: ${stats.drawCalls}`,
      memory,
      `Gen: ${stats.generationQueueSize}  Mesh: ${stats.meshingQueueSize}`,
    ];
  }

  private applyStyles(element: HTMLDivElement): void {
    element.style.position = 'fixed';
    element.style.top = '0';
    element.style.left = '0';
    element.style.margin = '4px';
    element.style.color = '#ffffff';
    element.style.fontFamily = 'Minecraft, monospace';
    element.style.fontSize = '13px';
    element.style.lineHeight = '1.25';
    element.style.whiteSpace = 'pre';
    element.style.pointerEvents = 'none';
    element.style.userSelect = 'none';
    element.style.zIndex = '1000';
    // Beta's drawStringWithShadow: a hard 1px offset shadow, no blur, no panel.
    element.style.textShadow = '1px 1px 0 rgba(0, 0, 0, 0.9)';
  }
}
