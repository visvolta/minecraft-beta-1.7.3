import { CameraModeController, CameraMode } from '../src/camera/CameraModeController.ts';
import { PlayerModel } from '../src/player/PlayerModel.ts';
import { FirstPersonArmRenderer } from '../src/rendering/FirstPersonArmRenderer.ts';
import { Player } from '../src/player/Player.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { PerspectiveCamera, Group, Mesh } from 'three';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { Chunk } from '../src/world/Chunk.ts';

function assert(v: boolean, m: string) {
  if (!v) {
    console.error('Failed:', m);
    process.exit(1);
  }
}

function testPlayerModelDimensions() {
  const model = new PlayerModel();
  // 1 pixel = 1/16 block
  const px = 1/16;
  
  // Head
  const headMesh = model.headGroup.children[0] as Mesh;
  const hg = headMesh.geometry as any;
  assert(hg.parameters.width === 8 * px, 'Head width is 8px');
  assert(hg.parameters.height === 8 * px, 'Head height is 8px');
  assert(hg.parameters.depth === 8 * px, 'Head depth is 8px');

  // Body
  const bg = (model.bodyGroup.children[0] as Mesh).geometry as any;
  assert(bg.parameters.width === 8 * px, 'Body width is 8px');
  assert(bg.parameters.height === 12 * px, 'Body height is 12px');
  assert(bg.parameters.depth === 4 * px, 'Body depth is 4px');

  // Arm
  const ag = (model.leftArmGroup.children[0] as Mesh).geometry as any;
  assert(ag.parameters.width === 4 * px, 'Arm width is 4px');
  assert(ag.parameters.height === 12 * px, 'Arm height is 12px');
  assert(ag.parameters.depth === 4 * px, 'Arm depth is 4px');

  // Leg
  const lg = (model.leftLegGroup.children[0] as Mesh).geometry as any;
  assert(lg.parameters.width === 4 * px, 'Leg width is 4px');
  assert(lg.parameters.height === 12 * px, 'Leg height is 12px');
  assert(lg.parameters.depth === 4 * px, 'Leg depth is 4px');
}

function testCameraModeController() {
  const input = {
    keys: new Set<string>(),
    isKeyJustPressed: (k: string) => input.keys.has(k)
  } as any;
  
  const blockRegistry = new BlockRegistry();
  registerDefaultBlocks(blockRegistry);
  const chunkManager = new ChunkManager();
  const lightEngine = new LightEngine(chunkManager, blockRegistry);
  const world = new BlockUpdateWorld(chunkManager, blockRegistry, lightEngine);
  const controller = new CameraModeController(input, world, blockRegistry);
  
  const player = new Player(0, 64, 0);
  const camera = new PerspectiveCamera();

  // Test toggle
  assert(controller.getMode() === CameraMode.FIRST_PERSON, 'Default mode is FIRST_PERSON');
  
  input.keys.add('KeyP');
  controller.update();
  assert(controller.getMode() === CameraMode.THIRD_PERSON_REAR, 'Toggle to THIRD_PERSON_REAR');
  
  input.keys.delete('KeyP');
  controller.update();
  assert(controller.getMode() === CameraMode.THIRD_PERSON_REAR, 'No toggle if P not pressed');
  
  input.keys.add('KeyP');
  controller.update();
  assert(controller.getMode() === CameraMode.FIRST_PERSON, 'Toggle back to FIRST_PERSON');
  
  // Test transforms (First person)
  controller.applyTransform(camera, player, Math.PI / 2, 0);
  assert(camera.position.y === player.getEyeY(), 'Camera height is eye height in first person');

  // Test transforms (Third person open space)
  input.keys.add('KeyP');
  controller.update();
  
  // We mock a chunk with air (id 0) to ensure no intersection
  const chunk = new Chunk(0, 0);
  chunkManager.addCreateListener(() => {}); // bypass
  (chunkManager as any).chunks.set('0,0', chunk);
  
  controller.applyTransform(camera, player, 0, 0); 
  // yaw 0 = -z direction in Three.js (actually dz is -Math.cos(0) = -1. So camera points -Z. The camera itself is backed up +Z)
  // Distance is 4.0. So eyeZ + 4.0.
  const diffZ = camera.position.z - player.position.z;
  assert(diffZ > 3.9 && diffZ < 4.1, 'Camera is 4 blocks behind player in third person');

  // Obstruction: Put a solid block right behind the player at z=2
  chunk.setBlock(0, 65, 2, 1); // 1 = stone (solid)
  // Re-apply, should shorten
  controller.applyTransform(camera, player, 0, 0);
  const newDiffZ = camera.position.z - player.position.z;
  assert(newDiffZ < 4.0, 'Camera distance shortens when obstructed');
}

function testFirstPersonArm() {
  const fpRenderer = new FirstPersonArmRenderer();
  const camera = new PerspectiveCamera();
  camera.position.set(10, 20, 30);
  fpRenderer.update(camera);
  
  const mesh = fpRenderer.scene.children[0] as Group;
  assert(mesh.position.x !== 0 || mesh.position.y !== 0, 'Arm has been offset relative to camera');
}

function main() {
  testPlayerModelDimensions();
  testCameraModeController();
  testFirstPersonArm();
  console.log('Player Rendering Validation Passed.');
  process.exit(0);
}

main();
