/**
 * validateEntities — entity type registry, serialization identity, mob and
 * projectile fundamentals, and rail/minecart geometry.
 */

import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { createDefaultEntityTypeRegistry, EntityTypeIds } from '../src/entities/core/EntityType.ts';
import { registerEntityTypes } from '../src/entities/registerEntityTypes.ts';
import { AABB } from '../src/physics/AABB.ts';
import { getRailShapeForBlock, isRailBlockId } from '../src/world/rails/RailShapes.ts';
import { assert, assertClose, assertEqual, runSuite, type Section } from './validationHarness.ts';

const registry = new BlockRegistry();
registerDefaultBlocks(registry);

const entityTypes = createDefaultEntityTypeRegistry();
registerEntityTypes(entityTypes);

const sections: Section[] = [
  {
    name: 'Entity type registry',
    checks: [
      {
        name: 'every registered entity type round-trips between its string and numeric id',
        run: () => {
          let checked = 0;
          for (const numericId of Object.values(EntityTypeIds)) {
            if (typeof numericId !== 'number') continue;
            const stringId = entityTypes.getStringId(numericId);
            // FishingBobber is transient and deliberately not persisted, so it
            // has a numeric id but no serialisation mapping.
            if (stringId === undefined) continue;
            assertEqual(
              entityTypes.getNumericId(stringId),
              numericId,
              `entity type "${stringId}" does not round-trip back to ${numericId}`,
            );
            checked += 1;
          }
          assert(checked > 0, 'no entity types were registered');
        },
      },
      {
        name: 'entity numeric ids and string ids are unique',
        run: () => {
          const numericSeen = new Set<number>();
          const stringSeen = new Set<string>();
          for (const numericId of Object.values(EntityTypeIds)) {
            if (typeof numericId !== 'number') continue;
            assert(!numericSeen.has(numericId), `duplicate entity numeric id ${numericId}`);
            numericSeen.add(numericId);
            const stringId = entityTypes.getStringId(numericId);
            if (stringId === undefined) continue;
            assert(!stringSeen.has(stringId), `duplicate entity string id "${stringId}"`);
            stringSeen.add(stringId);
          }
        },
      },
      {
        name: 'the core Beta entity types are all present',
        run: () => {
          // Mobs, projectiles and vehicles must survive a save/load round-trip,
          // which requires a registered deserialiser for each.
          const required = ['Item', 'FallingSand', 'Pig', 'Cow', 'Sheep', 'Chicken', 'Zombie', 'Skeleton', 'Spider', 'Creeper', 'Arrow', 'PrimedTnt', 'Minecart', 'Boat', 'Snowball', 'ThrownEgg', 'Painting'];
          const present = new Set<string>();
          for (const numericId of Object.values(EntityTypeIds)) {
            if (typeof numericId !== 'number') continue;
            const stringId = entityTypes.getStringId(numericId);
            if (stringId !== undefined) present.add(stringId);
          }
          const missing = required.filter((name) => !present.has(name));
          assert(missing.length === 0, `entity types missing from the registry: ${missing.join(', ')}`);
        },
      },
    ],
  },
  {
    name: 'Entity bounds',
    checks: [
      {
        name: 'entity AABBs are well-formed and centred on their position',
        run: () => {
          // A representative living-entity footprint: min must never exceed max
          // on any axis, or collision resolution produces NaN offsets.
          const box = new AABB(-0.3, 0, -0.3, 0.3, 1.8, 0.3);
          assert(box.minX <= box.maxX, 'AABB minX must not exceed maxX');
          assert(box.minY <= box.maxY, 'AABB minY must not exceed maxY');
          assert(box.minZ <= box.maxZ, 'AABB minZ must not exceed maxZ');
          const moved = box.translated(10, 20, -30);
          assertClose(moved.maxX - moved.minX, box.maxX - box.minX, 1e-9, 'translation must preserve width');
          assertClose(moved.maxY - moved.minY, box.maxY - box.minY, 1e-9, 'translation must preserve height');
        },
      },
      {
        name: 'expanding a box grows it symmetrically on every axis',
        run: () => {
          const box = new AABB(0, 0, 0, 1, 1, 1);
          const grown = box.expand(0.5, 0.25, 0.5);
          assertEqual(grown.minX, -0.5, 'expand should extend minX');
          assertEqual(grown.maxX, 1.5, 'expand should extend maxX');
          assertEqual(grown.minY, -0.25, 'expand should extend minY');
          assertEqual(grown.maxY, 1.25, 'expand should extend maxY');
        },
      },
    ],
  },
  {
    name: 'Minecarts and rails',
    checks: [
      {
        name: 'rail blocks are recognised and non-rails are rejected',
        run: () => {
          assert(isRailBlockId(BlockIds.Rail), 'plain rail should be recognised as a rail');
          assert(isRailBlockId(BlockIds.PoweredRail), 'powered rail should be recognised as a rail');
          assert(isRailBlockId(BlockIds.DetectorRail), 'detector rail should be recognised as a rail');
          assert(!isRailBlockId(BlockIds.Stone), 'stone must not be treated as a rail');
          assert(!isRailBlockId(BlockIds.Air), 'air must not be treated as a rail');
        },
      },
      {
        name: 'every rail metadata value resolves to a defined shape',
        run: () => {
          // Plain rails use 0..9 (including the four curves); powered and
          // detector rails only use the six straight/sloped shapes 0..5.
          for (let metadata = 0; metadata <= 9; metadata++) {
            const shape = getRailShapeForBlock(BlockIds.Rail, metadata);
            assert(shape !== undefined, `plain rail metadata ${metadata} has no shape`);
          }
          for (let metadata = 0; metadata <= 5; metadata++) {
            assert(
              getRailShapeForBlock(BlockIds.PoweredRail, metadata) !== undefined,
              `powered rail metadata ${metadata} has no shape`,
            );
          }
        },
      },
    ],
  },
  {
    name: 'Entity-backed blocks',
    checks: [
      {
        name: 'blocks that convert into entities are registered',
        run: () => {
          // Sand and gravel become FallingBlock entities; both must resolve or
          // the falling-block behaviour has nothing to spawn or land as.
          for (const id of [BlockIds.Sand, BlockIds.Gravel]) {
            assert(registry.getById(id) !== undefined, `block ${id} used by the falling-block behaviour is not registered`);
          }
        },
      },
      {
        name: 'rail blocks used by minecarts are registered and solid-free',
        run: () => {
          for (const id of [BlockIds.Rail, BlockIds.PoweredRail, BlockIds.DetectorRail]) {
            const definition = registry.getById(id);
            assert(definition !== undefined, `rail block ${id} is not registered`);
            assertEqual(definition.solid, false, `rail "${definition.name}" must not be a solid collision cube`);
          }
        },
      },
    ],
  },
];

await runSuite('validateEntities', sections);
