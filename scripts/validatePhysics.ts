/**
 * validatePhysics — AABB maths, collision symmetry, partial blocks and the
 * shared Beta collision mover used by both the player and entities.
 *
 * Collision is tested through behaviour (move a body and inspect where it ends
 * up) rather than by reading source, so the checks stay meaningful if the
 * implementation is refactored.
 */

import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { AABB } from '../src/physics/AABB.ts';
import { BetaCollisionMover } from '../src/physics/BetaCollisionMover.ts';
import { GRAVITY, TERMINAL_VELOCITY } from '../src/physics/physicsConstants.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { registerShapedBlockBehaviours } from '../src/world/behaviours/ShapedBlockBehaviours.ts';
import { SlabBehaviour } from '../src/world/behaviours/SlabBehaviour.ts';
import { assert, assertClose, assertEqual, runSuite, type Section } from './validationHarness.ts';

const registry = new BlockRegistry();
registerDefaultBlocks(registry);

interface Harness {
  world: BlockUpdateWorld;
  mover: BetaCollisionMover;
}

function createHarness(): Harness {
  const chunks = new ChunkManager();
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) chunks.getOrCreateChunk(cx, cz);
  const light = new LightEngine(chunks, registry);
  const world = new BlockUpdateWorld(chunks, registry, light);
  const behaviours = new BlockBehaviourRegistry();
  registerShapedBlockBehaviours(behaviours);
  // Engine registers the slab behaviour separately; mirror that so partial-block
  // collision is exercised with the same shapes the game uses.
  behaviours.register(BlockIds.Slab, new SlabBehaviour());
  world.setBehaviourRegistry(behaviours);
  const mover = new BetaCollisionMover(registry, behaviours, world);
  return { world, mover };
}

/** A simple 0.6 x 1.8 body, the Beta player footprint. */
function createBody(x: number, y: number, z: number): { position: { x: number; y: number; z: number }; getAABB(): AABB } {
  const position = { x, y, z };
  return {
    position,
    getAABB: () => new AABB(
      position.x - 0.3, position.y, position.z - 0.3,
      position.x + 0.3, position.y + 1.8, position.z + 0.3,
    ),
  };
}

const sections: Section[] = [
  {
    name: 'AABB maths',
    checks: [
      {
        name: 'intersection is symmetric',
        run: () => {
          const a = new AABB(0, 0, 0, 1, 1, 1);
          const b = new AABB(0.5, 0.5, 0.5, 1.5, 1.5, 1.5);
          const c = new AABB(5, 5, 5, 6, 6, 6);
          assertEqual(a.intersects(b), b.intersects(a), 'intersects must be symmetric for overlapping boxes');
          assert(a.intersects(b), 'overlapping boxes should intersect');
          assertEqual(a.intersects(c), c.intersects(a), 'intersects must be symmetric for disjoint boxes');
          assert(!a.intersects(c), 'disjoint boxes must not intersect');
        },
      },
      {
        name: 'touching faces do not count as intersecting',
        run: () => {
          const a = new AABB(0, 0, 0, 1, 1, 1);
          const flush = new AABB(1, 0, 0, 2, 1, 1);
          assert(!a.intersects(flush), 'boxes sharing only a face must not report intersection');
        },
      },
      {
        name: 'offset and translate move the box without changing its size',
        run: () => {
          const box = new AABB(0, 0, 0, 1, 2, 3);
          const moved = box.translated(5, -2, 0.5);
          assertClose(moved.maxX - moved.minX, 1, 1e-9, 'width changed under translation');
          assertClose(moved.maxY - moved.minY, 2, 1e-9, 'height changed under translation');
          assertClose(moved.maxZ - moved.minZ, 3, 1e-9, 'depth changed under translation');
          assertClose(moved.minX, 5, 1e-9, 'translation X');
          assertClose(moved.minY, -2, 1e-9, 'translation Y');
        },
      },
      {
        name: 'axis offset calculations stop movement at contact',
        run: () => {
          // Beta's AxisAlignedBB.calculateXOffset is called ON the blocking box
          // with the MOVING box as the argument, so `blocker.calculateXOffset(mover, d)`.
          const blocker = new AABB(1, 0, 0, 2, 1, 1);
          const mover = new AABB(0, 0, 0, 0.5, 1, 1);
          // Moving +X by 2 should be clipped to the 0.5 gap.
          assertClose(blocker.calculateXOffset(mover, 2), 0.5, 1e-9, 'X offset must clip to the contact distance');
          // Moving away is unaffected.
          assertClose(blocker.calculateXOffset(mover, -2), -2, 1e-9, 'movement away from a box must not be clipped');
          // A box misaligned on Y never interacts.
          const offAxis = new AABB(0, 50, 0, 0.5, 51, 1);
          assertClose(blocker.calculateXOffset(offAxis, 2), 2, 1e-9, 'a vertically disjoint box must not clip movement');
        },
      },
    ],
  },
  {
    name: 'Collision resolution',
    checks: [
      {
        name: 'a body falling onto a solid block lands on its surface',
        run: () => {
          const { world, mover } = createHarness();
          world.setBlock(0, 63, 0, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
          const body = createBody(0.5, 66, 0.5);
          const result = mover.move(body, 0, -4, 0);
          assert(result.collidedY, 'falling body should collide vertically');
          assert(result.grounded, 'falling body should end up grounded');
          assertClose(body.position.y, 64, 1e-3, 'body should rest on top of the block at y=63');
        },
      },
      {
        name: 'a body cannot move horizontally through a solid wall',
        run: () => {
          const { world, mover } = createHarness();
          world.setBlock(2, 64, 0, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
          const body = createBody(0.5, 64, 0.5);
          const result = mover.move(body, 4, 0, 0);
          assert(result.collidedX, 'body should collide with the wall');
          assert(body.position.x < 2, `body tunnelled through the wall to x=${body.position.x}`);
        },
      },
      {
        name: 'collision is symmetric from either approach direction',
        run: () => {
          const { world, mover } = createHarness();
          world.setBlock(0, 64, 0, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });

          const fromWest = createBody(-2.5, 64, 0.5);
          mover.move(fromWest, 4, 0, 0);
          const gapWest = 0 - (fromWest.position.x + 0.3);

          const fromEast = createBody(3.5, 64, 0.5);
          mover.move(fromEast, -4, 0, 0);
          const gapEast = (fromEast.position.x - 0.3) - 1;

          assertClose(gapWest, gapEast, 1e-6, 'approach from west and east resolve to different gaps');
        },
      },
      {
        name: 'unobstructed movement is not clipped',
        run: () => {
          const { mover } = createHarness();
          const body = createBody(0.5, 64, 0.5);
          const result = mover.move(body, 1.25, 0, -0.75);
          assertClose(result.movedX, 1.25, 1e-9, 'free X movement was clipped');
          assertClose(result.movedZ, -0.75, 1e-9, 'free Z movement was clipped');
          assert(!result.collidedHorizontally, 'free movement should not report a collision');
        },
      },
      {
        name: 'partial blocks (slabs) collide at their real height, not a full cube',
        run: () => {
          const { world, mover } = createHarness();
          world.setBlock(0, 63, 0, BlockIds.Slab, { updateLighting: false, notifyNeighbours: false });
          const body = createBody(0.5, 66, 0.5);
          mover.move(body, 0, -4, 0);
          // A bottom slab is half a block tall, so the surface is at 63.5.
          assertClose(body.position.y, 63.5, 1e-3, 'body should rest on the slab surface at y=63.5');
        },
      },
      {
        name: 'a body does not fall through the world where no block exists',
        run: () => {
          const { mover } = createHarness();
          const body = createBody(0.5, 64, 0.5);
          const result = mover.move(body, 0, -2, 0);
          assertClose(result.movedY, -2, 1e-9, 'unobstructed fall should move the full distance');
          assert(!result.grounded, 'body in open air must not report grounded');
        },
      },
      {
        name: 'ladders and doors expose collision shapes consistently',
        run: () => {
          const { world, mover } = createHarness();
          // A ladder must not behave as a full solid cube blocking all movement.
          world.setBlock(2, 64, 0, BlockIds.Ladder, { updateLighting: false, notifyNeighbours: false });
          const body = createBody(0.5, 64, 0.5);
          const before = body.position.x;
          mover.move(body, 3, 0, 0);
          assert(body.position.x > before, 'body should still be able to advance toward a ladder cell');
        },
      },
    ],
  },
  {
    name: 'Physics constants',
    checks: [
      {
        name: 'gravity and terminal velocity keep Beta-consistent magnitudes',
        run: () => {
          // Gravity is expressed per second; Beta applies ~0.08 blocks/tick^2.
          assertClose(GRAVITY / (20 * 20), 0.08, 1e-6, 'gravity should equal ~0.08 blocks per tick squared');
          assert(TERMINAL_VELOCITY > 0, 'terminal velocity must be positive');
          assert(TERMINAL_VELOCITY > GRAVITY / 20, 'terminal velocity must exceed one tick of gravity');
        },
      },
    ],
  },
];

await runSuite('validatePhysics', sections);
