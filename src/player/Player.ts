import { AABB } from '../physics/AABB';
import { Entity } from '../entities/core/Entity';
import type { EntityTickContext } from '../entities/core/EntityContext';
import type { NbtCompound, NbtTag } from '../nbt/Nbt';
import { DamageSource, type DamageAttacker } from '../entities/damage/DamageSource';
import { GameMode, isCreativeMode, isSurvivalMode } from './GameMode';
import type { PlayerEquipment } from '../inventory/PlayerEquipment';
import { reduceDamageByArmour } from './ArmourProtection';
import {
  BETA_BODY_DRAG_RATE, BETA_BODY_DRAG_THRESHOLD_SQUARED, BETA_BODY_HEAD_CLAMP,
  BETA_BODY_YAW_FOLLOW, BETA_LIMB_SWING_DISTANCE_SCALE, BETA_LIMB_SWING_MOVE_THRESHOLD,
  BETA_LIMB_SWING_SMOOTHING,
} from './PlayerConstants';

/**
 * Wraps an angle delta into [-PI, PI). Beta does this in degrees with
 * while-loops; this project stores yaw in radians, so the same clamp is
 * expressed in radians to avoid a unit conversion at every call site.
 */
function wrapRadiansPi(value: number): number {
  let v = value;
  while (v < -Math.PI) v += Math.PI * 2;
  while (v >= Math.PI) v -= Math.PI * 2;
  return v;
}

const DEG_TO_RAD = Math.PI / 180;
import {
  ANIMATION_SWING_DURATION_SECONDS,
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
export interface PlayerDamageEvent { readonly source: DamageSource; readonly amount: number; readonly lethal: boolean; readonly fullHit: boolean; }

export class Player extends Entity {
  public readonly typeId = 0;
  public readonly typeStringId = 'Player';
  public gameMode: GameMode = GameMode.Survival;
  public isFlying = false;
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
  public isSprinting=false;public inWater=false;public wasInWater=false;public enteredWaterThisTick=false;public inLava=false;public headUnderwater=false;public collidedHorizontally=false;public viewBobbingEnabled=true;
  private equipment: PlayerEquipment | undefined;
  private armourDamageRemainder = 0;
  private damageListener: ((event: PlayerDamageEvent) => void) | undefined;

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
  public cameraYaw = 0;
  public prevCameraYaw = 0;
  public cameraPitch = 0;
  public prevCameraPitch = 0;
  public animationAgeTicks = 0;

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
    super();
    this.setSize(PLAYER_WIDTH, PLAYER_HEIGHT);
    this.setPosition(spawnX, spawnY, spawnZ);
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
  public isBurning(): boolean { return this.fireTicks > 0; }
  public isCreativeMode(): boolean { return isCreativeMode(this.gameMode); }
  public isSurvivalMode(): boolean { return isSurvivalMode(this.gameMode); }
  public setGameMode(mode: GameMode): void { this.gameMode = mode; if (!this.isCreativeMode()) { this.isFlying = false; } this.fallDistance = 0; }
  public canFly(): boolean { return this.isCreativeMode(); }


  public setHealth(value:number):void{this.health=Math.max(0,Math.min(this.maxHealth,value));}
  public setFoodState(hunger:number,saturation:number,exhaustion=0):void{this.hunger=Math.max(0,Math.min(20,hunger));this.saturation=Math.max(0,Math.min(this.hunger,saturation));this.exhaustion=Math.max(0,exhaustion);}
  public addFood(food:number,saturationModifier:number):void{this.hunger=Math.min(20,this.hunger+food);this.saturation=Math.min(this.hunger,this.saturation+food*saturationModifier*2);}
  public addExhaustion(amount:number):void{if(this.isCreativeMode())return;this.exhaustion=Math.min(40,this.exhaustion+Math.max(0,amount));}
  public canSprint():boolean{return this.isAlive()&&(this.isCreativeMode()||this.hunger>6)&&!this.isEating&&!this.inLava&&!this.isFlying;}
  public setMaxHealth(value:number):void{this.maxHealth=Math.max(1,Math.floor(value));this.setHealth(this.health);}
  public setEquipment(equipment: PlayerEquipment): void { this.equipment = equipment; }
  public getArmourValue(): number { return this.equipment?.getArmourValue() ?? 0; }
  public getArmourDamageRemainder(): number { return this.armourDamageRemainder; }
  public setDamageListener(listener: ((event: PlayerDamageEvent) => void) | undefined): void { this.damageListener = listener; }

  /** Single authoritative entry point for every Player damage source. */
  public attackEntityFrom(source:DamageSource,amount:number):boolean{
    if(!this.isAlive()||amount<=0||this.isCreativeMode())return false;
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
    if(fullHit&&source.appliesKnockback&&source.attacker){const dx=this.position.x-source.attacker.position.x,dz=this.position.z-source.attacker.position.z,length=Math.hypot(dx,dz);this.velocity.x*=0.5;this.velocity.z*=0.5;if(length>1e-6){this.velocity.x+=dx/length*0.4;this.velocity.z+=dz/length*0.4;}this.velocity.y+=0.4;if(this.velocity.y>0.4)this.velocity.y=0.4;this.attackedAtYaw=Math.atan2(dz,dx)-this.bodyYaw;}
    this.setHealth(this.health-healthDamage);this.addExhaustion(.3);if(this.health===0)this.deathSequence++;this.damageListener?.({ source, amount: healthDamage, lethal: this.health === 0, fullHit });return true;
  }
  public attackFromMob(amount:number,attacker:DamageAttacker):boolean{return this.attackEntityFrom(DamageSource.mob(attacker),amount);}

  /**
   * Places the player at a portal destination after a dimension switch.
   *
   * Unlike a respawn this preserves the player entirely — health, hunger,
   * inventory, air and fire all carry across dimensions in Beta. Only
   * position and motion are reset: arriving with the velocity accumulated
   * while walking into the source portal would fling the player out of the
   * destination frame, and a stale fallDistance would deal fall damage on
   * arrival.
   */
  public resetForPortalArrival(x: number, y: number, z: number): void {
    this.setPosition(x, y, z);
    this.position.x = x;
    this.position.y = y;
    this.position.z = z;
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.wishVelocity.x = this.wishVelocity.z = 0;
    this.fallDistance = 0;
    this.grounded = false;
    this.collidedHorizontally = false;
    this.inWater = this.wasInWater = this.enteredWaterThisTick = this.inLava = this.headUnderwater = false;
    this.stopBreakingAnimation();
  }

  public resetForRespawn(x:number,y:number,z:number):void{this.mountEntity(null);this.isFlying=false;this.position.x=x;this.position.y=y;this.position.z=z;this.velocity.x=this.velocity.y=this.velocity.z=0;this.wishVelocity.x=this.wishVelocity.z=0;this.health=this.maxHealth;this.fallDistance=0;this.fireTicks=0;this.air=this.maxAir;this.hurtResistantTime=0;this.hurtTime=0;this.lastDamageAmount=0;this.armourDamageRemainder=0;this.lastDamageSource=undefined;this.lastAttacker=undefined;this.attackedAtYaw=0;this.grounded=false;this.deathSequence=0;this.recentHealth=this.health;this.healthFlashTicks=0;this.setFoodState(20,5,0);this.foodTimer=this.starvationTimer=0;this.isEating=false;this.foodUseTicks=0;this.foodUseSlot=-1;this.foodUseItem=undefined;this.isSprinting=false;this.inWater=this.wasInWater=this.enteredWaterThisTick=this.inLava=this.headUnderwater=this.collidedHorizontally=false;this.stopBreakingAnimation();}

  public tickCombatState(): void {
    if (this.hurtResistantTime > 0) this.hurtResistantTime -= 1;
    if (this.hurtTime > 0) this.hurtTime -= 1;
    if(this.healthFlashTicks>0)this.healthFlashTicks--;
  }

  public swingItem():void{this.swingTime=0;this.isSwinging=true;}
  public beginBreakingAnimation(restart=false):void{if(restart||this.armAction!=='breaking'){this.breakingSwingPhase=0;this.prevBreakingSwingPhase=0;}this.armAction='breaking';}
  public finishBreakingAnimation():void{if(this.armAction==='breaking')this.armAction='breakingRecover';}
  public stopBreakingAnimation():void{this.armAction='none';this.breakingSwingPhase=this.prevBreakingSwingPhase=0;}



  public onTick(_ctx: EntityTickContext): void {
    // The local player is advanced by PlayerController/PlayerPhysics, not by EntityManager.
  }

  protected writeEntityNbt(_map: Map<string, NbtTag>): void {
    // Player persistence is handled by WorldMetadata, not chunk entity NBT.
  }

  protected readEntityNbt(_data: NbtCompound): void {
    // Player persistence is handled by WorldMetadata, not chunk entity NBT.
  }

  /**
   * Advances the Beta limb-swing / body-yaw state.
   *
   * @param headYawRadians Where the player is LOOKING (camera yaw). Beta's
   *   `rotationYaw`. The body chases the travel direction but is clamped
   *   relative to this, which is what produces correct strafing and turning.
   */
  public updateAnimationState(deltaSeconds: number, headYawRadians = this.bodyYaw): void {
    this.prevLimbSwingPhase = this.limbSwingPhase;
    this.prevLimbSwingAmount = this.limbSwingAmount;
    this.prevDistanceWalkedModified = this.distanceWalkedModified;
    this.prevCameraYaw = this.cameraYaw;
    this.prevCameraPitch = this.cameraPitch;
    this.animationAgeTicks += Math.max(0, deltaSeconds) * 20;
    this.prevSwingProgress=this.swingProgress;this.prevBreakingSwingPhase=this.breakingSwingPhase;if(this.armAction==='breaking')this.breakingSwingPhase=(this.breakingSwingPhase+deltaSeconds*3)%1;else if(this.armAction==='breakingRecover'){this.breakingSwingPhase=Math.min(1,this.breakingSwingPhase+deltaSeconds*3);if(this.breakingSwingPhase>=1)this.stopBreakingAnimation();}
    this.prevBodyYaw = this.bodyYaw;

    // ---- Beta `EntityLiving.onUpdate` body-yaw / limb-swing block ----------
    //
    // Beta derives BOTH the walk cycle and the body yaw from the actual
    // horizontal position delta, not from the velocity vector or from forward
    // speed alone. That single detail is what makes strafing, turning and
    // backwards movement read correctly: the body turns to face the direction
    // of travel, and the walk cycle plays in reverse when the player is
    // moving backwards relative to where they are looking.
    //
    //   var5 = sqrt(dx*dx + dz*dz)                     // distance moved
    //   if (var5 > 0.05) { var8 = 1; var7 = var5 * 3; var6 = atan2(dz,dx) ... }
    //   if (swingProgress > 0) var6 = rotationYaw      // face aim while swinging
    //   if (!onGround) var8 = 0                        // no swing airborne
    //   field_9361_v += (var8 - field_9361_v) * 0.3    // limbSwingAmount
    //   renderYawOffset += wrap(var6 - renderYawOffset) * 0.3
    //   var10 = clamp(wrap(rotationYaw - renderYawOffset), -75, 75)
    //   renderYawOffset = rotationYaw - var10
    //   if (var10*var10 > 2500) renderYawOffset += var10 * 0.2
    //   if (var11) var7 *= -1                          // walking backwards
    //   field_9360_w += var7                           // limbSwingPhase
    const deltaX = this.position.x - this.previousPosition.x;
    const deltaZ = this.position.z - this.previousPosition.z;
    const moved = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);

    let bodyTarget = this.bodyYaw;
    let swingTarget = 0;
    let phaseAdvance = 0;
    if (moved > BETA_LIMB_SWING_MOVE_THRESHOLD) {
      swingTarget = 1;
      phaseAdvance = moved * BETA_LIMB_SWING_DISTANCE_SCALE;
      // Beta's atan2(dz, dx) - 90 gives the travel direction in its yaw
      // convention; this project's yaw convention matches it after the same
      // -90 degree shift.
      // Beta: atan2(dz, dx) - 90 degrees, expressed in radians. The project's
      // yaw convention negates X/Z the same way the camera does.
      bodyTarget = Math.atan2(-deltaX, -deltaZ);
    }
    // While swinging, Beta snaps the body to the aim direction so an attack
    // always faces the target.
    if (this.swingProgress > 0) bodyTarget = headYawRadians;
    // Airborne keeps a reduced locomotion influence from horizontal momentum.
    if (!this.grounded) swingTarget *= 0.45;

    const tickScale = Math.max(0, deltaSeconds) * 20;
    const limbSmoothing = 1 - Math.pow(1 - BETA_LIMB_SWING_SMOOTHING, tickScale);
    const bodySmoothing = 1 - Math.pow(1 - BETA_BODY_YAW_FOLLOW, tickScale);
    this.limbSwingAmount += (swingTarget - this.limbSwingAmount) * limbSmoothing;
    this.distanceWalkedModified += moved;
    const bobTarget = this.grounded && !this.isFlying ? Math.min(1, moved * 4) : 0;
    this.cameraYaw += (bobTarget - this.cameraYaw) * limbSmoothing;
    this.cameraPitch += (0 - this.cameraPitch) * limbSmoothing;

    // Body chases the travel/aim direction at Beta's 30% per tick.
    this.bodyYaw += wrapRadiansPi(bodyTarget - this.bodyYaw) * bodySmoothing;

    // Head/body separation is clamped to +/-75 degrees; beyond 50 degrees the
    // body is dragged along so the player cannot stay owl-necked.
    let headBodyDelta = wrapRadiansPi(headYawRadians - this.bodyYaw);
    const walkingBackwards = headBodyDelta < -Math.PI / 2 || headBodyDelta >= Math.PI / 2;
    const clampRad = BETA_BODY_HEAD_CLAMP * DEG_TO_RAD;
    headBodyDelta = Math.max(-clampRad, Math.min(clampRad, headBodyDelta));
    this.bodyYaw = headYawRadians - headBodyDelta;
    const dragThresholdRad = Math.sqrt(BETA_BODY_DRAG_THRESHOLD_SQUARED) * DEG_TO_RAD;
    if (Math.abs(headBodyDelta) > dragThresholdRad) {
      this.bodyYaw += headBodyDelta * BETA_BODY_DRAG_RATE;
    }

    // Beta plays the walk cycle in reverse when travelling backwards.
    if (walkingBackwards) phaseAdvance *= -1;
    this.limbSwingPhase += phaseAdvance;

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
