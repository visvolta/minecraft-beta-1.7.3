import { BlockIds } from '../blocks/BlockId';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { StepSoundMaterial } from '../audio/BlockSoundMaterial';
import { DamageSource } from '../entities/damage/DamageSource';
import {
  isEyeInWater,
  isFireInAABB,
  isInsideOpaqueBlock,
  isLavaInAABB,
  isWaterInAABB,
} from '../entities/living/HazardDetection';
import type { PlayerMovementResult } from '../physics/PlayerPhysics';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';
import { VOID_MIN_Y } from '../world/chunkConstants';
import { Difficulty } from '../world/Difficulty';
import type { Player } from './Player';

interface LandingSoundEvent {
  readonly material: StepSoundMaterial;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly volume: number;
  readonly pitch: number;
}

/** Engine-owned 20 Hz survival simulation; Player remains the sole state owner. */
export class PlayerSurvivalController {
  private landingSoundListener: ((event: LandingSoundEvent) => void) | undefined;

  public constructor(
    private readonly player: Player,
    private readonly world: BlockUpdateWorld,
    private readonly blocks: BlockRegistry,
    private readonly getDifficulty: () => Difficulty = () => Difficulty.Normal,
  ) {}

  public setLandingSoundListener(listener: ((event: LandingSoundEvent) => void) | undefined): void {
    this.landingSoundListener = listener;
  }

  public recordMovement(result: PlayerMovementResult): void {
    if (!this.player.isAlive() || this.player.isCreativeMode()) {
      this.player.fallDistance = 0;
      return;
    }

    const dx = (result.currentX ?? 0) - (result.previousX ?? 0);
    const dz = (result.currentZ ?? 0) - (result.previousZ ?? 0);
    const distance = Math.hypot(dx, dz);
    if (distance > 0) {
      this.player.addExhaustion(distance * (result.inWater ? 0.015 : (this.player.isSprinting ? 0.1 : 0.01)));
    }

    const dy = result.currentY - result.previousY;
    if (result.climbing) {
      this.player.fallDistance = 0;
      return;
    }

    if (dy < 0) {
      this.player.fallDistance -= dy;
    }

    if (result.grounded) {
      const damage = Math.ceil(this.player.fallDistance - 3);
      this.player.fallDistance = 0;
      if (damage > 0) {
        this.player.attackEntityFrom(DamageSource.fall(), damage);
        this.emitLandingSound();
      }
    }
  }

  public tick(): void {
    const p = this.player;
    if (!p.isAlive()) return;
    if (p.isCreativeMode()) {
      p.fireTicks = 0;
      p.air = p.maxAir;
      p.fallDistance = 0;
      p.exhaustion = 0;
      p.foodTimer = 0;
      p.starvationTimer = 0;
      return;
    }

    const box = p.getAABB();
    const inWater = isWaterInAABB(this.world, box);
    const inLava = isLavaInAABB(this.world, box);
    if (inWater) {
      p.fireTicks = 0;
      p.fallDistance = 0;
    }
    if (inLava) {
      p.attackEntityFrom(DamageSource.lava(), 4);
      p.fireTicks = Math.max(p.fireTicks, 600);
      p.fallDistance = 0;
    }
    if (isFireInAABB(this.world, box) && p.fireTicks <= 0) p.fireTicks = 120;
    if (p.fireTicks > 0 && !inWater) {
      p.fireTicks--;
      if (p.fireTicks % 20 === 0) p.attackEntityFrom(DamageSource.fire(), 1);
    }
    const eyeWater = isEyeInWater(this.world, p.position.x, p.getEyeY(), p.position.z);
    p.headUnderwater = eyeWater;
    if (eyeWater) {
      p.air--;
      if (p.air <= -20) {
        p.air = 0;
        p.attackEntityFrom(DamageSource.drown(), 2);
      }
    } else p.air = p.maxAir;
    if (this.touchesCactus(box)) p.attackEntityFrom(DamageSource.cactus(), 1);
    if (isInsideOpaqueBlock(this.world, this.blocks, p.position.x, p.getEyeY(), p.position.z, .6)) p.attackEntityFrom(DamageSource.suffocate(), 1);
    if (p.position.y < VOID_MIN_Y) p.attackEntityFrom(DamageSource.outOfWorld(), 4);
    this.tickFoodStats();
  }

  private tickFoodStats(): void {
    const p = this.player;
    const difficulty = this.getDifficulty();
    while (p.exhaustion >= 4) {
      p.exhaustion -= 4;
      if (p.saturation > 0) p.saturation = Math.max(0, p.saturation - 1);
      else if (difficulty !== Difficulty.Peaceful) p.hunger = Math.max(0, p.hunger - 1);
    }
    if (p.hunger >= 18 && p.health < p.maxHealth) {
      if (++p.foodTimer >= 80) {
        p.setHealth(p.health + 1);
        p.addExhaustion(3);
        p.foodTimer = 0;
      }
    } else if (p.hunger <= 0) {
      if (++p.starvationTimer >= 80) {
        const canDamage = difficulty === Difficulty.Hard || difficulty === Difficulty.Normal && p.health > 1 || difficulty === Difficulty.Easy && p.health > 10;
        if (canDamage) p.attackEntityFrom(DamageSource.starve(), 1);
        p.starvationTimer = 0;
      }
    } else {
      p.foodTimer = 0;
      p.starvationTimer = 0;
    }
  }

  private emitLandingSound(): void {
    const blockId = this.world.getBlock(
      Math.floor(this.player.position.x),
      Math.floor(this.player.position.y - 0.2),
      Math.floor(this.player.position.z),
    );
    const sound = this.blocks.getById(blockId)?.sound;
    if (!sound) return;
    this.landingSoundListener?.({
      material: sound.step,
      x: this.player.position.x,
      y: this.player.position.y,
      z: this.player.position.z,
      volume: (sound.volume ?? 1) * 0.5,
      pitch: (sound.pitch ?? 1) * 0.75,
    });
  }

  private touchesCactus(box: ReturnType<Player['getAABB']>): boolean {
    for (let x = Math.floor(box.minX); x <= Math.floor(box.maxX); x++)
      for (let y = Math.max(0, Math.floor(box.minY)); y <= Math.floor(box.maxY); y++)
        for (let z = Math.floor(box.minZ); z <= Math.floor(box.maxZ); z++)
          if (this.world.getBlock(x, y, z) === BlockIds.Cactus) return true;
    return false;
  }
}
