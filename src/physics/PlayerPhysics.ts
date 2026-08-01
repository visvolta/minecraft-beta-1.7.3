import { GRAVITY, TERMINAL_VELOCITY } from './physicsConstants';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import { CHUNK_SIZE_Y } from '../world/chunkConstants';
import type { Player } from '../player/Player';
import { BetaCollisionMover } from './BetaCollisionMover';
import type { BlockBehaviourRegistry } from '../world/BlockBehaviour';
import { getBlockBounds } from '../world/BlockBehaviour';
import { BlockIds } from '../blocks/BlockId';

/** Beta `BlockSoulSand.onEntityWalking`: motionX/Z *= 0.4. */
const SOUL_SAND_HORIZONTAL_DRAG = 0.4;
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';import { CREATIVE_FLIGHT_ACCELERATION, CREATIVE_FLIGHT_DRAG_PER_SECOND, CREATIVE_FLIGHT_VERTICAL_SPEED } from '../player/PlayerConstants';import { isLavaInAABB,isWaterInAABB } from '../entities/living/HazardDetection';import { supportDirectionFromAttachedMetadata, supportOffset } from '../blocks/BlockOrientation';import { computeFluidFlowVector } from '../world/fluid/FluidFlowVector';

/**
 * How quickly horizontal velocity is steered toward wishVelocity while
 * standing on solid ground. High value: near-instant stop/start, matching
 * Beta's responsive ground movement.
 */
export const GROUND_ACCELERATION = 70;

/**
 * How quickly horizontal velocity is steered toward wishVelocity while
 * airborne. Deliberately much lower than GROUND_ACCELERATION so momentum
 * is preserved and WASD only gently influences an existing jump/fall,
 * rather than snapping to a new direction like free-fly/creative flight.
 */
export const AIR_ACCELERATION = 5;

/** Beta water-wall escape velocity (0.3 blocks/tick at 20 Hz). */
export const WATER_EXIT_VELOCITY = 6;
/** Minimum downward entry speed required to emit a player splash. */
export const SPLASH_ENTRY_MIN_DOWNWARD_SPEED = 3;

/** Beta-style maximum height the player can step up without jumping. */
const PLAYER_STEP_HEIGHT = 0.6;

/**
 * Gravity integration, horizontal acceleration toward wish velocity, and
 * per-axis AABB-vs-block collision resolution for the player.
 *
 * Queries solid geometry through ChunkManager + BlockRegistry only; does
 * not touch rendering, input, or camera state.
 */
export interface PlayerMovementResult{readonly previousX?:number;readonly previousY:number;readonly previousZ?:number;readonly currentX?:number;readonly currentY:number;readonly currentZ?:number;readonly wasGrounded:boolean;readonly grounded:boolean;readonly climbing:boolean;readonly inWater?:boolean;readonly inLava?:boolean;readonly enteredWaterThisTick?:boolean;readonly splashVolume?:number;}
export class PlayerPhysics {
  private readonly collisionMover: BetaCollisionMover;

  public constructor(
    
    private readonly blockRegistry: BlockRegistry,
    private readonly behaviourRegistry: BlockBehaviourRegistry,
    private readonly blockUpdateWorld: BlockUpdateWorld
  ) {
    this.collisionMover = new BetaCollisionMover(blockRegistry, behaviourRegistry, blockUpdateWorld);
  }

  /**
   * Integrates gravity and horizontal acceleration, then resolves movement
   * against solid blocks. Jumping itself is applied by PlayerController
   * before this runs; this only reacts to whatever velocity.y already is.
   */
  public update(player:Player,deltaSeconds:number,isJumpPressed=false,isDescendPressed=false):PlayerMovementResult{
    const previousX=player.position.x,previousY=player.position.y,previousZ=player.position.z,wasGrounded=player.grounded;
    if (player.ridingEntity !== null) {
      player.wishVelocity.x = 0;
      player.wishVelocity.z = 0;
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.velocity.z = 0;
      player.grounded = false;
      return { previousX, previousY, previousZ, currentX: player.position.x, currentY: player.position.y, currentZ: player.position.z, wasGrounded, grounded: false, climbing: false, inWater: false, inLava: false };
    }
    if (player.isFlying && !player.canFly()) player.isFlying = false;
    if (player.isFlying) return this.updateFlying(player, deltaSeconds, isJumpPressed, isDescendPressed, previousX, previousY, previousZ, wasGrounded);
    const playerBox = player.getAABB();
    const climbRange = this.blockRangeCoveringBox(playerBox);
    let isClimbing = false;

    // Check interaction with triggers and ladders
    for (let bx = climbRange.minX; bx <= climbRange.maxX; bx++) {
      for (let by = climbRange.minY; by <= climbRange.maxY; by++) {
        for (let bz = climbRange.minZ; bz <= climbRange.maxZ; bz++) {
          if (by < 0 || by >= CHUNK_SIZE_Y) continue;
          
          const blockId = this.blockUpdateWorld.getBlock(bx, by, bz);
          if (blockId === 0) continue;
          
          const behaviour = this.behaviourRegistry.get(blockId);
          
          if (behaviour.isClimbable || behaviour.onEntityCollidedWithBlock) {
            const bounds = getBlockBounds(this.blockRegistry, this.behaviourRegistry, this.blockUpdateWorld, bx, by, bz, 'interaction');
            let intersects = false;
            for (const b of bounds) {
              if (playerBox.intersects(b)) {
                intersects = true;
                break;
              }
            }

            if (intersects) {
              if (behaviour.isClimbable) {
                const support = supportDirectionFromAttachedMetadata(this.blockUpdateWorld.getBlockMetadata(bx, by, bz));
                const offset = support === undefined ? undefined : supportOffset(support);
                const pushingIntoLadder = offset !== undefined && (player.wishVelocity.x * offset.x + player.wishVelocity.z * offset.z) > 0.01;
                if (pushingIntoLadder || isJumpPressed || isDescendPressed) isClimbing = true;
              }
              if (behaviour.onEntityCollidedWithBlock) {
                behaviour.onEntityCollidedWithBlock({ world: this.blockUpdateWorld, gameTick: 0 } as any, bx, by, bz, playerBox, player);
              }
            }
          }
        }
      }
    }

    if (isClimbing) {
      player.velocity.y = Math.max(player.velocity.y, -3);
      if (isDescendPressed) {
        player.velocity.y = -3;
      } else if (isJumpPressed || player.wishVelocity.x !== 0 || player.wishVelocity.z !== 0) {
        player.velocity.y = 3;
      }
      player.velocity.x = Math.max(-3, Math.min(3, player.velocity.x * 0.35));
      player.velocity.z = Math.max(-3, Math.min(3, player.velocity.z * 0.35));
    }

    const wasInWater = player.inWater;
    const inWaterBeforeMove=isWaterInAABB(this.blockUpdateWorld,playerBox),inLavaBeforeMove=isLavaInAABB(this.blockUpdateWorld,playerBox);player.inLava=inLavaBeforeMove;if(inLavaBeforeMove)player.isSprinting=false;
    if(inWaterBeforeMove||inLavaBeforeMove){this.applyFluidAcceleration(player,deltaSeconds,inLavaBeforeMove?0.2:0.38);const fx=Math.floor(player.position.x),fy=Math.floor(player.position.y),fz=Math.floor(player.position.z),fluidId=this.blockUpdateWorld.getBlock(fx,fy,fz),flow=computeFluidFlowVector({getBlock:(x,y,z)=>this.blockUpdateWorld.getBlock(x,y,z),getMetadata:(x,y,z)=>this.blockUpdateWorld.getBlockMetadata(x,y,z),isSolid:id=>this.blockRegistry.getById(id)?.solid??false},fx,fy,fz,fluidId);player.velocity.x+=flow.x*deltaSeconds*.8;player.velocity.z+=flow.z*deltaSeconds*.8;const before=player.velocity.y;if(isJumpPressed)player.velocity.y+=deltaSeconds*(inLavaBeforeMove?2:4);else player.velocity.y-=deltaSeconds*(inLavaBeforeMove?2.5:1.5);this.moveAndCollide(player,deltaSeconds,(before+player.velocity.y)/2);const drag=Math.pow(inLavaBeforeMove?0.5:0.8,deltaSeconds*20);player.velocity.x*=drag;player.velocity.y*=drag;player.velocity.z*=drag;if(inWaterBeforeMove&&isJumpPressed&&player.collidedHorizontally&&isWaterInAABB(this.blockUpdateWorld,player.getAABB()))player.velocity.y=Math.max(player.velocity.y,WATER_EXIT_VELOCITY);}else{this.applySneakEdgePrevention(player);this.applyHorizontalAcceleration(player,deltaSeconds);const velocityYBeforeGravity=player.velocity.y;if(!isClimbing)this.applyGravity(player,deltaSeconds);this.moveAndCollide(player,deltaSeconds,(velocityYBeforeGravity+player.velocity.y)/2);}
    const inWaterAfterMove=isWaterInAABB(this.blockUpdateWorld,player.getAABB()),inLavaAfterMove=isLavaInAABB(this.blockUpdateWorld,player.getAABB());
    player.wasInWater=wasInWater;player.inWater=inWaterAfterMove;player.inLava=inLavaAfterMove;player.enteredWaterThisTick=!wasInWater&&inWaterAfterMove;
    const downwardEntrySpeed=deltaSeconds>0?(previousY-player.position.y)/deltaSeconds:0;
    const splashVolume=player.enteredWaterThisTick&&downwardEntrySpeed>=SPLASH_ENTRY_MIN_DOWNWARD_SPEED?Math.min(1,Math.sqrt(player.velocity.x*player.velocity.x*.2+downwardEntrySpeed*downwardEntrySpeed+player.velocity.z*player.velocity.z*.2)*.2):undefined;
    return splashVolume === undefined ? {previousX,previousY,previousZ,currentX:player.position.x,currentY:player.position.y,currentZ:player.position.z,wasGrounded,grounded:player.grounded,climbing:isClimbing,inWater:inWaterAfterMove,inLava:inLavaAfterMove,enteredWaterThisTick:player.enteredWaterThisTick} : {previousX,previousY,previousZ,currentX:player.position.x,currentY:player.position.y,currentZ:player.position.z,wasGrounded,grounded:player.grounded,climbing:isClimbing,inWater:inWaterAfterMove,inLava:inLavaAfterMove,enteredWaterThisTick:player.enteredWaterThisTick,splashVolume};
  }



  private updateFlying(player: Player, deltaSeconds: number, ascend: boolean, descend: boolean, previousX: number, previousY: number, previousZ: number, wasGrounded: boolean): PlayerMovementResult {
    player.fallDistance = 0;
    player.grounded = false;
    player.inWater = false;
    player.inLava = false;
    const maxStep = CREATIVE_FLIGHT_ACCELERATION * deltaSeconds;
    player.velocity.x = this.stepToward(player.velocity.x, player.wishVelocity.x, maxStep);
    player.velocity.z = this.stepToward(player.velocity.z, player.wishVelocity.z, maxStep);
    const verticalTarget = ascend && !descend ? CREATIVE_FLIGHT_VERTICAL_SPEED : (descend && !ascend ? -CREATIVE_FLIGHT_VERTICAL_SPEED : 0);
    player.velocity.y = this.stepToward(player.velocity.y, verticalTarget, maxStep);
    this.moveAndCollide(player, deltaSeconds, player.velocity.y);
    if (player.isCollidedVertically) player.velocity.y = 0;
    const drag = Math.max(0, 1 - CREATIVE_FLIGHT_DRAG_PER_SECOND * deltaSeconds);
    if (Math.abs(player.wishVelocity.x) < 1e-6) player.velocity.x *= drag;
    if (Math.abs(player.wishVelocity.z) < 1e-6) player.velocity.z *= drag;
    if (!ascend && !descend) player.velocity.y *= drag;
    return { previousX, previousY, previousZ, currentX: player.position.x, currentY: player.position.y, currentZ: player.position.z, wasGrounded, grounded: player.grounded, climbing: false, inWater: false, inLava: false };
  }

  private applyFluidAcceleration(player:Player,deltaSeconds:number,speedFactor:number):void{const maxStep=3*deltaSeconds;player.velocity.x=this.stepToward(player.velocity.x,player.wishVelocity.x*speedFactor,maxStep);player.velocity.z=this.stepToward(player.velocity.z,player.wishVelocity.z*speedFactor,maxStep);}

  /**
   * Beta sneak edge prevention (`EntityPlayerSP`): while sneaking on solid
   * ground, walking off an edge is disallowed. If the horizontal move would
   * carry the player's centre over a cell whose block at foot level is air
   * and whose block below is non-solid (i.e. a real drop), the wish velocity
   * is zeroed so the player stops at the lip instead of stepping off.
   */
  private applySneakEdgePrevention(player: Player): void {
    if (!player.isSneaking || !player.grounded) return;
    if (player.wishVelocity.x === 0 && player.wishVelocity.z === 0) return;

    const dirX = Math.sign(player.wishVelocity.x);
    const dirZ = Math.sign(player.wishVelocity.z);
    const feetX = Math.floor(player.position.x);
    const feetY = Math.floor(player.position.y + 0.05);
    const feetZ = Math.floor(player.position.z);

    // Examine the cell the horizontal velocity points into (both axes
    // independently so diagonal edge-walking is handled correctly).
    const checkCell = (dx: number, dz: number): boolean => {
      const aheadId = this.blockUpdateWorld.getBlock(feetX + dx, feetY, feetZ + dz);
      const belowId = this.blockUpdateWorld.getBlock(feetX + dx, feetY - 1, feetZ + dz);
      const belowSolid = this.blockRegistry.getById(belowId)?.solid === true;
      // An edge is where the foot-level block ahead is air and there is no
      // solid floor underneath that cell.
      return aheadId === BlockIds.Air && !belowSolid;
    };

    let blocked = false;
    if (dirX !== 0 && checkCell(dirX, 0)) blocked = true;
    if (dirZ !== 0 && checkCell(0, dirZ)) blocked = true;

    if (blocked) {
      player.wishVelocity.x = 0;
      player.wishVelocity.z = 0;
      player.velocity.x = 0;
      player.velocity.z = 0;
    }
  }

  private applyHorizontalAcceleration(player: Player, deltaSeconds: number): void {
    const acceleration = player.grounded ? GROUND_ACCELERATION : AIR_ACCELERATION;
    const maxStep = acceleration * deltaSeconds;

    player.velocity.x = this.stepToward(player.velocity.x, player.wishVelocity.x, maxStep);
    player.velocity.z = this.stepToward(player.velocity.z, player.wishVelocity.z, maxStep);
  }

  /** Moves `current` toward `target` by at most `maxStep`, never overshooting. */
  private stepToward(current: number, target: number, maxStep: number): number {
    const difference = target - current;

    if (Math.abs(difference) <= maxStep) {
      return target;
    }

    return current + Math.sign(difference) * maxStep;
  }

  private applyGravity(player: Player, deltaSeconds: number): void {
    player.velocity.y -= GRAVITY * deltaSeconds;

    if (player.velocity.y < -TERMINAL_VELOCITY) {
      player.velocity.y = -TERMINAL_VELOCITY;
    }
  }

  /**
   * Resolves movement one axis at a time (order: COLLISION_AXIS_ORDER),
   * so a collision on one axis cannot mask or distort resolution on
   * another. Grounded state is derived entirely from the Y-axis step.
   *
   * `displacementVelocityY` is the (possibly averaged, see update())
   * vertical speed used only for this frame's Y displacement; X/Z use
   * player.velocity directly since they have no acceleration within a
   * single physics step (wish-velocity stepping already happened).
   */
  private moveAndCollide(
    player: Player,
    deltaSeconds: number,
    displacementVelocityY: number,
  ): void {
    const dx = player.velocity.x * deltaSeconds;
    const dy = displacementVelocityY * deltaSeconds;
    const dz = player.velocity.z * deltaSeconds;
    const wasGrounded = player.grounded;

    const result = this.collisionMover.move(player, dx, dy, dz, {
      stepHeight: wasGrounded ? PLAYER_STEP_HEIGHT : 0,
      wasGrounded,
    });

    if (result.collidedX) player.velocity.x = 0;
    if (result.collidedY) player.velocity.y = 0;
    if (result.collidedZ) player.velocity.z = 0;

    player.grounded = result.grounded;
    player.onGround = result.grounded;
    player.collidedHorizontally = result.collidedHorizontally;
    player.isCollidedHorizontally = result.collidedHorizontally;
    player.isCollidedVertically = result.collidedVertically;

    this.applyWalkedBlockDrag(player);
  }

  private applyWalkedBlockDrag(player: Player): void {
    const blockX = Math.floor(player.position.x);
    const blockY = Math.floor(player.position.y - 0.2);
    const blockZ = Math.floor(player.position.z);
    if (this.blockUpdateWorld.getBlock(blockX, blockY, blockZ) !== BlockIds.SoulSand) return;
    player.velocity.x *= SOUL_SAND_HORIZONTAL_DRAG;
    player.velocity.z *= SOUL_SAND_HORIZONTAL_DRAG;
  }

  private blockRangeCoveringBox(box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }): {
    minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
  } {
    return {
      minX: Math.floor(box.minX),
      maxX: Math.ceil(box.maxX) - 1,
      minY: Math.floor(box.minY),
      maxY: Math.ceil(box.maxY) - 1,
      minZ: Math.floor(box.minZ),
      maxZ: Math.ceil(box.maxZ) - 1,
    };
  }

  /** Looks up a world-space block position via ChunkManager + BlockRegistry. */
}
