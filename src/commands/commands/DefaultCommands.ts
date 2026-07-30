/**
 * Command definitions for `/time`, `/summon`, `/give`, `/tp`, `/weather`.
 */

import type { CommandRegistry } from '../CommandRegistry';
import { validateNumeric } from '../CommandParser';
import { DEFAULT_SPAWN_EGG_DESCRIPTORS } from '../../entities/SpawnEggDescriptor';
import { DEFAULT_ITEM_DEFINITIONS } from '../../items/ItemDefinitionRegistry';
import { CheatsState } from '../CheatsState';

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

export function registerDefaultCommands(registry: CommandRegistry, cheats?: CheatsState): void {
  const checkCheats = (message?: string) => {
    if (!cheats || !cheats.isEnabled()) {
      return { success: false, message: message || 'Cheats are not enabled for this world.' };
    }
    return null;
  };

  // /time
  registry.register({
    name: 'time',
    aliases: ['t'],
    usage: '/time set <value> | /time set day | /time set night | /time add <value>',
    description: 'Controls world time.',
    execute: (ctx: { args: string[]; raw: string }) => {
      if (ctx.args.length === 0) {
        return { success: false, message: 'Usage: /time set <value> | /time set day | /time set night | /time add <value>' };
      }
      const sub = ctx.args[0]?.toLowerCase() ?? '';
      if (sub === 'set') {
        if (ctx.args.length < 2) {
          return { success: false, message: 'Usage: /time set <value>' };
        }
        const valueStr = ctx.args[1]!.toLowerCase();
        if (valueStr === 'day') {
          return { success: true, message: 'Set time to 1000 (day)' };
        }
        if (valueStr === 'night') {
          return { success: true, message: 'Set time to 13000 (night)' };
        }
        const value = validateNumeric(ctx.args[1]!, 'time');
        if (value === undefined || value < 0 || value > 24000) {
          return { success: false, message: `Invalid time value: ${ctx.args[1]}` };
        }
        return { success: true, message: `Set time to ${value}` };
      }
      if (sub === 'add') {
        if (ctx.args.length < 2) {
          return { success: false, message: 'Usage: /time add <value>' };
        }
        const value = validateNumeric(ctx.args[1]!, 'time');
        if (value === undefined) {
          return { success: false, message: `Invalid time value: ${ctx.args[1]}` };
        }
        return { success: true, message: `Added ${value} ticks` };
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
      let x = 0, y = 0, z = 0;
      if (ctx.args.length > 1) x = validateNumeric(ctx.args[1]!, 'x') ?? 0;
      if (ctx.args.length > 2) y = validateNumeric(ctx.args[2]!, 'y') ?? 0;
      if (ctx.args.length > 3) z = validateNumeric(ctx.args[3]!, 'z') ?? 0;
      return { success: true, message: `Summoned ${DEFAULT_SPAWN_EGG_DESCRIPTORS[match]?.displayName ?? match} at (${x}, ${y}, ${z})` };
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
      return { success: true, message: `Gave ${count} ${definition.displayName ?? definition.id}${metadata !== 0 ? ` (metadata: ${metadata})` : ''}` };
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
      const x = parseCoord(ctx.args[0]!, 0);
      const y = parseCoord(ctx.args[1]!, 0);
      const z = parseCoord(ctx.args[2]!, 0);
      if (x === undefined || y === undefined || z === undefined) {
        return { success: false, message: 'Coordinates must be finite numbers or valid relative expressions (~, ~10, ~-3).' };
      }
      return { success: true, message: `Teleported to ${x}, ${y}, ${z}` };
    },
    suggest: () => [],
  });

  // /weather
  registry.register({
    name: 'weather',
    usage: '/weather <clear|rain|thunder> [duration]',
    description: 'Controls weather.',
    execute: (ctx: { args: string[]; raw: string }) => {
      if (ctx.args.length === 0) {
        return { success: false, message: 'Usage: /weather <clear|rain|thunder> [duration]' };
      }
      const type = ctx.args[0]!.toLowerCase();
      const valid = ['clear', 'rain', 'thunder'];
      if (!valid.includes(type)) {
        return { success: false, message: `Unknown weather type: ${type}` };
      }
      let durationMsg = '';
      if (ctx.args.length > 1) {
        const val = validateNumeric(ctx.args[1]!, 'duration');
        if (val !== undefined) {
          durationMsg = ` for ${val} ticks`;
        }
      }
      return { success: true, message: `Weather set to ${type}${durationMsg}` };
    },
    suggest: (_prevArgs, partial) => {
      const candidates = ['clear', 'rain', 'thunder'];
      return candidates.filter((c) => c.toLowerCase().startsWith(partial.toLowerCase()));
    },
  });
}
