/**
 * Command definitions for `/time`, `/summon`, `/give`, `/tp`, `/weather`.
 */

import type { CommandRegistry } from '../CommandRegistry';
import { validateNumeric } from '../CommandParser';
import { DEFAULT_SPAWN_EGG_DESCRIPTORS, spawnEggDescriptorByNumericId } from '../../entities/SpawnEggDescriptor';
import { DEFAULT_ITEM_DEFINITIONS } from '../../items/ItemDefinitionRegistry';
import { CheatsState } from '../CheatsState';
import type { CommandWorldBinding } from '../CommandWorldBinding';

function getEntityNames(): string[] {
  return Object.values(DEFAULT_SPAWN_EGG_DESCRIPTORS).map((d) => d.displayName);
}

function getItemNames(): string[] {
  return DEFAULT_ITEM_DEFINITIONS.values()
    .filter((d) => d.creativeVisible !== false)
    .map((d) => d.id)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();
}

/**
 * Registers the built-in commands.
 *
 * `binding` is the live world/player surface. When it is absent (headless or
 * validation contexts) commands parse and validate exactly as normal but
 * report that no world is loaded instead of pretending to succeed.
 */
export function registerDefaultCommands(
  registry: CommandRegistry,
  cheats?: CheatsState,
  binding?: CommandWorldBinding,
): void {
  const checkCheats = (message?: string) => {
    if (!cheats || !cheats.isEnabled()) {
      return { success: false, message: message || 'Cheats are not enabled for this world.' };
    }
    return null;
  };

  /** Guard used by every command that must mutate the world. */
  const requireWorld = (): CommandWorldBinding | { success: false; message: string } =>
    binding ?? { success: false, message: 'No world is loaded.' };

  const isFailure = (v: unknown): v is { success: false; message: string } =>
    typeof v === 'object' && v !== null && 'success' in v;

  /** Beta day/night presets used by `/time set day|night`. */
  const TIME_DAY = 1000;
  const TIME_NIGHT = 13000;
  const TICKS_PER_DAY = 24000;

  /**
   * Parses a coordinate that may be absolute (`64`) or relative to a base
   * (`~`, `~10`, `~-3`), matching Beta's tilde notation.
   */
  const resolveCoord = (arg: string, base: number): number | undefined => {
    if (arg.startsWith('~')) {
      const rest = arg.slice(1);
      if (rest === '') return base;
      const delta = Number(rest);
      return Number.isFinite(delta) ? base + delta : undefined;
    }
    const value = Number(arg);
    return Number.isFinite(value) ? value : undefined;
  };

  // /time
  registry.register({
    name: 'time',
    aliases: ['t'],
    usage: '/time set <value> | /time set day | /time set night | /time add <value>',
    description: 'Controls world time.',
    execute: (ctx: { args: string[]; raw: string }) => {
      // Every world-mutating command is cheat-gated; /time was the last one
      // missing the check, so it worked in worlds with cheats disabled.
      const blocked = checkCheats('Cheats must be enabled to use /time.');
      if (blocked) return blocked;
      if (ctx.args.length === 0) {
        return { success: false, message: 'Usage: /time set <value> | /time set day | /time set night | /time add <value>' };
      }
      const sub = ctx.args[0]?.toLowerCase() ?? '';
      if (sub === 'set') {
        if (ctx.args.length < 2) {
          return { success: false, message: 'Usage: /time set <value>' };
        }
        const bound = requireWorld();
        if (isFailure(bound)) return bound;
        const valueStr = ctx.args[1]!.toLowerCase();
        if (valueStr === 'day') {
          bound.world.setTimeTicks(TIME_DAY);
          return { success: true, message: `Set time to ${TIME_DAY} (day)` };
        }
        if (valueStr === 'night') {
          bound.world.setTimeTicks(TIME_NIGHT);
          return { success: true, message: `Set time to ${TIME_NIGHT} (night)` };
        }
        const value = validateNumeric(ctx.args[1]!, 'time');
        if (value === undefined || value < 0 || value > TICKS_PER_DAY) {
          return { success: false, message: `Invalid time value: ${ctx.args[1]}` };
        }
        bound.world.setTimeTicks(Math.floor(value));
        return { success: true, message: `Set time to ${Math.floor(value)}` };
      }
      if (sub === 'add') {
        if (ctx.args.length < 2) {
          return { success: false, message: 'Usage: /time add <value>' };
        }
        const bound = requireWorld();
        if (isFailure(bound)) return bound;
        const value = validateNumeric(ctx.args[1]!, 'time');
        if (value === undefined) {
          return { success: false, message: `Invalid time value: ${ctx.args[1]}` };
        }
        const added = Math.floor(value);
        bound.world.setTimeTicks(bound.world.getTimeTicks() + added);
        return { success: true, message: `Added ${added} ticks` };
      }
      return { success: false, message: `Unknown /time subcommand: ${sub}` };
    },
    suggest: (_prevArgs, partial) => {
      const candidates = ['set', 'add', 'day', 'night'];
      return candidates.filter((c) => c.toLowerCase().startsWith(partial.toLowerCase()));
    },
  });

  // /summon
  registry.register({
    name: 'summon',
    aliases: ['spawn'],
    usage: '/summon <entity> [x] [y] [z]',
    description: 'Spawns a living entity.',
    execute: (ctx: { args: string[]; raw: string }) => {
      const blocked = checkCheats('Cheats must be enabled to use /summon.');
      if (blocked) return blocked;
      if (ctx.args.length === 0) {
        return { success: false, message: 'Usage: /summon <entity> [x] [y] [z]' };
      }
      const entityName = ctx.args[0]!.toLowerCase();
      const descriptorIds = Object.keys(DEFAULT_SPAWN_EGG_DESCRIPTORS);
      const match = descriptorIds.find(
        (id) => id.toLowerCase() === entityName || DEFAULT_SPAWN_EGG_DESCRIPTORS[id]?.displayName?.toLowerCase() === entityName,
      );
      if (!match) {
        return { success: false, message: `Unknown entity: ${ctx.args[0]}` };
      }
      const bound = requireWorld();
      if (isFailure(bound)) return bound;
      // Beta spawns at the player unless coordinates are supplied.
      const at = bound.player.getPosition();
      let x = at.x, y = at.y, z = at.z;
      if (ctx.args.length > 1) x = resolveCoord(ctx.args[1]!, at.x) ?? at.x;
      if (ctx.args.length > 2) y = resolveCoord(ctx.args[2]!, at.y) ?? at.y;
      if (ctx.args.length > 3) z = resolveCoord(ctx.args[3]!, at.z) ?? at.z;
      const name = DEFAULT_SPAWN_EGG_DESCRIPTORS[match]?.displayName ?? match;
      if (!bound.world.summon(match, x, y, z)) {
        return { success: false, message: `Could not summon ${name} there.` };
      }
      return { success: true, message: `Summoned ${name} at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})` };
    },
    suggest: (prevArgs, partial) => {
      if (prevArgs.length === 0) {
        return getEntityNames().filter((n) => n.toLowerCase().startsWith(partial.toLowerCase()));
      }
      return [];
    },
  });

  // /give
  registry.register({
    name: 'give',
    usage: '/give <item> [count] [metadata]',
    description: 'Gives items to the active player.',
    execute: (ctx: { args: string[]; raw: string }) => {
      const blocked = checkCheats('Cheats must be enabled to use /give.');
      if (blocked) return blocked;
      if (ctx.args.length === 0) {
        return { success: false, message: 'Usage: /give <item> [count] [metadata]' };
      }
      const itemName = ctx.args[0]!.toLowerCase();
      let definition = DEFAULT_ITEM_DEFINITIONS.get(itemName);
      if (!definition) {
        // Try numeric lookup
        const numeric = Number(itemName);
        if (!isNaN(numeric)) {
          definition = DEFAULT_ITEM_DEFINITIONS.get(numeric);
        }
      }
      if (!definition) {
        return { success: false, message: `Item "${ctx.args[0]}" not found.` };
      }
      let count = 1;
      if (ctx.args.length > 1) {
        const parsed = validateNumeric(ctx.args[1]!, 'count');
        if (parsed !== undefined) {
          count = Math.max(1, Math.min(definition.stackSize * 10, Math.floor(parsed)));
        } else {
          return { success: false, message: `Invalid count: ${ctx.args[1]}` };
        }
      }
      let metadata = 0;
      if (ctx.args.length > 2) {
        const metaParsed = validateNumeric(ctx.args[2]!, 'metadata');
        if (metaParsed !== undefined) {
          metadata = Math.floor(metaParsed);
        } else {
          return { success: false, message: `Invalid metadata: ${ctx.args[2]}` };
        }
      }
      // Special spawn egg syntax: /give spawn_egg 1 Zombie
      if (definition.id === 'spawn_egg' && ctx.args.length > 2 && !isNaN(Number(ctx.args[2]))) {
        // If the third arg is numeric, treat second as count; if not numeric and item is spawn_egg, treat third as entity name
      } else if (definition.id === 'spawn_egg' && ctx.args.length > 1 && isNaN(Number(ctx.args[1]))) {
        // /give spawn_egg Zombie (with default count 1)
        const entityName = ctx.args[1]!.toLowerCase();
        const descriptorIds = Object.keys(DEFAULT_SPAWN_EGG_DESCRIPTORS);
        const match = descriptorIds.find(
          (id) => id.toLowerCase() === entityName || DEFAULT_SPAWN_EGG_DESCRIPTORS[id]?.displayName?.toLowerCase() === entityName,
        );
        if (match) {
          const descriptor = DEFAULT_SPAWN_EGG_DESCRIPTORS[match]!;
          metadata = descriptor.entityNumericId as number;
          count = ctx.args[2] ? (validateNumeric(ctx.args[2]!, 'count') ?? 1) : 1;
        }
      }
      const bound = requireWorld();
      if (isFailure(bound)) return bound;
      // Spawn eggs are named from the entity descriptor, not the item table.
      const label = definition.id === 'spawn_egg'
        ? (spawnEggDescriptorByNumericId(metadata)?.itemName ?? 'Spawn Egg')
        : (definition.displayName ?? definition.id);
      const taken = bound.player.giveItem(definition.id, 'item', count, metadata);
      if (taken <= 0) return { success: false, message: 'No room in inventory.' };
      const partial = taken < count ? ` (${count - taken} did not fit)` : '';
      return { success: true, message: `Gave ${taken} ${label}${partial}` };
    },
    suggest: (_prevArgs, partial) => {
      const candidates = getItemNames();
      return candidates.filter((c) => c.toLowerCase().startsWith(partial.toLowerCase()));
    },
  });

  // /tp
  registry.register({
    name: 'tp',
    usage: '/tp <x> <y> <z>',
    description: 'Teleports the active player.',
    execute: (ctx: { args: string[]; raw: string }) => {
      const blocked = checkCheats('Cheats must be enabled to use /tp.');
      if (blocked) return blocked;
      if (ctx.args.length < 3) {
        return { success: false, message: 'Usage: /tp <x> <y> <z>' };
      }
      const parseCoord = (arg: string, base?: number): number | undefined => {
        if (arg.startsWith('~')) {
          const relStr = arg.slice(1);
          const relValue = relStr === '' ? 0 : (Number(relStr) || 0);
          return base !== undefined ? base + relValue : relValue;
        }
        const val = Number(arg);
        if (isNaN(val) || !Number.isFinite(val)) return undefined;
        return val;
      };
      const bound = requireWorld();
      if (isFailure(bound)) return bound;
      // Relative coords are relative to the PLAYER, not the origin.
      const at = bound.player.getPosition();
      const x = parseCoord(ctx.args[0]!, at.x);
      const y = parseCoord(ctx.args[1]!, at.y);
      const z = parseCoord(ctx.args[2]!, at.z);
      if (x === undefined || y === undefined || z === undefined) {
        return { success: false, message: 'Coordinates must be finite numbers or valid relative expressions (~, ~10, ~-3).' };
      }
      bound.player.teleport(x, y, z);
      return { success: true, message: `Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}` };
    },
    suggest: () => [],
  });

  // /weather
  registry.register({
    name: 'weather',
    usage: '/weather <clear|rain|thunder> [duration]',
    description: 'Controls weather.',
    execute: (ctx: { args: string[]; raw: string }) => {
      // Beta gates world-mutating commands behind cheats; /weather was missing it.
      const blocked = checkCheats('Cheats must be enabled to use /weather.');
      if (blocked) return blocked;
      if (ctx.args.length === 0) {
        return { success: false, message: 'Usage: /weather <clear|rain|thunder> [duration]' };
      }
      const type = ctx.args[0]!.toLowerCase();
      const valid = ['clear', 'rain', 'thunder'];
      if (!valid.includes(type)) {
        return { success: false, message: `Unknown weather type: ${type}` };
      }
      const bound = requireWorld();
      if (isFailure(bound)) return bound;
      let duration = 0;
      let durationMsg = '';
      if (ctx.args.length > 1) {
        const val = validateNumeric(ctx.args[1]!, 'duration');
        if (val !== undefined && val > 0) {
          duration = Math.floor(val);
          durationMsg = ` for ${duration} ticks`;
        }
      }
      bound.world.setWeather(type as 'clear' | 'rain' | 'thunder', duration);
      return { success: true, message: `Weather set to ${type}${durationMsg}` };
    },
    suggest: (_prevArgs, partial) => {
      const candidates = ['clear', 'rain', 'thunder'];
      return candidates.filter((c) => c.toLowerCase().startsWith(partial.toLowerCase()));
    },
  });
}
