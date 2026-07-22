import { BoxGeometry } from 'three';
import { PLAYER_MODEL_SCALE } from '../../player/PlayerConstants';
import type { PlayerSkinManager } from '../../player/PlayerSkinManager';

export interface HelmetArmourGeometry {
  readonly head: BoxGeometry;
  readonly headwear: BoxGeometry;
}

export interface ChestArmourGeometry {
  readonly body: BoxGeometry;
  readonly rightArm: BoxGeometry;
  readonly leftArm: BoxGeometry;
}

export interface LeggingsArmourGeometry {
  readonly body: BoxGeometry;
  readonly rightLeg: BoxGeometry;
  readonly leftLeg: BoxGeometry;
}

export interface BootsArmourGeometry {
  readonly rightLeg: BoxGeometry;
  readonly leftLeg: BoxGeometry;
}

/**
 * Engine-owned, Player-independent Beta armour geometry. Every Player mesh
 * references these same immutable BufferGeometry instances.
 */
export class ArmourGeometryCache {
  public readonly helmet: HelmetArmourGeometry;
  public readonly chest: ChestArmourGeometry;
  public readonly leggings: LeggingsArmourGeometry;
  public readonly boots: BootsArmourGeometry;
  private readonly all: readonly BoxGeometry[];

  public constructor(uvMapper: PlayerSkinManager) {
    this.helmet = {
      head: this.createBox(8, 8, 8, 1, 0, 0, false, uvMapper, 'helmet-head'),
      headwear: this.createBox(8, 8, 8, 1.5, 32, 0, false, uvMapper, 'helmet-headwear'),
    };
    this.chest = {
      body: this.createBox(8, 12, 4, 1, 16, 16, false, uvMapper, 'chest-body'),
      rightArm: this.createBox(4, 12, 4, 1, 40, 16, false, uvMapper, 'chest-right-arm'),
      leftArm: this.createBox(4, 12, 4, 1, 40, 16, true, uvMapper, 'chest-left-arm'),
    };
    this.leggings = {
      body: this.createBox(8, 12, 4, 0.5, 16, 16, false, uvMapper, 'leggings-body'),
      rightLeg: this.createBox(4, 12, 4, 0.5, 0, 16, false, uvMapper, 'leggings-right-leg'),
      leftLeg: this.createBox(4, 12, 4, 0.5, 0, 16, true, uvMapper, 'leggings-left-leg'),
    };
    this.boots = {
      rightLeg: this.createBox(4, 12, 4, 1, 0, 16, false, uvMapper, 'boots-right-leg'),
      leftLeg: this.createBox(4, 12, 4, 1, 0, 16, true, uvMapper, 'boots-left-leg'),
    };
    this.all = [
      this.helmet.head,
      this.helmet.headwear,
      this.chest.body,
      this.chest.rightArm,
      this.chest.leftArm,
      this.leggings.body,
      this.leggings.rightLeg,
      this.leggings.leftLeg,
      this.boots.rightLeg,
      this.boots.leftLeg,
    ];
  }

  public get size(): number {
    return this.all.length;
  }

  public dispose(): void {
    for (const geometry of this.all) geometry.dispose();
  }

  private createBox(
    width: number,
    height: number,
    depth: number,
    expansion: number,
    textureX: number,
    textureY: number,
    mirror: boolean,
    uvMapper: PlayerSkinManager,
    part: string,
  ): BoxGeometry {
    const geometry = new BoxGeometry(
      (width + expansion * 2) * PLAYER_MODEL_SCALE,
      (height + expansion * 2) * PLAYER_MODEL_SCALE,
      (depth + expansion * 2) * PLAYER_MODEL_SCALE,
    );
    uvMapper.applyUVsToGeometry(
      geometry,
      uvMapper.getPartUVs(textureX, textureY, width, height, depth, mirror, 64, 32),
    );
    geometry.userData.armourPart = part;
    geometry.userData.expansionPixels = expansion;
    geometry.userData.sourceSizePixels = { width, height, depth };
    geometry.userData.mirrored = mirror;
    return geometry;
  }
}
