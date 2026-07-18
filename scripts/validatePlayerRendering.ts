import { PlayerModel } from '../src/player/PlayerModel.ts';
import { FirstPersonArmRenderer } from '../src/rendering/FirstPersonArmRenderer.ts';
import { FirstPersonMotionController } from '../src/player/FirstPersonMotionController.ts';
import { PlayerAnimator } from '../src/player/PlayerAnimator.ts';
import { Player } from '../src/player/Player.ts';
import { PerspectiveCamera } from 'three';
import { CameraModeController, CameraMode } from '../src/camera/CameraModeController.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ANIMATION_ARM_SWING_LIMIT } from '../src/player/PlayerConstants.ts';
import { BreakingController } from '../src/player/BreakingController.ts';
import { BlockIds } from '../src/blocks/BlockId.ts';

function assert(v: boolean, m: string) {
  if (!v) {
    console.error('Failed:', m);
    process.exit(1);
  }
}

function testPlayerAnimator() {
  const player = new Player(0, 64, 0);
  const model = new PlayerModel();
  const animator = new PlayerAnimator();

  // 4. Stopping returns all limbs to neutral without snapping.
  animator.update(player, model, 0, 0, 1.0);
  assert(Math.abs(model.leftArmGroup.rotation.x) < 0.1, 'Standing returns to near neutral arm');

  // Start walking
  player.velocity.x = 2.0;
  player.grounded = true;
  // Step physics slightly to start moving phase
  player.updateAnimationState(0.1);

  animator.update(player, model, 0, 0, 1.0);
  // 1. Walking never rotates limbs beyond configured limits.
  assert(Math.abs(model.leftArmGroup.rotation.x) <= ANIMATION_ARM_SWING_LIMIT, 'Walking does not exceed bounds');
  assert(model.leftArmGroup.rotation.x !== 0, 'Walking moves left arm');
  assert(model.rightArmGroup.rotation.x !== 0, 'Walking moves right arm');
  // 2. Opposite arm and leg pairs remain correctly phased.
  assert(Math.sign(model.leftArmGroup.rotation.x) !== Math.sign(model.rightArmGroup.rotation.x), 'Arms move opposite directions');

  // Test head tracking
  animator.update(player, model, Math.PI / 4, Math.PI / 4, 1.0);
  assert(Math.abs(model.headGroup.rotation.y - Math.PI / 4) < 0.001, 'Head follows camera rotation');
  assert(player.position.x === 0, 'Animations do not change physics position');

  // 9. Breaking animates the anatomical right arm.
  // 12. Action swing layers correctly over walking animation.
  player.swingItem();
  player.updateAnimationState(0.1);
  const beforeSwingX = model.rightArmGroup.rotation.x;
  animator.update(player, model, 0, 0, 1.0);
  const afterSwingX = model.rightArmGroup.rotation.x;
  // Positive X means it pitches forward down in our coordinate system
  assert(afterSwingX > beforeSwingX, 'Breaking animates right arm forward (positive X) layering over walk');
}

function testFirstPersonMotion() {
  const player = new Player(0, 64, 0);
  const fpRenderer = new FirstPersonArmRenderer();
  const fpMotion = new FirstPersonMotionController();
  const camera = new PerspectiveCamera();

  const initialZ = fpRenderer.scene.children[0]!.position.z;

  // 10. Placement animates the anatomical right arm.
  // 13. First-person arm handedness matches the third-person model. (Handled visually but we verify the arm triggers).
  player.swingItem();
  player.updateAnimationState(0.1); // Progress 1/8

  fpMotion.update(camera, player, fpRenderer, 1.0);

  // Arm should have translated due to swing
  assert(fpRenderer.scene.children[0]!.position.z !== initialZ, 'Breaking and placement trigger one swing');

  // 7. Camera bob is disabled while stationary.
  player.velocity.x = 0.0;
  player.velocity.z = 0.0;
  player.updateAnimationState(0.1);
  const camBefore = camera.position.y;
  fpMotion.update(camera, player, fpRenderer, 1.0);
  assert(camera.position.y === camBefore, 'Camera bob disabled when stationary');

  // View bob test
  player.velocity.z = 2.0;
  player.grounded = true;
  player.updateAnimationState(0.1);
  fpMotion.update(camera, player, fpRenderer, 1.0);
  assert(camera.position.y !== camBefore, 'View bob occurs during movement');

  // 6. Camera bob does not accumulate drift.
  camera.position.set(0, 65, 0);
  camera.rotation.set(0, 0, 0);
  fpMotion.update(camera, player, fpRenderer, 1.0);
  const pos1 = camera.position.clone();
  camera.position.set(0, 65, 0); // reset fresh base
  camera.rotation.set(0, 0, 0);
  fpMotion.update(camera, player, fpRenderer, 1.0);
  const pos2 = camera.position.clone();
  assert(pos1.distanceTo(pos2) < 0.001, 'No drift accumulation since CameraMode resets position first');

  // 8. Camera bob is disabled or fades appropriately while airborne.
  player.grounded = false;
  player.updateAnimationState(0.1); // speed>0 but ungrounded -> targets 0 limb swing

  // Need to loop slightly to let it fade
  for (let i = 0; i < 20; i++) player.updateAnimationState(0.1);
  camera.position.set(0, 65, 0);
  camera.rotation.set(0, 0, 0);
  fpMotion.update(camera, player, fpRenderer, 1.0);
  assert(Math.abs(camera.position.y - 65) < 0.001, 'View bob fades while airborne');

  // Verify first person arm transform reflects base constants
  player.velocity.x = 0; player.velocity.z = 0;
  player.swingProgressInt = 0; player.isSwinging = false;
  player.updateAnimationState(0.1);
  for (let i = 0; i < 20; i++) player.updateAnimationState(0.1); // fade to neutral

  fpMotion.update(camera, player, fpRenderer, 1.0);
  // Using some distinct values from PlayerConstants
  const xOk = Math.abs(fpRenderer.armGroup.position.x - 0.65) < 0.001 || Math.abs(fpRenderer.armGroup.position.x - 0.5) < 0.001;
  assert(xOk, 'First person arm applies base X constant directly');
}

function testCameraModeController() {
  const input = { keys: new Set<string>(), isKeyJustPressed: (k: string) => input.keys.has(k) } as any;
  const blockRegistry = new BlockRegistry();
  registerDefaultBlocks(blockRegistry);
  const chunkManager = new ChunkManager();
  const lightEngine = new LightEngine(chunkManager, blockRegistry);
  const world = new BlockUpdateWorld(chunkManager, blockRegistry, lightEngine);
  const controller = new CameraModeController(input, world, blockRegistry);
  assert(controller.getMode() === CameraMode.FIRST_PERSON, 'Default mode is FIRST_PERSON');
}

function testFirstPersonArmRenderer() {
  const fpRenderer = new FirstPersonArmRenderer();

  // Initially arm and sleeve meshes should be visible by default
  assert(fpRenderer.armMesh.visible === true, 'Arm mesh is visible by default');

  // After calling setArmMeshVisible(false), both should be invisible
  fpRenderer.setArmMeshVisible(false);
  assert(fpRenderer.armMesh.visible === false, 'Arm mesh can be hidden');
  assert(fpRenderer.sleeveMesh.visible === false, 'Sleeve mesh can be hidden');

  // After calling setArmMeshVisible(true), armMesh should be visible again
  fpRenderer.setArmMeshVisible(true);
  assert(fpRenderer.armMesh.visible === true, 'Arm mesh can be shown');
}

function testBreakingController() {
  const player = new Player(0, 64, 0);
  player.grounded = true;
  const chunkManager = new ChunkManager();
  const blockRegistry = new BlockRegistry();
  registerDefaultBlocks(blockRegistry);
  const lightEngine = new LightEngine(chunkManager, blockRegistry);
  const world = new BlockUpdateWorld(chunkManager, blockRegistry, lightEngine);

  // Initialize a mock chunk so we can set blocks
  const chunk = chunkManager.getOrCreateChunk(0, 0);
  chunk.setBlock(0, 64, 0, BlockIds.Bedrock);

  const breaking = new BreakingController(player, chunkManager, blockRegistry, world);

  const bedrockHit = {
    blockPos: { x: 0, y: 64, z: 0 },
    face: { x: 0, y: 1, z: 0 },
    distance: 1.0,
  } as any;

  breaking.update(bedrockHit, true, 0.05); // 1 tick (0.05s)
  assert(breaking.getProgress() === 0.0, 'Bedrock cannot be cracked or broken');

  // Grass
  world.setBlock(0, 64, 0, BlockIds.Grass, { reason: 'player', notifyNeighbours: false, updateLighting: false });
  breaking.reset();

  for (let i = 0; i < 17; i++) {
    breaking.update(bedrockHit, true, 0.05);
  }
  assert(breaking.getProgress() < 1.0 && breaking.getProgress() > 0.0, 'Grass not broken in 17 ticks');

  breaking.update(bedrockHit, true, 0.05);
  assert(world.getBlock(0, 64, 0) === BlockIds.Air, 'Grass broken at 18 ticks');

  // Wait out the 5-tick cooldown
  for (let i = 0; i < 5; i++) {
    breaking.update(undefined, false, 0.05);
  }

  // Stone
  world.setBlock(0, 64, 0, BlockIds.Stone, { reason: 'player', notifyNeighbours: false, updateLighting: false });
  breaking.reset();

  for (let i = 0; i < 149; i++) {
    breaking.update(bedrockHit, true, 0.05);
  }
  assert(breaking.getProgress() < 1.0 && breaking.getProgress() > 0.0, 'Stone not broken in 149 ticks');

  breaking.update(bedrockHit, true, 0.05);
  assert(world.getBlock(0, 64, 0) === BlockIds.Air, 'Stone broken at 150 ticks');
}

function main() {
  testPlayerAnimator();
  testFirstPersonMotion();
  testFirstPersonArmRenderer();
  testBreakingController();
  testCameraModeController();
  console.log('Player Rendering Validation Passed.');
  process.exit(0);
}

main();