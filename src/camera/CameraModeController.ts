import type { Input } from '../input/Input';
import type { PerspectiveCamera } from 'three';
import type { Player } from '../player/Player';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import { AIR_BLOCK_ID } from '../world/chunkConstants.ts';
import {
  THIRD_PERSON_DISTANCE,
  THIRD_PERSON_TARGET_OFFSET_Y,
  FIRST_PERSON_CAMERA_OFFSET_X,
  FIRST_PERSON_CAMERA_OFFSET_Y,
  FIRST_PERSON_CAMERA_OFFSET_Z
} from '../player/PlayerConstants.ts';

export enum CameraMode {
  FIRST_PERSON,
  THIRD_PERSON_REAR,
}

export class CameraModeController {
  private mode = CameraMode.FIRST_PERSON;
  
  public constructor(
    private readonly input: Input, 
    private readonly world: BlockUpdateWorld,
    private readonly blockRegistry: BlockRegistry
  ) {}

  public update(): void {
    if (this.input.isKeyJustPressed('KeyP')) {
      this.mode = this.mode === CameraMode.FIRST_PERSON ? CameraMode.THIRD_PERSON_REAR : CameraMode.FIRST_PERSON;
    }
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public applyTransform(camera: PerspectiveCamera, player: Player, yaw: number, pitch: number): void {
    const eyeX = player.position.x + FIRST_PERSON_CAMERA_OFFSET_X;
    const eyeY = player.position.y + FIRST_PERSON_CAMERA_OFFSET_Y + (this.mode === CameraMode.THIRD_PERSON_REAR ? THIRD_PERSON_TARGET_OFFSET_Y : 0.0);
    const eyeZ = player.position.z + FIRST_PERSON_CAMERA_OFFSET_Z;

    if (this.mode === CameraMode.FIRST_PERSON) {
      camera.position.set(eyeX, eyeY, eyeZ);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
    } else {
      // THIRD_PERSON_REAR
      const targetDistance = THIRD_PERSON_DISTANCE;
      let actualDistance = targetDistance;

      // Beta 1.7.3 third person camera math
      // var14 = -sin(yaw) * cos(pitch) * dist
      // var18 = -sin(pitch) * dist
      // var16 = cos(yaw) * cos(pitch) * dist
      // Note: Three.js yaw=0 is -Z, while Beta yaw=0 is +Z (or something). 
      // We will use standard Three.js directional math based on pitch/yaw.
      const dx = -Math.sin(yaw) * Math.cos(pitch);
      const dy = Math.sin(pitch);
      const dz = -Math.cos(yaw) * Math.cos(pitch);

      // Perform 8 raycasts from corners of 0.1 box around eye
      for (let i = 0; i < 8; i++) {
        const ox = ((i & 1) * 2 - 1) * 0.1;
        const oy = (((i >> 1) & 1) * 2 - 1) * 0.1;
        const oz = (((i >> 2) & 1) * 2 - 1) * 0.1;

        const startX = eyeX + ox;
        const startY = eyeY + oy;
        const startZ = eyeZ + oz;

        // Reproducing the Beta 1.7.3 oddity exactly:
        // Vec3D.createVector(var4 - var14 + var21 + var23, var6 - var18 + var22, var8 - var16 + var23)
        // var21=ox, var22=oy, var23=oz
        const endX = eyeX - dx * targetDistance + ox + oz;
        const endY = eyeY - dy * targetDistance + oy;
        const endZ = eyeZ - dz * targetDistance + oz;

        const hitDist = this.rayTraceSolidBlocks(startX, startY, startZ, endX, endY, endZ);
        if (hitDist !== undefined) {
          // Distance back to the true eye point
          const hitX = startX + (endX - startX) * hitDist;
          const hitY = startY + (endY - startY) * hitDist;
          const hitZ = startZ + (endZ - startZ) * hitDist;
          
          const distToEye = Math.sqrt((hitX - eyeX)**2 + (hitY - eyeY)**2 + (hitZ - eyeZ)**2);
          if (distToEye < actualDistance) {
            actualDistance = distToEye;
          }
        }
      }

      camera.position.set(
        eyeX - dx * actualDistance,
        eyeY - dy * actualDistance,
        eyeZ - dz * actualDistance
      );
      
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
    }
  }

  /** Simple DDA raycast stopping only at solid blocks, returning a fractional distance 0..1 */
  private rayTraceSolidBlocks(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number | undefined {
    let voxelX = Math.floor(x1);
    let voxelY = Math.floor(y1);
    let voxelZ = Math.floor(z1);

    const dirX = x2 - x1;
    const dirY = y2 - y1;
    const dirZ = z2 - z1;

    const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
    if (length === 0) return undefined;

    const stepX = Math.sign(dirX);
    const stepY = Math.sign(dirY);
    const stepZ = Math.sign(dirZ);

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dirX) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dirY) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dirZ) : Infinity;

    let tMaxX = stepX > 0 ? (voxelX + 1 - x1) / dirX : stepX < 0 ? (voxelX - x1) / dirX : Infinity;
    let tMaxY = stepY > 0 ? (voxelY + 1 - y1) / dirY : stepY < 0 ? (voxelY - y1) / dirY : Infinity;
    let tMaxZ = stepZ > 0 ? (voxelZ + 1 - z1) / dirZ : stepZ < 0 ? (voxelZ - z1) / dirZ : Infinity;

    let travelled = 0;
    while (travelled <= 1) {
      if (voxelY >= 0 && voxelY < 128) {
        const blockId = this.world.getBlock(voxelX, voxelY, voxelZ);
        if (blockId !== AIR_BLOCK_ID) {
          const def = this.blockRegistry.getById(blockId);
          if (def && def.solid) {
            return travelled;
          }
        }
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        voxelX += stepX;
        travelled = tMaxX;
        tMaxX += tDeltaX;
      } else if (tMaxY < tMaxZ) {
        voxelY += stepY;
        travelled = tMaxY;
        tMaxY += tDeltaY;
      } else {
        voxelZ += stepZ;
        travelled = tMaxZ;
        tMaxZ += tDeltaZ;
      }
    }

    return undefined;
  }
}

