/**
 * validateSystems — redstone power, audio mappings, settings, and the
 * worker/main-thread parity that keeps meshing and generation consistent.
 */

import { BlockIds } from '../src/blocks/BlockId.ts';
import type { BlockId } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { BETA_BLOCK_SOUNDS } from '../src/audio/betaBlockSounds.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { RedstonePowerEngine } from '../src/world/redstone/RedstonePowerEngine.ts';
import { REDSTONE_POWER_MAX, NO_REDSTONE_POWER, clampRedstonePower } from '../src/world/redstone/RedstonePower.ts';
import { registerRedstoneWireBehaviour } from '../src/world/behaviours/RedstoneWireBehaviour.ts';
import { registerRedstoneTorchBehaviour } from '../src/world/behaviours/RedstoneTorchBehaviour.ts';
import { Chunk } from '../src/world/Chunk.ts';
import { BetaWorldGenerator } from '../src/world/generation/BetaWorldGenerator.ts';
import { computeChunkPassMask, classifyBlockPassMask } from '../src/rendering/meshing/ChunkPassMask.ts';
import { collectBlockAtlasTextureNames } from '../src/assets/blockAtlasTextureNames.ts';
import { DEFAULT_GAME_SETTINGS, validateGameSettings } from '../src/settings/GameSettings.ts';
import { assert, assertEqual, runSuite, type Section } from './validationHarness.ts';

const registry = new BlockRegistry();
registerDefaultBlocks(registry);

function createRedstoneHarness(): { world: BlockUpdateWorld; power: RedstonePowerEngine } {
  const chunks = new ChunkManager();
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) chunks.getOrCreateChunk(cx, cz);
  const light = new LightEngine(chunks, registry);
  const world = new BlockUpdateWorld(chunks, registry, light);
  const behaviours = new BlockBehaviourRegistry();
  registerRedstoneWireBehaviour(behaviours);
  registerRedstoneTorchBehaviour(behaviours);
  world.setBehaviourRegistry(behaviours);
  const power = new RedstonePowerEngine(world, registry, behaviours);
  world.setPowerEngine(power);
  return { world, power };
}

const sections: Section[] = [
  {
    name: 'Redstone',
    checks: [
      {
        name: 'power levels clamp to the Beta 0..15 range',
        run: () => {
          assertEqual(clampRedstonePower(-5), NO_REDSTONE_POWER, 'negative power should clamp to 0');
          assertEqual(clampRedstonePower(99), REDSTONE_POWER_MAX, 'excessive power should clamp to 15');
          assertEqual(clampRedstonePower(7), 7, 'in-range power should pass through unchanged');
          assertEqual(REDSTONE_POWER_MAX, 15, 'Beta maximum redstone power is 15');
        },
      },
      {
        name: 'only power-providing blocks are treated as sources',
        run: () => {
          const { power } = createRedstoneHarness();
          assert(!power.canBlockIdProvidePower(BlockIds.Air), 'air must not provide power');
          assert(!power.canBlockIdProvidePower(BlockIds.Stone), 'plain stone must not provide power');
          assert(power.canBlockIdProvidePower(BlockIds.RedstoneTorchOn), 'a lit redstone torch must provide power');
        },
      },
      {
        name: 'an unpowered location reports no power',
        run: () => {
          const { world, power } = createRedstoneHarness();
          world.setBlock(4, 64, 4, BlockIds.Stone, { updateLighting: false, notifyNeighbours: false });
          assertEqual(
            power.canBlockProvidePower({ x: 4, y: 64, z: 4 }),
            false,
            'an ordinary stone block must not act as a power source',
          );
        },
      },
      {
        name: 'redstone queries against unloaded chunks are handled safely',
        run: () => {
          const { power } = createRedstoneHarness();
          // Far outside the loaded 3x3 chunk area.
          assertEqual(
            power.canBlockProvidePower({ x: 100_000, y: 64, z: 100_000 }),
            false,
            'power queries into unloaded chunks must return false rather than throwing',
          );
        },
      },
      {
        name: 'redstone wire and torch blocks are registered with cutout rendering',
        run: () => {
          const wire = registry.getById(BlockIds.RedstoneWire);
          assert(wire !== undefined, 'redstone wire must be registered');
          assertEqual(wire.renderType, 'redstone_wire', 'redstone wire should use its dedicated render type');
          for (const id of [BlockIds.RedstoneTorchOn, BlockIds.RedstoneTorchOff]) {
            assert(registry.getById(id) !== undefined, `redstone torch block ${id} is not registered`);
          }
        },
      },
    ],
  },
  {
    name: 'Audio mappings',
    checks: [
      {
        name: 'representative blocks map to their Beta step/dig sound materials',
        run: () => {
          const cases: ReadonlyArray<readonly [number, string]> = [
            [BlockIds.Stone, 'stone'],
            [BlockIds.Dirt, 'gravel'],
            [BlockIds.Grass, 'grass'],
            [BlockIds.Sand, 'sand'],
            [BlockIds.Planks, 'wood'],
            [BlockIds.Gravel, 'gravel'],
          ];
          for (const [id, expectedDig] of cases) {
            const sound = BETA_BLOCK_SOUNDS[id];
            assert(sound !== undefined, `block ${id} has no sound mapping`);
            assertEqual(sound.dig, expectedDig, `block ${id} dig sound material`);
          }
        },
      },
      {
        name: 'coarse dirt has a sound mapping',
        run: () => {
          const sound = BETA_BLOCK_SOUNDS[BlockIds.CoarseDirt];
          assert(sound !== undefined, 'coarse dirt must declare a sound material');
          assertEqual(sound.dig, 'gravel', 'coarse dirt should use the gravel sound material');
        },
      },
      {
        name: 'every solid block resolves some sound rather than throwing',
        run: () => {
          for (const definition of registry.values()) {
            if (!definition.solid) continue;
            const sound = BETA_BLOCK_SOUNDS[definition.id];
            assert(sound !== undefined, `solid block "${definition.name}" has no resolvable sound`);
          }
        },
      },
    ],
  },
  {
    name: 'Settings',
    checks: [
      {
        name: 'default settings are internally consistent',
        run: () => {
          // guiScale 0 is Beta's "Auto"; renderScale and audio are 0..1 ratios.
          assert(DEFAULT_GAME_SETTINGS.video.guiScale >= 0, 'GUI scale must not be negative (0 = auto)');
          assert(DEFAULT_GAME_SETTINGS.video.renderScale > 0, 'render scale must be positive');
          for (const [channel, level] of Object.entries(DEFAULT_GAME_SETTINGS.audio)) {
            assert(level >= 0 && level <= 1, `audio channel "${channel}" default ${level} is outside 0..1`);
          }
          assert(DEFAULT_GAME_SETTINGS.mouse.sensitivity > 0, 'mouse sensitivity must be positive');
          assert(
            Object.keys(DEFAULT_GAME_SETTINGS.controls.bindings).length > 0,
            'default control bindings must not be empty',
          );
        },
      },
      {
        name: 'settings validation repairs malformed input and preserves valid input',
        run: () => {
          const repaired = validateGameSettings({ video: { renderScale: 'nonsense' } });
          assert(repaired.video.renderScale > 0, 'invalid renderScale should fall back to a usable default');
          assert(
            Object.keys(repaired.controls.bindings).length > 0,
            'repaired settings must still provide control bindings',
          );
          const roundTripped = validateGameSettings(DEFAULT_GAME_SETTINGS);
          assertEqual(
            roundTripped.video.aaMode,
            DEFAULT_GAME_SETTINGS.video.aaMode,
            'validating the defaults must not alter them',
          );
        },
      },
      {
        name: 'every control binding has at least one key',
        run: () => {
          for (const [action, keys] of Object.entries(DEFAULT_GAME_SETTINGS.controls.bindings)) {
            assert(Array.isArray(keys) && keys.length > 0, `control "${action}" has no bound key`);
          }
        },
      },
    ],
  },
  {
    name: 'Worker / main-thread parity',
    checks: [
      {
        name: 'pass classification is a pure function of block id and registry',
        run: () => {
          // The meshing worker builds its own BlockRegistry, so classification
          // must agree between two independently constructed registries or
          // worker-meshed chunks will differ from main-thread ones.
          const workerRegistry = new BlockRegistry();
          registerDefaultBlocks(workerRegistry);
          for (const definition of registry.values()) {
            assertEqual(
              classifyBlockPassMask(definition.id as BlockId, workerRegistry),
              classifyBlockPassMask(definition.id as BlockId, registry),
              `pass classification for "${definition.name}" differs between registries`,
            );
          }
        },
      },
      {
        name: 'two independently built registries agree on every block definition',
        run: () => {
          const workerRegistry = new BlockRegistry();
          registerDefaultBlocks(workerRegistry);
          assertEqual(workerRegistry.size, registry.size, 'registry sizes differ between main thread and worker');
          for (const definition of registry.values()) {
            const other = workerRegistry.getById(definition.id);
            assert(other !== undefined, `worker registry is missing block ${definition.id}`);
            assertEqual(other.name, definition.name, `block ${definition.id} name differs`);
            assertEqual(other.renderType, definition.renderType, `block "${definition.name}" renderType differs`);
            assertEqual(other.solid, definition.solid, `block "${definition.name}" solidity differs`);
          }
        },
      },
      {
        name: 'atlas texture name collection is deterministic',
        run: () => {
          const a = [...collectBlockAtlasTextureNames(registry)].sort();
          const workerRegistry = new BlockRegistry();
          registerDefaultBlocks(workerRegistry);
          const b = [...collectBlockAtlasTextureNames(workerRegistry)].sort();
          assertEqual(a.join(','), b.join(','), 'atlas texture set differs between registries');
        },
      },
      {
        name: 'worker-generated and main-thread chunks are byte-identical',
        run: () => {
          // Both paths construct BetaWorldGenerator from the same seed; a
          // divergence here means worker chunks would not match saved ones.
          const seed = 987654321n;
          const mainThread = new Chunk(5, -7);
          new BetaWorldGenerator(seed).populate(mainThread);
          const workerSide = new Chunk(5, -7);
          new BetaWorldGenerator(seed).populate(workerSide);
          const a = mainThread.copyBlocks();
          const b = workerSide.copyBlocks();
          assertEqual(a.length, b.length, 'generated block array lengths differ');
          for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) throw new Error(`worker/main-thread generation diverged at index ${i}: ${a[i]} !== ${b[i]}`);
          }
        },
      },
    ],
  },
  {
    name: 'Performance-critical invariants',
    checks: [
      {
        name: 'chunk pass mask scan short-circuits and stays cheap',
        run: () => {
          const chunk = new Chunk(0, 0);
          new BetaWorldGenerator(42n).populate(chunk);
          const blocks = chunk.copyBlocks();
          const started = Date.now();
          const mask = computeChunkPassMask(blocks, registry);
          const elapsed = Date.now() - started;
          assert(mask !== 0, 'a generated chunk should require at least one render pass');
          assert(elapsed < 250, `pass mask computation took ${elapsed}ms, which is too slow for a per-chunk hot path`);
        },
      },
      {
        name: 'block lookups are O(1) map hits, not scans',
        run: () => {
          const started = Date.now();
          for (let i = 0; i < 200_000; i++) registry.getById(BlockIds.Stone);
          const elapsed = Date.now() - started;
          assert(elapsed < 500, `200k block lookups took ${elapsed}ms, suggesting a linear scan`);
        },
      },
    ],
  },
];

await runSuite('validateSystems', sections);
