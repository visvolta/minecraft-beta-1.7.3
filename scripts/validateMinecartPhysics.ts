import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { RecipeRegistry } from '../src/crafting/RecipeRegistry.ts';
import { CraftingGrid } from '../src/crafting/CraftingGrid.ts';
import { CraftingMatcher } from '../src/crafting/CraftingMatcher.ts';
import { registerDefaultRecipes } from '../src/crafting/registerDefaultRecipes.ts';
import { ItemIconResolver } from '../src/inventory/ItemIconResolver.ts';
import { ItemStack } from '../src/inventory/ItemStack.ts';
import { DEFAULT_ITEM_DEFINITIONS } from '../src/items/ItemDefinitionRegistry.ts';
import { MinecartEntity } from '../src/entities/MinecartEntity.ts';
import { MinecartRenderer } from '../src/rendering/MinecartRenderer.ts';
import { Entity } from '../src/entities/core/Entity.ts';
import type { EntityTickContext, EntityWorldContext } from '../src/entities/core/EntityContext.ts';
import type { NbtCompound, NbtTag } from '../src/persistence/nbt/Nbt.ts';
import type { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import {
  getRailShapeForBlock,
  RAIL_SHAPES,
  type RailBlockInfo,
} from '../src/world/rails/RailShapes.ts';
import {
  alignVelocityToRail,
  applyPoweredRailEffect,
  applySlopeAcceleration,
  MINECART_DAMAGE_THRESHOLD,
  MINECART_EMPTY_DRAG,
  MINECART_GRAVITY,
  MINECART_HEIGHT,
  MINECART_MAX_RAIL_SPEED,
  MINECART_OCCUPIED_DRAG,
  MINECART_OFF_RAIL_DRAG,
  MINECART_SLOPE_ACCELERATION,
  MINECART_WIDTH,
  POWERED_RAIL_ACCELERATION,
  projectMinecartToRail,
  UNPOWERED_RAIL_BRAKE,
} from '../src/entities/minecart/RailPhysics.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[MINECART VALIDATION FAILED] ${message}`);
    process.exit(1);
  }
}

class TestEntity extends Entity {
  public readonly typeId = 999;
  public readonly typeStringId = 'Test';
  public onTick(_ctx: EntityTickContext): void {}
  protected writeEntityNbt(_map: Map<string, NbtTag>): void {}
  protected readEntityNbt(_data: NbtCompound): void {}
}

function railInfo(blockId: number, metadata: number, x = 0, y = 64, z = 0): RailBlockInfo {
  const shape = getRailShapeForBlock(blockId, metadata);
  if (shape === undefined) {
    console.error(`[MINECART VALIDATION FAILED] shape exists for block=${blockId} meta=${metadata}`);
    process.exit(1);
  }
  return { blockId, metadata, shape, poweredRail: blockId === BlockIds.PoweredRail, active: blockId === BlockIds.PoweredRail && (metadata & 8) !== 0, x, y, z };
}

function testConstants(): void {
  assert(MINECART_MAX_RAIL_SPEED === 0.4, 'max rail speed is Beta 0.4');
  assert(Math.abs(MINECART_GRAVITY - 0.04) < 1e-8, 'gravity is Beta 0.04');
  assert(MINECART_SLOPE_ACCELERATION === 0.0078125, 'slope acceleration is Beta 0.0078125');
  assert(POWERED_RAIL_ACCELERATION === 0.06, 'powered acceleration is Beta 0.06');
  assert(UNPOWERED_RAIL_BRAKE === 0.5, 'unpowered powered rail braking is Beta 0.5');
  assert(Math.abs(MINECART_EMPTY_DRAG - 0.96) < 1e-6, 'empty drag is Beta 0.96');
  assert(Math.abs(MINECART_OCCUPIED_DRAG - 0.997) < 1e-6, 'occupied drag is Beta 0.997');
  assert(MINECART_OFF_RAIL_DRAG === 0.98, 'off-rail drag is Beta 0.98');
  assert(MINECART_WIDTH === 0.98 && MINECART_HEIGHT === 0.7, 'minecart dimensions are Beta 0.98 x 0.7');
  assert(MINECART_DAMAGE_THRESHOLD === 40, 'damage threshold is 40');
}

function testRailShapes(): void {
  assert(RAIL_SHAPES.length === 10, 'all ten Beta rail shapes are represented');
  for (let meta = 0; meta <= 9; meta++) {
    assert(getRailShapeForBlock(BlockIds.Rail, meta)?.metadata === meta, `ordinary rail metadata ${meta} resolves`);
  }
  assert(getRailShapeForBlock(BlockIds.Rail, 10) === undefined, 'invalid ordinary metadata is rejected');
  assert(getRailShapeForBlock(BlockIds.PoweredRail, 5)?.metadata === 5, 'powered slope metadata resolves');
  assert(getRailShapeForBlock(BlockIds.PoweredRail, 6) === undefined, 'powered rail rejects curve metadata');
  assert(getRailShapeForBlock(BlockIds.PoweredRail, 8)?.metadata === 0, 'powered bit masks to shape metadata');
}

function testProjectionAndSlope(): void {
  const eastWest = railInfo(BlockIds.Rail, 1);
  const projected = projectMinecartToRail(0.25, 64, 0.8, eastWest);
  assert(Math.abs(projected.z - 0.5) < 1e-9, 'east-west projection snaps to centre z');
  assert(Math.abs(projected.x - 0.25) < 1e-9, 'east-west projection preserves x travel position');

  const ascendingEast = railInfo(BlockIds.Rail, 2);
  const velocity = { x: 0, z: 0 };
  applySlopeAcceleration(velocity, ascendingEast.shape);
  assert(velocity.x === -MINECART_SLOPE_ACCELERATION, 'ascending east applies downhill x acceleration');

  const aligned = alignVelocityToRail({ x: -0.2, z: 0 }, ascendingEast);
  assert(aligned.x < 0 && Math.abs(aligned.z) < 1e-9, 'velocity alignment preserves travel direction');
}

function testPoweredRails(): void {
  const active = railInfo(BlockIds.PoweredRail, 9);
  const velocity = { x: 0.1, y: 0, z: 0 };
  const world = { isNormalCube: () => false };
  applyPoweredRailEffect(world as unknown as BlockUpdateWorld, active, velocity);
  assert(velocity.x > 0.15, 'active powered rail accelerates moving cart');

  const inactive = railInfo(BlockIds.PoweredRail, 1);
  const braking = { x: 0.2, y: 0, z: 0 };
  applyPoweredRailEffect(world as unknown as BlockUpdateWorld, inactive, braking);
  assert(Math.abs(braking.x - 0.2 * UNPOWERED_RAIL_BRAKE) < 1e-9, 'inactive powered rail brakes');

  const startupWorld = { isNormalCube: (x: number) => x === -1 };
  const start = { x: 0, y: 0, z: 0 };
  applyPoweredRailEffect(startupWorld as unknown as BlockUpdateWorld, active, start);
  assert(start.x === 0.02, 'active powered rail startup rule applies against blocked end');
}

function testCraftingAndItems(): void {
  const item = DEFAULT_ITEM_DEFINITIONS.get(328);
  if (item === undefined) {
    console.error('[MINECART VALIDATION FAILED] minecart item 328 is registered');
    process.exit(1);
  }
  assert(item.id === 'minecart' && item.stackSize === 1, 'minecart item 328 is registered as stack size 1');
  assert(item.displayName === 'Minecart', 'minecart item 328 has display name Minecart');
  assert(new ItemIconResolver().isKnown('328'), 'minecart item icon is known');

  const blocks = new BlockRegistry();
  registerDefaultBlocks(blocks);
  const recipes = new RecipeRegistry();
  registerDefaultRecipes(recipes, blocks, new ItemIconResolver());
  const grid = new CraftingGrid(3, 3);
  grid.setStack(0, new ItemStack('iron_ingot', 'item', 1));
  grid.setStack(2, new ItemStack('iron_ingot', 'item', 1));
  grid.setStack(3, new ItemStack('iron_ingot', 'item', 1));
  grid.setStack(4, new ItemStack('iron_ingot', 'item', 1));
  grid.setStack(5, new ItemStack('iron_ingot', 'item', 1));
  const match = CraftingMatcher.findMatchingRecipe(grid, recipes);
  assert(match !== null && match.output.identity.type === 'item' && match.output.identity.id === 328 && match.output.count === 1, 'minecart shaped recipe outputs one item 328');
}

function testRailBlockDefinitions(): void {
  const blocks = new BlockRegistry();
  registerDefaultBlocks(blocks);
  for (const id of [BlockIds.Rail, BlockIds.PoweredRail, BlockIds.DetectorRail]) {
    const def = blocks.getById(id);
    if (def === undefined) {
      console.error(`[MINECART VALIDATION FAILED] rail block ${id} is registered`);
      process.exit(1);
    }
    assert(def.solid === false, `rail block ${id} is non-full/non-solid`);
    assert(def.transparent === true, `rail block ${id} is non-opaque`);
    assert(def.renderType === 'cutout', `rail block ${id} is cutout-rendered`);
  }
}

function testMountRelations(): void {
  const passenger = new TestEntity();
  const cart = new TestEntity();
  const second = new TestEntity();
  assert(passenger.mountEntity(cart), 'passenger mounts empty vehicle');
  assert(passenger.ridingEntity === cart && cart.riddenByEntity === passenger, 'mount updates both sides');
  assert(!second.mountEntity(cart), 'second passenger rejected');
  assert(passenger.mountEntity(null), 'dismount succeeds');
  assert(passenger.ridingEntity === null && cart.riddenByEntity === null, 'dismount clears both sides');
  assert(!cart.mountEntity(cart), 'self-mount rejected');
}

function createMinecartTestContext(added: Entity[] = []): EntityWorldContext {
  const blocks = new BlockRegistry();
  registerDefaultBlocks(blocks);
  const blockTexture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const itemTexture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  return {
    manager: { add: (entity: Entity) => { added.push(entity); return entity; } },
    physics: { move: (entity: MinecartEntity) => { entity.position.x += entity.velocity.x; entity.position.y += entity.velocity.y; entity.position.z += entity.velocity.z; } },
    blockUpdateWorld: { getBlock: () => 0, getBlockMetadata: () => 0, isNormalCube: () => false },
    blockRegistry: blocks,
    blockAtlas: { texture: blockTexture, getUvRect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) },
    itemAtlas: { texture: itemTexture, getUvRect: (name: string) => name === 'minecart_normal' ? { u0: 0, v0: 0, u1: 1, v1: 1 } : undefined },
    heldBlockMaterial: new THREE.MeshBasicMaterial({ map: blockTexture }),
    itemHeldMaterial: new THREE.MeshBasicMaterial({ map: itemTexture }),
    scene: new THREE.Scene(),
  } as unknown as EntityWorldContext;
}

function testMinecartEntityState(): void {
  const added: Entity[] = [];
  const ctx = createMinecartTestContext(added);
  const cart = new MinecartEntity(ctx, 1, 65, 1);
  assert(cart.width === MINECART_WIDTH && cart.height === MINECART_HEIGHT, 'minecart entity has Beta dimensions');
  assert(cart.canBeCollidedWith() && cart.getAABB().intersectRay(1, 65.2, -1, 0, 0, 1) !== undefined, 'minecart is targetable by entity raycast');

  cart.attackMinecart(3);
  assert(cart.damage === 30 && cart.hurtTime === 10 && cart.rollingAmplitude === 10 && !cart.removed, 'minecart accumulates damage and hurt wobble without premature removal');

  const passenger = new TestEntity();
  assert(passenger.mountEntity(cart), 'passenger mounts cart before destruction');
  cart.attackMinecart(5);
  assert(cart.removed, 'damage over threshold removes cart');
  assert(passenger.ridingEntity === null && cart.riddenByEntity === null, 'destruction clears stale passenger references');
  assert(added.length === 1, 'destroyed cart drops exactly one item entity');
  cart.destroyAndDrop();
  assert(added.length === 1, 'destroyAndDrop is idempotent and does not duplicate drops');

  const seated = new MinecartEntity(ctx, 4, 65, 4);
  assert(passenger.mountEntity(seated), 'passenger mounts second cart');
  seated.updatePassengerPosition();
  assert(Math.abs(passenger.position.x - seated.position.x) < 1e-9 && Math.abs(passenger.position.z - seated.position.z) < 1e-9, 'passenger is horizontally centred');
  assert(passenger.position.y < seated.position.y && passenger.position.y > seated.position.y - 1.2, 'passenger feet are lowered into cart rather than standing on top');
}

function testMinecartTextureAndRenderer(): void {
  const png = readFileSync('public/textures/entity/minecart.png');
  assert(png.toString('ascii', 1, 4) === 'PNG', 'minecart texture is a PNG');
  assert(png.readUInt32BE(16) === 64 && png.readUInt32BE(20) === 32, 'minecart texture dimensions are 64x32 Beta layout');
  assert(png[25] === 6, 'minecart texture has an alpha channel');

  const texture = new THREE.DataTexture(new Uint8Array(64 * 32 * 4), 64, 32);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const renderer = new MinecartRenderer(texture);
  assert(renderer.root.children.length === 5, 'minecart renderer creates five panels');
  const uvKeys = new Set<string>();
  renderer.root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.geometry instanceof THREE.BufferGeometry) {
      const uv = object.geometry.getAttribute('uv') as THREE.BufferAttribute;
      assert(uv.count === 24, 'minecart box panel has six UV-mapped faces');
      for (let i = 0; i < uv.count; i++) uvKeys.add(`${uv.getX(i).toFixed(4)},${uv.getY(i).toFixed(4)}`);
    }
  });
  assert(uvKeys.size > 12, 'minecart renderer uses multiple Beta sub-rectangles instead of stretching the full texture per panel');
  renderer.dispose();
}

function main(): void {
  testConstants();
  testRailShapes();
  testProjectionAndSlope();
  testPoweredRails();
  testCraftingAndItems();
  testRailBlockDefinitions();
  testMountRelations();
  testMinecartEntityState();
  testMinecartTextureAndRenderer();
  console.log('Minecart Validation Passed.');
}

main();
