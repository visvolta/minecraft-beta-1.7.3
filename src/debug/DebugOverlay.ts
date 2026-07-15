import type { DebugStats } from './DebugStats';

/**
 * F3-style debug overlay: a single plain-HTML/CSS <div> in the top-left
 * corner, semi-transparent black background, monospace text, one line
 * per stat — no framework, no canvas drawing, no dependency on Three.js.
 * Hidden by default; Engine toggles visibility on F3.
 *
 * Keeps DOM creation/teardown self-contained so Engine only ever calls
 * toggle()/render()/dispose() and never touches the DOM directly.
 */
export class DebugOverlay {
  private readonly element: HTMLDivElement;
  private visible = false;

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
   * Updates the overlay's text content. Cheap no-op skip when hidden —
   * callers may still call this every frame; the DOM is simply not
   * touched while invisible.
   */
  public render(stats: DebugStats): void {
    if (!this.visible) {
      return;
    }

    this.element.textContent = this.formatLines(stats).join('\n');
  }

  private formatLines(stats: DebugStats): string[] {
    return [
      '-- Performance --',
      `FPS: ${stats.fps.toFixed(0)}`,
      `Frame time: ${stats.frameTimeMs.toFixed(2)} ms`,
      '',
      '-- Player --',
      `X: ${stats.playerX.toFixed(3)}`,
      `Y: ${stats.playerY.toFixed(3)}`,
      `Z: ${stats.playerZ.toFixed(3)}`,
      `Chunk X: ${stats.chunkX}`,
      `Chunk Z: ${stats.chunkZ}`,
      `No-clip: ${stats.noClip ? 'ON' : 'off'}`,
      '',
      '-- World --',
      `Biome: ${stats.biomeName}`,
      `Seed: ${stats.worldSeed}`,
      `Time: ${stats.worldTime.toFixed(1)}`,
      `Day: ${stats.dayNumber}`,
      `Celestial angle: ${stats.celestialAngle.toFixed(3)}`,
      `Sky: ${stats.skyPhase}`,
      `Stars: ${stats.starOpacity.toFixed(3)}`,
      `Sun altitude: ${stats.sunAltitude.toFixed(3)}`,
      `Sky color: ${stats.skyColorHex}`,
      `Loaded chunks: ${stats.loadedChunks}`,
      `Visible chunk meshes: ${stats.visibleChunkMeshes}`,
      '',
      '-- Rendering --',
      `Triangles: ${stats.triangleCount}`,
      `Draw calls: ${stats.drawCalls}`,
      `Dirty chunk queue: ${stats.dirtyChunkQueueSize}`,
      `Fog: ${stats.fogMode}`,
      `Fog near: ${stats.fogNear.toFixed(1)}`,
      `Fog far: ${stats.fogFar.toFixed(1)}`,
      `Fog color: ${stats.fogColorHex}`,
    ];
  }

  private applyStyles(element: HTMLDivElement): void {
    element.style.position = 'fixed';
    element.style.top = '0';
    element.style.left = '0';
    element.style.margin = '8px';
    element.style.padding = '8px 10px';
    element.style.background = 'rgba(0, 0, 0, 0.5)';
    element.style.color = '#ffffff';
    element.style.fontFamily = 'monospace';
    element.style.fontSize = '13px';
    element.style.lineHeight = '1.4';
    element.style.whiteSpace = 'pre';
    element.style.pointerEvents = 'none';
    element.style.userSelect = 'none';
    element.style.zIndex = '1000';
    element.style.textShadow = '1px 1px 1px rgba(0, 0, 0, 0.8)';
  }
}
