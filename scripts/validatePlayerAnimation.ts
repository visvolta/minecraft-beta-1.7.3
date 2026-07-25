import { Entity } from '../src/entities/core/Entity.ts';
import type { EntityTickContext } from '../src/entities/core/EntityContext.ts';
import type { NbtCompound, NbtTag } from '../src/nbt/Nbt.ts';
import { Player } from '../src/player/Player.ts';
import { PlayerAnimator, getPlayerAnimationState } from '../src/player/PlayerAnimator.ts';
import { PlayerModel } from '../src/player/PlayerModel.ts';
import { GameMode } from '../src/player/GameMode.ts';
import { ANIMATION_ARM_SWING_LIMIT, ANIMATION_LEG_SWING_LIMIT } from '../src/player/PlayerConstants.ts';
import { assert, assertEqual, runSuite, type TestCase } from './persistence2Harness.ts';

class DummyVehicle extends Entity {
  public readonly typeId = -1;
  public readonly typeStringId = 'DummyVehicle';
  public onTick(_ctx: EntityTickContext): void {}
  protected writeEntityNbt(_map: Map<string, NbtTag>): void {}
  protected readEntityNbt(_data: NbtCompound): void {}
}

function finiteRotation(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} is finite`);
}

const tests: TestCase[] = [
  {
    name: 'player animation state selection follows grounded, airborne, flying and riding state',
    run: async () => {
      const player = new Player(0, 64, 0);
      player.grounded = true;
      player.velocity.x = 0;
      player.velocity.z = 0;
      assertEqual(getPlayerAnimationState(player), 'idle', 'grounded stationary player is idle');
      player.velocity.x = 0.2;
      assertEqual(getPlayerAnimationState(player), 'walking', 'grounded moving player is walking');
      player.grounded = false;
      player.velocity.y = 0.1;
      assertEqual(getPlayerAnimationState(player), 'jumping', 'upward airborne player is jumping');
      player.velocity.y = -0.1;
      assertEqual(getPlayerAnimationState(player), 'falling', 'downward airborne player is falling');
      player.setGameMode(GameMode.Creative);
      player.isFlying = true;
      assertEqual(getPlayerAnimationState(player), 'flying', 'creative flying state wins over airborne state');
      const vehicle = new DummyVehicle();
      vehicle.setPosition(0, 64, 0);
      assert(player.mountEntity(vehicle), 'player can mount validation vehicle');
      assertEqual(getPlayerAnimationState(player), 'minecart_sitting', 'riding state wins over flying state');
    },
  },
  {
    name: 'player animator updates pose without moving the player or exceeding configured limb bounds',
    run: async () => {
      const player = new Player(1, 65, 2);
      const model = new PlayerModel();
      const animator = new PlayerAnimator();
      player.grounded = true;
      player.velocity.x = 2;
      player.velocity.z = 0;
      player.updateAnimationState(0.1);
      animator.update(player, model, Math.PI / 4, Math.PI / 8, 1, 1 / 60);
      assertEqual(player.position.x, 1, 'animation does not move player x');
      assertEqual(player.position.y, 65, 'animation does not move player y');
      assertEqual(player.position.z, 2, 'animation does not move player z');
      finiteRotation(model.rightArmGroup.rotation.x, 'right arm x rotation');
      finiteRotation(model.leftArmGroup.rotation.x, 'left arm x rotation');
      finiteRotation(model.rightLegGroup.rotation.x, 'right leg x rotation');
      finiteRotation(model.leftLegGroup.rotation.x, 'left leg x rotation');
      assert(Math.abs(model.rightArmGroup.rotation.x) <= ANIMATION_ARM_SWING_LIMIT + 0.2, 'right arm remains within walk/swing bounds');
      assert(Math.abs(model.leftArmGroup.rotation.x) <= ANIMATION_ARM_SWING_LIMIT + 0.2, 'left arm remains within walk/swing bounds');
      assert(Math.abs(model.rightLegGroup.rotation.x) <= ANIMATION_LEG_SWING_LIMIT + 0.2, 'right leg remains within walk bounds');
      assert(Math.abs(model.leftLegGroup.rotation.x) <= ANIMATION_LEG_SWING_LIMIT + 0.2, 'left leg remains within walk bounds');
      assert(Math.abs(model.headGroup.rotation.y - Math.PI / 4) < 1e-6, 'head yaw follows camera yaw');
      model.dispose();
    },
  },
];

await runSuite('validatePlayerAnimation', tests);
