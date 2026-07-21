import * as THREE from 'three';

export type EntityTextureKey = 'pig'|'cow'|'sheep'|'sheepFur'|'chicken'|'zombie'|'skeleton'|'spider'|'spiderEyes'|'creeper'|'arrows'|'bowStandby'|'bowPulling0'|'bowPulling1'|'bowPulling2';

const PATHS: Readonly<Record<EntityTextureKey,string>>={
  pig:'/textures/entity/pig.png',cow:'/textures/entity/cow.png',sheep:'/textures/entity/sheep.png',sheepFur:'/textures/entity/sheep_fur.png',chicken:'/textures/entity/chicken.png',zombie:'/textures/entity/zombie.png',skeleton:'/textures/entity/skeleton.png',spider:'/textures/entity/spider.png',spiderEyes:'/textures/entity/spider_eyes.png',creeper:'/textures/entity/creeper.png',arrows:'/textures/entity/arrows.png',bowStandby:'/textures/items/bow_standby.png',bowPulling0:'/textures/items/bow_pulling_0.png',bowPulling1:'/textures/items/bow_pulling_1.png',bowPulling2:'/textures/items/bow_pulling_2.png',
};
export function configureEntityTexture(texture:THREE.Texture):void{texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.needsUpdate=true;}
export class EntityTextureAssets{
  private readonly disposables:Array<{dispose():void}>=[];
  private constructor(private readonly textures:ReadonlyMap<EntityTextureKey,THREE.Texture>){}
  public static fromTextures(textures:ReadonlyMap<EntityTextureKey,THREE.Texture>):EntityTextureAssets{return new EntityTextureAssets(textures);}
  public static async load():Promise<EntityTextureAssets>{const loader=new THREE.TextureLoader();const entries=await Promise.all((Object.keys(PATHS) as EntityTextureKey[]).map(async key=>{const texture=await loader.loadAsync(PATHS[key]);configureEntityTexture(texture);return [key,texture] as const;}));return new EntityTextureAssets(new Map(entries));}
  public get(key:EntityTextureKey):THREE.Texture{return this.textures.get(key)!;}
  public own(disposable:{dispose():void}):void{this.disposables.push(disposable);}
  public dispose():void{for(const disposable of this.disposables)disposable.dispose();this.disposables.length=0;for(const texture of this.textures.values())texture.dispose();}
}
