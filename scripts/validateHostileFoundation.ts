import * as THREE from 'three';
import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { EntityManager } from '../src/entities/core/EntityManager.ts';
import type { EntityTickContext, EntityWorldContext } from '../src/entities/core/EntityContext.ts';
import { createDefaultEntityTypeRegistry } from '../src/entities/core/EntityType.ts';
import { HostileEntity } from '../src/entities/hostile/HostileEntity.ts';
import type { NbtCompound, NbtTag } from '../src/persistence/nbt/Nbt.ts';
import { Player } from '../src/player/Player.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { Difficulty } from '../src/world/Difficulty.ts';
import { hasLineOfSight } from '../src/world/LineOfSight.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { JavaRandom } from '../src/world/generation/random/JavaRandom.ts';
import { MeleeAttackTask } from '../src/entities/ai/tasks/MeleeAttackTask.ts';
import { PursueTargetTask } from '../src/entities/ai/tasks/PursueTargetTask.ts';
import { PanicTask } from '../src/entities/ai/tasks/PanicTask.ts';
import { createDefaultMetadata } from '../src/persistence/coordinator/WorldSaveCoordinator.ts';

function assert(value: boolean, message: string): void { if (!value) throw new Error(message); }

class TestHostile extends HostileEntity {
  public readonly typeId = 250;
  public readonly typeStringId = 'TestHostile';
  public readonly meleeDamage = 4;
  public forceRandomZero = false;
  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx); this.setSize(0.6, 1.8); this.setPosition(x, y, z); this.moveSpeed = 0.7;
  }
  public override nextInt(bound: number): number { return this.forceRandomZero ? 0 : super.nextInt(bound); }
  public onTick(ctx: EntityTickContext): void { super.onTick(ctx); }
  protected writeEntityNbt(map: Map<string, NbtTag>): void { this.writeHostileNbt(map); }
  protected readEntityNbt(data: NbtCompound): void { this.readHostileNbt(data); }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): TestHostile {
    const entity = new TestHostile(ctx, 0, 0, 0); entity.readFromNbt(data); return entity;
  }
}

const blocks = new BlockRegistry(); registerDefaultBlocks(blocks);
const chunks = new ChunkManager();
for (let x = -1; x <= 12; x++) for (let z = -1; z <= 1; z++) chunks.getOrCreateChunk(x, z);
const behaviours = new BlockBehaviourRegistry();
const world = new BlockUpdateWorld(chunks, blocks, new LightEngine(chunks, blocks));
for (let x = -16; x < 208; x++) for (let z = -16; z < 32; z++) world.setBlock(x, 10, z, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
const player = new Player(4, 11, 0);
let difficulty: Difficulty = Difficulty.Normal;
const scene = new THREE.Scene(); const texture = new THREE.Texture();
const atlas = { texture, getUvRect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) } as never;
const material = new THREE.MeshBasicMaterial();
const manager = new EntityManager({
  blockRegistry: blocks, behaviourRegistry: behaviours, blockUpdateWorld: world, chunkManager: chunks,
  scene, blockAtlas: atlas, itemAtlas: atlas, heldBlockMaterial: material, itemHeldMaterial: material,
  typeRegistry: createDefaultEntityTypeRegistry(), rng: new JavaRandom(5n), playerPosition: player.position,
  player, difficulty: () => difficulty, isDaytime: () => true, skylightSubtracted: () => 0,
});

// Target acquisition, visibility, loss, death, and unloaded-player rejection.
const hostile = new TestHostile(manager.context, 0, 11, 0);
assert(hostile.acquirePlayerTarget() === player, 'visible in-range loaded player acquired');
player.position.x = 20; assert(!hostile.validateTarget(), 'out-of-range player lost');
player.position.x = 4;
world.setBlock(2, 12, 0, BlockIds.Stone, { notifyNeighbours: false, updateLighting: false });
assert(!hasLineOfSight(world, blocks, { x: 0, y: 12, z: 0 }, { x: 4, y: 12, z: 0 }), 'solid voxel blocks sight');
assert(hostile.acquirePlayerTarget() === null, 'player behind wall not acquired');
world.setBlock(2, 12, 0, 0, { notifyNeighbours: false, updateLighting: false });
assert(hostile.acquirePlayerTarget() === player, 'target reacquired after sight clears');
player.position.x = 192; chunks.removeChunk(12, 0); assert(!hostile.validateTarget(), 'player in unloaded chunk rejected');
chunks.getOrCreateChunk(12, 0); player.position.x = 4; player.health = 0; assert(hostile.acquirePlayerTarget() === null, 'dead player rejected'); player.health = 20;

// Pursuit uses existing navigation and cancellation.
hostile.acquirePlayerTarget();
const pursuit = new PursueTargetTask();
assert(pursuit.shouldStart(hostile), 'pursuit starts with valid target'); pursuit.start(hostile);
assert(hostile.navigation.hasPath(), 'pursuit installs bounded navigation path');
player.position.x = 30; assert(!pursuit.shouldContinue(hostile), 'pursuit ends after target loss'); pursuit.stop(hostile);
assert(!hostile.navigation.hasPath(), 'pursuit cleanup clears path'); player.position.x = 1.5;

// Exactly-once melee, cooldown, player hurt resistance, and knockback feedback.
hostile.acquirePlayerTarget(); const melee = new MeleeAttackTask();
assert(melee.shouldStart(hostile), 'melee starts in reach'); const health = player.health; melee.start(hostile);
assert(player.health === health - 4 && hostile.attackTime === 20 && player.hurtTime === 10, 'one attack damages once and sets feedback/cooldown');
melee.start(hostile); assert(player.health === health - 4, 'same attack cannot deal damage twice');
assert(!player.attackFromMob(4, hostile), 'hurt resistance rejects equal repeated damage');
for (let i = 0; i < 20; i++) player.tickCombatState();
assert(player.attackFromMob(4, hostile), 'damage applies after hurt resistance expires');
assert(new PanicTask().priority > melee.priority && melee.priority > pursuit.priority, 'shared priority order remains bounded');

// Beta despawn: far immediate, random aged, near reset, and persistence bypass.
const far = new TestHostile(manager.context, 200, 11, 0); player.position.x = 0; far.onTick({ world: manager.context, gameTick: 1 });
assert(far.removed, 'hostile beyond 128 blocks despawns immediately');
const aged = new TestHostile(manager.context, 40, 11, 0); aged.age = 601; aged.forceRandomZero = true; aged.onTick({ world: manager.context, gameTick: 2 });
assert(aged.removed, 'aged hostile beyond 32 blocks despawns on 1-in-800 check');
const near = new TestHostile(manager.context, 4, 11, 0); near.age = 601; near.forceRandomZero = true; near.onTick({ world: manager.context, gameTick: 3 });
assert(!near.removed && near.age === 0, 'near player resets despawn age');
const permanent = new TestHostile(manager.context, 200, 11, 0); permanent.setPersistenceRequired(); permanent.onTick({ world: manager.context, gameTick: 4 });
assert(!permanent.removed, 'persistent hostile bypasses all distance despawn');

// Persistence restores durable state but no transient target/path/cooldown.
permanent.health = 13; permanent.age = 777; permanent.target = player; permanent.attackTime = 9;
const restored = TestHostile.deserialize(manager.context, permanent.writeToNbt());
assert(restored.health === 13 && restored.age === 777 && restored.persistenceRequired, 'health, age, type and persistence flag restore');
assert(restored.target === null && restored.attackTime === 0 && !restored.navigation.hasPath(), 'transient hostile AI state is not restored');

// Difficulty and daylight hooks.
difficulty = Difficulty.Peaceful; const peaceful = new TestHostile(manager.context, 0, 11, 0); peaceful.onTick({ world: manager.context, gameTick: 5 });
assert(peaceful.removed, 'Peaceful removes hostile');
assert(createDefaultMetadata().difficulty === Difficulty.Normal, 'world difficulty defaults to Normal');
const exposure = hostile.getDaylightExposure(); assert(exposure.daytime && typeof exposure.canIgnite === 'boolean', 'daylight framework reports reusable exposure state');

manager.dispose(); material.dispose(); texture.dispose();
console.log('Hostile mob foundation validation passed.');
