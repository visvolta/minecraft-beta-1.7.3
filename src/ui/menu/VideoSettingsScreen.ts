import { applyDirtBackground, guiHeight, guiWidth, GuiButton, Screen } from './MenuWidgets';
import type { GameSettings } from '../../settings/GameSettings';
import { guiScaleLabel, nextGuiScale } from '../GuiScale';
import { nextRenderDistance, renderDistanceLabel } from '../../settings/RenderDistance';
import { nextPanoramaBlur, normalizePanoramaBlur, panoramaBlurLabel } from './PanoramaBlur';

export class VideoSettingsScreen extends Screen {
  private settings: GameSettings;
  private readonly viewBob: GuiButton;
  private readonly guiScaleButton: GuiButton;
  private readonly aaButton: GuiButton;
  private readonly scaleButton: GuiButton;
  private readonly renderDistanceButton: GuiButton;
  private readonly panoramaBlurButton: GuiButton;
  private readonly back: GuiButton;
  public constructor(settings: GameSettings, private readonly setSettings: (settings: GameSettings) => void, done: () => void) {
    super(); applyDirtBackground(this.root); this.settings = settings;
    const title=document.createElement('div'); title.textContent='Video Settings'; title.style.cssText='position:absolute;left:0;right:0;top:20px;text-align:center;font:18px Minecraft, monospace;color:white';
    this.viewBob=new GuiButton('',()=>this.update({...this.settings,video:{...this.settings.video,viewBobbing:!this.settings.video.viewBobbing}}),150,20);
    this.guiScaleButton=new GuiButton('',()=>this.update({...this.settings,video:{...this.settings.video,guiScale:nextGuiScale(this.settings.video.guiScale)}}),150,20);
    this.aaButton=new GuiButton('',()=>this.update({...this.settings,video:{...this.settings.video,aaMode:nextAa(this.settings.video.aaMode)}}),150,20);
    this.scaleButton=new GuiButton('',()=>this.update({...this.settings,video:{...this.settings.video,renderScale:nextScale(this.settings.video.renderScale)}}),150,20);
    this.renderDistanceButton=new GuiButton('',()=>this.update({...this.settings,video:{...this.settings.video,renderDistance:nextRenderDistance(this.settings.video.renderDistance)}}),150,20);
    this.panoramaBlurButton=new GuiButton('',()=>{
      const current=normalizePanoramaBlur(this.settings.panorama?.blur);
      this.update({...this.settings,panorama:{id:this.settings.panorama?.id??'default',blur:nextPanoramaBlur(current)}});
    },150,20);
    this.back=new GuiButton('Done',done,200,20);
    this.root.append(title,this.viewBob.element,this.guiScaleButton.element,this.aaButton.element,this.scaleButton.element,this.renderDistanceButton.element,this.panoramaBlurButton.element,this.back.element); this.refreshLabels(); this.layout();
  }
  protected override onResize(): void { this.layout(); }
  private update(settings: GameSettings): void { this.settings = settings; this.setSettings(settings); this.refreshLabels(); }
  private refreshLabels(): void {
    this.viewBob.element.textContent=`View Bobbing: ${this.settings.video.viewBobbing?'ON':'OFF'}`;
    this.guiScaleButton.element.textContent=`GUI Scale: ${guiScaleLabel(this.settings.video.guiScale)}`;
    this.aaButton.element.textContent=`AA: ${this.settings.video.aaMode.toUpperCase()}`;
    this.scaleButton.element.textContent=`Render Scale: ${this.settings.video.renderScale.toFixed(2)}`;
    this.renderDistanceButton.element.textContent=`Render Distance: ${renderDistanceLabel(this.settings.video.renderDistance)}`;
    this.panoramaBlurButton.element.textContent=`Menu Blur: ${panoramaBlurLabel(normalizePanoramaBlur(this.settings.panorama?.blur))}`;
  }
  private layout(): void {
    const w=guiWidth(),h=guiHeight();
    this.viewBob.setPosition(w/2-155,70); this.guiScaleButton.setPosition(w/2+5,70);
    this.aaButton.setPosition(w/2-155,96); this.scaleButton.setPosition(w/2+5,96);
    this.renderDistanceButton.setPosition(w/2-155,122); this.panoramaBlurButton.setPosition(w/2+5,122);
    this.back.setPosition(w/2-100,h-40);
  }
}
function nextAa(mode: 'smaa' | 'fxaa' | 'off'): 'smaa' | 'fxaa' | 'off' {
  return mode === 'smaa' ? 'fxaa' : mode === 'fxaa' ? 'off' : 'smaa';
}
function nextScale(scale: number): number {
  const steps = [0.75, 1, 1.25];
  const i = steps.findIndex((s) => Math.abs(s - scale) < 0.01);
  return steps[(i + 1) % steps.length]!;
}

