import { AABB } from '../physics/AABB';
import { DamageSource, type DamageAttacker } from '../entities/damage/DamageSource';
import type { PlayerEquipment } from '../inventory/PlayerEquipment';
import { reduceDamageByArmour } from './ArmourProtection';
import {
  ANIMATION_SWING_DURATION_SECONDS,
  ANIMATION_MOVEMENT_SPEED_SCALING,
  ANIMATION_RETURN_TO_NEUTRAL_SPEED,
  ANIMATION_WALK_SWING_FREQUENCY,
  FIRST_PERSON_CAMERA_OFFSET_Y
} from './PlayerConstants.ts';

/** Player hitbox width and depth (blocks). */
export const PLAYER_WIDTH = 0.6;

/** Player hitbox height (blocks). */
export const PLAYER_HEIGHT = 1.8;

/** Camera height above the player's feet (blocks). */
export const PLAYER_EYE_HEIGHT = FIRST_PERSON_CAMERA_OFFSET_Y;

/**
 * Player position, velocity, and grounded state.
 * Data only: movement input lives in PlayerController, physics/collision
 * lives in PlayerPhysics.
 *
 * Position is the feet centre (bottom-centre of the hitbox), matching
 * Beta's own convention and keeping ground/eye-height math simple.
 */
export class Player {
  public maxHealth = 20;
  public health = 20;
  public fallDistance = 0;
  public fireTicks = 0;
  public air = 300;
  public readonly maxAir = 300;
  public hurtResistantTime = 0;
  public hurtTime = 0;
  public lastDamageAmount = 0;
  public lastDamageSource: DamageSource | undefined;
  public lastAttacker: DamageAttacker | undefined;
  public attackedAtYaw = 0;
  public deathSequence = 0;
  public recentHealth = 20;
  public healthFlashTicks=0;
  public hunger=20;public saturation=5;public exhaustion=0;public foodTimer=0;public starvationTimer=0;
  public isEating=false;public foodUseTicks=0;public foodUseSlot=-1;public foodUseItem:string|number|undefined;
  public isSprinting=false;public inWater=false;public inLava=false;public headUnderwater=false;public collidedHorizontally=false;
  private equipment: PlayerEquipment | undefined;
  private armourDamageRemainder = 0;

  /** Feet position (bottom-centre of the hitbox), world space. */
  public readonly position = { x: 0, y: 0, z: 0 };

  /** Current velocity, blocks per second. */
  public readonly velocity = { x: 0, y: 0, z: 0 };

  /**
   * Horizontal velocity movement input is steering toward, set each frame
   * by PlayerController and consumed by PlayerPhysics. Not applied directly;
   * PlayerPhysics accelerates the real velocity toward this value so
   * momentum is preserved (especially in the air).
   */
  public readonly wishVelocity = { x: 0, z: 0 };

  /** True only while resting on a solid block (set by PlayerPhysics). */
  public grounded = false;

  public distanceWalkedModified = 0;
  public prevDistanceWalkedModified = 0;

  public isSwinging = false;
  public armAction:'none'|'breaking'|'breakingRecover'='none';public breakingSwingPhase=0;public prevBreakingSwingPhase=0;
  public swingProgressInt = 0;
  public swingProgress = 0;
  public prevSwingProgress = 0;

  public limbSwingAmount = 0;
  public prevLimbSwingAmount = 0;
  public limbSwingPhase = 0;
  public prevLimbSwingPhase = 0;
  public swingTime = 0;

  public bodyYaw = 0;
  public prevBodyYaw = 0;

  public constructor(spawnX: number, spawnY: number, spawnZ: number) {
    this.position.x = spawnX;
    this.position.y = spawnY;
    this.position.z = spawnZ;
  }

  /** World-space eye position (for the camera), derived from feet position. */
  public getEyeY(): number {
    return this.position.y + PLAYER_EYE_HEIGHT;
  }

  /** Current world-space AABB derived from feet position and fixed dimensions. */
  public getAABB(): AABB {
    const halfWidth = PLAYER_WIDTH / 2;

    return new AABB(
      this.position.x - halfWidth,
      this.position.y,
      this.position.z - halfWidth,
      this.position.x + halfWidth,
      this.position.y + PLAYER_HEIGHT,
      this.position.z + halfWidth,
    );
  }

  public isAlive(): boolean { return this.health > 0; }
  public get isDead():boolean{return this.health<=0;}

  public setHealth(value:number):void{this.health=Math.max(0,Math.min(this.maxHealth,value));}
  public setFoodState(hunger:number,saturation:number,exhaustion=0):void{this.hunger=Math.max(0,Math.min(20,hunger));this.saturation=Math.max(0,Math.min(this.hunger,saturation));this.exhaustion=Math.max(0,exhaustion);}
  public addFood(food:number,saturationModifier:number):void{this.hunger=Math.min(20,this.hunger+food);this.saturation=Math.min(this.hunger,this.saturation+food*saturationModifier*2);}
  public addExhaustion(amount:number):void{this.exhaustion=Math.min(40,this.exhaustion+Math.max(0,amount));}
  public canSprint():boolean{return this.isAlive()&&this.hunger>6&&!this.isEating&&!this.inLava;}
  public setMaxHealth(value:number):void{this.maxHealth=Math.max(1,Math.floor(value));this.setHealth(this.health);}
  public setEquipment(equipment: PlayerEquipment): void { this.equipment = equipment; }
  public getArmourValue(): number { return this.equipment?.getArmourValue() ?? 0; }
  public getArmourDamageRemainder(): number { return this.armourDamageRemainder; }

  /** Single authoritative entry point for every Player damage source. */
  public attackEntityFrom(source:DamageSource,amount:number):boolean{
    if(!this.isAlive()||amount<=0)return false;
    let acceptedDamage=amount,fullHit=true;
    if(!source.bypassesInvulnerability&&this.hurtResistantTime>10){
      if(amount<=this.lastDamageAmount)return false;
      acceptedDamage=amount-this.lastDamageAmount;
      this.lastDamageAmount=amount;
      fullHit=false;
    }else{
      this.lastDamageAmount=amount;
      if(!source.bypassesInvulnerability)this.hurtResistantTime=20;
      this.hurtTime=10;
    }

    let healthDamage=acceptedDamage;
    if(!source.bypassesArmour&&this.equipment!==undefined){
      const armourValue=this.equipment.getArmourValue();
      const reduction=reduceDamageByArmour(acceptedDamage,armourValue,this.armourDamageRemainder);
      healthDamage=reduction.healthDamage;
      this.armourDamageRemainder=reduction.remainder;
      this.equipment.damageArmour(acceptedDamage);
    }

    this.lastDamageSource=source;this.lastAttacker=source.attacker;this.recentHealth=this.health;this.healthFlashTicks=20;
    if(fullHit&&source.appliesKnockback&&source.attacker){const dx=this.position.x-source.attacker.position.x,dz=this.position.z-source.attacker.position.z,length=Math.hypot(dx,dz);if(length>1e-6){this.velocity.x+=dx/length*8;this.velocity.z+=dz/length*8;}this.velocity.y=Math.max(this.velocity.y,8);this.attackedAtYaw=Math.atan2(dz,dx)-this.bodyYaw;}
    this.setHealth(this.health-healthDamage);this.addExhaustion(.3);if(this.health===0)this.deathSequence++;return true;
  }
  public attackFromMob(amount:number,attacker:DamageAttacker):boolean{return this.attackEntityFrom(DamageSource.mob(attacker),amount);}

  public resetForRespawn(x:number,y:number,z:number):void{this.position.x=x;this.position.y=y;this.position.z=z;this.velocity.x=this.velocity.y=this.velocity.z=0;this.wishVelocity.x=this.wishVelocity.z=0;this.health=this.maxHealth;this.fallDistance=0;this.fireTicks=0;this.air=this.maxAir;this.hurtResistantTime=0;this.hurtTime=0;this.lastDamageAmount=0;this.armourDamageRemainder=0;this.lastDamageSource=undefined;this.lastAttacker=undefined;this.attackedAtYaw=0;this.grounded=false;this.deathSequence=0;this.recentHealth=this.health;this.healthFlashTicks=0;this.setFoodState(20,5,0);this.foodTimer=this.starvationTimer=0;this.isEating=false;this.foodUseTicks=0;this.foodUseSlot=-1;this.foodUseItem=undefined;this.isSprinting=false;this.inWater=this.inLava=this.headUnderwater=this.collidedHorizontally=false;this.stopBreakingAnimation();}

  public tickCombatState(): void {
    if (this.hurtResistantTime > 0) this.hurtResistantTime -= 1;
    if (this.hurtTime > 0) this.hurtTime -= 1;
    if(this.healthFlashTicks>0)this.healthFlashTicks--;
  }

  public swingItem():void{this.swingTime=0;this.isSwinging=true;}
  public beginBreakingAnimation(restart=false):void{if(restart||this.armAction!=='breaking'){this.breakingSwingPhase=0;this.prevBreakingSwingPhase=0;}this.armAction='breaking';}
  public finishBreakingAnimation():void{if(this.armAction==='breaking')this.armAction='breakingRecover';}
  public stopBreakingAnimation():void{this.armAction='none';this.breakingSwingPhase=this.prevBreakingSwingPhase=0;}

  public updateAnimationState(deltaSeconds: number): void {
    this.prevLimbSwingPhase = this.limbSwingPhase;
    this.prevLimbSwingAmount = this.limbSwingAmount;
    this.prevSwingProgress=this.swingProgress;this.prevBreakingSwingPhase=this.breakingSwingPhase;if(this.armAction==='breaking')this.breakingSwingPhase=(this.breakingSwingPhase+deltaSeconds*3)%1;else if(this.armAction==='breakingRecover'){this.breakingSwingPhase=Math.min(1,this.breakingSwingPhase+deltaSeconds*3);if(this.breakingSwingPhase>=1)this.stopBreakingAnimation();}
    this.prevBodyYaw = this.bodyYaw;

    const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    let targetSwingAmount = 0;
    if (this.grounded && speed > 0.05) {
      targetSwingAmount = Math.min(speed * ANIMATION_MOVEMENT_SPEED_SCALING, 1.0);
    }

    const deltaSwing = targetSwingAmount - this.limbSwingAmount;
    this.limbSwingAmount += deltaSwing * ANIMATION_RETURN_TO_NEUTRAL_SPEED * deltaSeconds;

    // Phase advances based on smoothed swing amount
    this.limbSwingPhase += this.limbSwingAmount * ANIMATION_WALK_SWING_FREQUENCY * deltaSeconds * 20.0;

    if (this.isSwinging) {
      this.swingTime += deltaSeconds;
      if (this.swingTime >= ANIMATION_SWING_DURATION_SECONDS) {
        this.swingTime = 0;
        this.isSwinging = false;
      }
    } else {
      this.swingTime = 0;
    }

    this.swingProgress = this.swingTime / ANIMATION_SWING_DURATION_SECONDS;
  }
}
