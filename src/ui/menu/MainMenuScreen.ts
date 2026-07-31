import { applyDirtBackground, guiHeight, guiWidth, GuiButton, Screen } from './MenuWidgets';
import { PanoramaRenderer } from './PanoramaRenderer';
import { PANORAMA_REGISTRY, DEFAULT_PANORAMA } from './PanoramaRegistry';
import { normalizePanoramaBlur, type PanoramaBlur } from './PanoramaBlur';
import { SplashTextProvider } from './SplashText';
import { SplashRenderer } from './SplashRenderer';
import { FONT_SIZE_PX } from '../BetaGuiMetrics';
import type { GameSettings } from '../../settings/GameSettings';

export interface MainMenuActions { readonly singleplayer: () => void; readonly options: () => void; readonly quit: () => void; }

export class MainMenuScreen extends Screen {
  private readonly logo = document.createElement('img');
  private readonly buttons: GuiButton[];
  private panoramaRenderer: PanoramaRenderer | undefined = undefined;
  private blur: PanoramaBlur = 'medium';
  /** Splash text is data-driven and independent of the panorama system. */
  private readonly splash = new SplashRenderer();
  private readonly splashText = new SplashTextProvider();
  private splashFrame = 0;
  public constructor(actions: MainMenuActions, settings?: GameSettings) {
    super();
    this.root.style.backgroundColor = '#080604';
    this.root.style.backgroundImage = 'none';

    const panoramaId = settings?.panorama?.id ?? 'default';
    const def = PANORAMA_REGISTRY.get(panoramaId) ?? DEFAULT_PANORAMA;
    this.blur = normalizePanoramaBlur(settings?.panorama?.blur);

    const renderer = new PanoramaRenderer(this.root);
    this.panoramaRenderer = renderer;
    renderer.setBlur(this.blur);
    renderer.loadPanorama(def).then(() => {
      renderer.setBlur(this.blur);
      renderer.start();
    }).catch((err: unknown) => {
      console.warn('Panorama load failed, falling back to dark background:', err);
      applyDirtBackground(this.root);
      renderer.dispose();
      this.panoramaRenderer = undefined;
    });

    const version = document.createElement('div'); version.textContent='Minecraft Beta 1.7.3'; version.style.cssText='position:absolute;left:4px;bottom:4px;color:#ffffff;z-index:1;font:9px Minecraft';
    this.logo.src='/textures/gui/minecraft_title_logo.png'; this.logo.draggable=false; this.logo.style.cssText='position:absolute;width:256px;height:64px;image-rendering:pixelated;z-index:1';
    this.buttons=[new GuiButton('Singleplayer',actions.singleplayer,200,20),new GuiButton('Options...',actions.options,200,20),new GuiButton('Quit Game',actions.quit,200,20)];
    // Every control sits above the panorama canvas (which is z-index 0 and
    // pointer-events:none), so all of them stay sharp and clickable.
    for (const button of this.buttons) button.element.style.zIndex='1';
    this.root.append(version,this.logo,this.splash.element,...this.buttons.map(b=>b.element));

    // Load asynchronously: a missing/broken splash file must never delay or
    // break the menu, so the renderer just stays on its fallback.
    void this.splashText.load().then(() => {
      this.splash.setText(this.splashText.current());
      this.layout();
    });

    this.startSplashAnimation();
    this.layout();
  }
  protected override onResize(): void { this.layout(); this.panoramaRenderer?.resize(); }

  /** Applies a blur level immediately, so the menu updates as it is changed. */
  public setPanoramaBlur(blur: PanoramaBlur): void {
    this.blur = blur;
    this.panoramaRenderer?.setBlur(blur);
  }

  /** Drives the Beta splash pulse off the menu's own frame loop. */
  private startSplashAnimation(): void {
    const tick = (): void => {
      this.splash.update(guiWidth(), FONT_SIZE_PX);
      this.splashFrame = requestAnimationFrame(tick);
    };
    this.splashFrame = requestAnimationFrame(tick);
  }

  public override dispose(): void {
    if (this.splashFrame !== 0) {
      cancelAnimationFrame(this.splashFrame);
      this.splashFrame = 0;
    }
    this.panoramaRenderer?.dispose();
    this.panoramaRenderer = undefined;
    super.dispose();
  }
  private layout(): void {
    const w=guiWidth(), h=guiHeight(), x=w/2-100, y=Math.max(120, h/4+48);
    this.logo.style.left=`${Math.floor(w/2-128)}px`; this.logo.style.top='30px';
    this.buttons[0]!.setPosition(x,y); this.buttons[1]!.setPosition(x,y+36); this.buttons[2]!.setPosition(x,y+72);
  }
}
