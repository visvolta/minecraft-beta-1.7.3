/**
 * validateCore — registries, IDs, required assets and startup invariants.
 *
 * Broad structural checks that must hold before any subsystem can be trusted:
 * block/item registration integrity, ID uniqueness, texture files backing every
 * declared texture name, and the render-classification invariants that decide
 * whether a block is ever meshed at all.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { resolveBlockTexture } from '../src/blocks/resolveBlockTexture.ts';
import { DEFAULT_ITEM_DEFINITIONS, UNIMPLEMENTED_BEHAVIOUR } from '../src/items/ItemDefinitionRegistry.ts';
import { classifyBlockPassMask, ChunkPassMask } from '../src/rendering/meshing/ChunkPassMask.ts';
import { collectBlockAtlasTextureNames, MISSING_TEXTURE_NAME } from '../src/assets/blockAtlasTextureNames.ts';
import type { BlockId } from '../src/blocks/BlockId.ts';
import { assert, assertEqual, runSuite, type Section } from './validationHarness.ts';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..', '..');
const blockTextureDir = join(projectRoot, 'public', 'textures', 'blocks');

const registry = new BlockRegistry();
registerDefaultBlocks(registry);

const allBlocks = [...registry.values()];

/** Every texture name referenced by any block definition face slot. */
function declaredTextureNames(): Set<string> {
  const names = new Set<string>();
  for (const definition of allBlocks) {
    const { all, top, bottom, side, front } = definition.textures;
    for (const name of [all, top, bottom, side, front]) {
      if (name !== undefined) names.add(name);
    }
  }
  return names;
}

const sections: Section[] = [
  {
    name: 'Block registry integrity',
    checks: [
      {
        name: 'registry is populated and every definition round-trips by id and name',
        run: () => {
          assert(allBlocks.length > 0, 'block registry is empty');
          for (const definition of allBlocks) {
            assertEqual(registry.getById(definition.id)?.name, definition.name, `getById(${definition.id})`);
            assertEqual(registry.getByName(definition.name)?.id, definition.id, `getByName(${definition.name})`);
          }
        },
      },
      {
        name: 'block ids and names are unique (duplicate registration rejected)',
        run: () => {
          const ids = new Set<number>();
          const names = new Set<string>();
          for (const definition of allBlocks) {
            assert(!ids.has(definition.id), `duplicate block id ${definition.id} (${definition.name})`);
            assert(!names.has(definition.name), `duplicate block name "${definition.name}"`);
            ids.add(definition.id);
            names.add(definition.name);
          }
          // The registry itself must actively reject a duplicate, not silently overwrite.
          const probe = new BlockRegistry();
          registerDefaultBlocks(probe);
          const existing = allBlocks[1]!;
          let rejected = false;
          try {
            probe.register({ ...existing });
          } catch {
            rejected = true;
          }
          assert(rejected, 'registry accepted a duplicate registration');
        },
      },
      {
        name: 'block ids fit the Beta byte-per-block chunk storage range',
        run: () => {
          for (const definition of allBlocks) {
            assert(
              Number.isInteger(definition.id) && definition.id >= 0 && definition.id <= 255,
              `block "${definition.name}" id ${definition.id} outside 0..255 (Uint8Array chunk storage)`,
            );
          }
        },
      },
      {
        name: 'air is registered as the canonical empty block id 0',
        run: () => {
          assertEqual(BlockIds.Air, 0, 'Air must be block id 0');
          assertEqual(classifyBlockPassMask(0 as BlockId, registry), ChunkPassMask.None, 'air must emit no render pass');
        },
      },
    ],
  },
  {
    name: 'Render classification invariants',
    checks: [
      {
        name: 'every solid non-air block declares a renderType',
        run: () => {
          // A missing renderType makes ChunkMesher.isOpaqueMeshBlock() return
          // false, so the block generates into the world but never meshes —
          // exactly the coarse-dirt invisibility bug.
          const missing = allBlocks
            .filter((definition) => definition.id !== BlockIds.Air && definition.solid && definition.renderType === undefined)
            .map((definition) => definition.name);
          assert(missing.length === 0, `solid blocks without renderType (they will render as holes): ${missing.join(', ')}`);
        },
      },
      {
        name: 'every non-air block either resolves a chunk render pass or is drawn by a dedicated renderer',
        run: () => {
          // Blocks with a bespoke renderer (chests use ChestRenderer, not the
          // chunk mesher) legitimately emit no chunk pass. Everything else must
          // resolve one, or it generates into the world and renders as a hole.
          const RENDERED_BY_DEDICATED_RENDERER: ReadonlySet<string> = new Set(['chest']);
          const unrenderable: string[] = [];
          for (const definition of allBlocks) {
            if (definition.id === BlockIds.Air) continue;
            if (RENDERED_BY_DEDICATED_RENDERER.has(definition.renderType ?? '')) continue;
            const mask = classifyBlockPassMask(definition.id as BlockId, registry);
            if (mask === ChunkPassMask.None) unrenderable.push(`${definition.name}(${definition.id})`);
          }
          assert(unrenderable.length === 0, `blocks classified into no render pass: ${unrenderable.join(', ')}`);
        },
      },
      {
        name: 'opaque solid terrain blocks resolve a texture for all six faces',
        run: () => {
          for (const definition of allBlocks) {
            if (definition.renderType !== 'opaque') continue;
            for (const face of ['top', 'bottom', 'side', 'front', 'back'] as const) {
              const texture = resolveBlockTexture(definition, face);
              assert(
                texture !== undefined && texture.length > 0,
                `opaque block "${definition.name}" has no texture for face "${face}"`,
              );
            }
          }
        },
      },
    ],
  },
  {
    name: 'Required assets',
    checks: [
      {
        name: 'every texture named by a block definition exists on disk',
        run: () => {
          const missing: string[] = [];
          for (const name of declaredTextureNames()) {
            if (!existsSync(join(blockTextureDir, `${name}.png`))) missing.push(name);
          }
          assert(missing.length === 0, `block textures referenced but absent from public/textures/blocks: ${missing.join(', ')}`);
        },
      },
      {
        name: 'every texture the atlas packs exists on disk',
        run: () => {
          // Uses the same collector AssetManager uses at runtime, so this
          // covers mesh-time-only names (fern, bed faces, rail/door variants,
          // destroy stages, missing_texture) that no block definition names.
          const missing: string[] = [];
          for (const name of collectBlockAtlasTextureNames(registry)) {
            // missing_texture is synthesised in TextureLoader as an inline SVG
            // checkerboard rather than shipped as a PNG.
            if (name === MISSING_TEXTURE_NAME) continue;
            if (!existsSync(join(blockTextureDir, `${name}.png`))) missing.push(name);
          }
          assert(missing.length === 0, `atlas texture names with no PNG in public/textures/blocks: ${missing.join(', ')}`);
        },
      },
    ],
  },
  {
    name: 'Item registry',
    checks: [
      {
        name: 'item definitions expose unique ids with sane durability',
        run: () => {
          const seen = new Set<string | number>();
          let count = 0;
          for (const definition of DEFAULT_ITEM_DEFINITIONS.values()) {
            count += 1;
            assert(!seen.has(definition.id), `duplicate item id ${String(definition.id)}`);
            seen.add(definition.id);
            if (definition.durability !== undefined) {
              assert(
                Number.isInteger(definition.durability) && definition.durability > 0,
                `item "${String(definition.id)}" has invalid durability ${definition.durability}`,
              );
            }
          }
          assert(count > 0, 'item definition registry is empty');
        },
      },
      {
        name: 'numeric item ids are unique and resolvable',
        run: () => {
          // Items carry an optional numericId in the shared Beta id space.
          // Two distinct items must never claim the same numeric id.
          const byNumeric = new Map<number, string>();
          for (const definition of DEFAULT_ITEM_DEFINITIONS.values()) {
            if (definition.numericId === undefined) continue;
            const previous = byNumeric.get(definition.numericId);
            assert(
              previous === undefined,
              `numeric item id ${definition.numericId} claimed by both "${previous}" and "${definition.id}"`,
            );
            byNumeric.set(definition.numericId, definition.id);
            assertEqual(
              DEFAULT_ITEM_DEFINITIONS.get(definition.id)?.id,
              definition.id,
              `item "${definition.id}" is not resolvable by its own id`,
            );
          }
        },
      },
      {
        name: 'items that place a block reference a registered block id (or a documented gap)',
        run: () => {
          // Items whose placed block is knowingly not implemented must declare
          // that in UNIMPLEMENTED_BEHAVIOUR, so silent breakage is impossible
          // while documented gaps do not fail the suite.
          const undocumented: string[] = [];
          for (const definition of DEFAULT_ITEM_DEFINITIONS.values()) {
            if (definition.placeBlockId === undefined) continue;
            if (registry.getById(definition.placeBlockId as BlockId) !== undefined) continue;
            if (UNIMPLEMENTED_BEHAVIOUR[definition.id] !== undefined) continue;
            undocumented.push(`${definition.id} -> block ${definition.placeBlockId}`);
          }
          assert(
            undocumented.length === 0,
            `items placing unregistered blocks without an UNIMPLEMENTED_BEHAVIOUR note: ${undocumented.join(', ')}`,
          );
        },
      },
    ],
  },
];

await runSuite('validateCore', sections);
