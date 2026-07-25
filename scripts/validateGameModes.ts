import { GameMode, isCreativeMode, isSurvivalMode, parseGameMode } from '../src/player/GameMode.ts';
import { Player } from '../src/player/Player.ts';
import { DamageSource } from '../src/entities/damage/DamageSource.ts';
import { assert, assertEqual, runSuite, type TestCase } from './persistence2Harness.ts';

const tests: TestCase[] = [
  {
    name: 'game mode parser accepts only current modes and defaults to survival',
    run: async () => {
      assertEqual(parseGameMode(GameMode.Survival), GameMode.Survival, 'survival parses');
      assertEqual(parseGameMode(GameMode.Creative), GameMode.Creative, 'creative parses');
      assertEqual(parseGameMode('adventure'), GameMode.Survival, 'unknown mode defaults to survival');
      assertEqual(parseGameMode(undefined), GameMode.Survival, 'missing mode defaults to survival');
      assert(isSurvivalMode(GameMode.Survival), 'survival predicate');
      assert(!isSurvivalMode(GameMode.Creative), 'survival predicate excludes creative');
      assert(isCreativeMode(GameMode.Creative), 'creative predicate');
      assert(!isCreativeMode(GameMode.Survival), 'creative predicate excludes survival');
    },
  },
  {
    name: 'player game mode controls creative immunity, exhaustion and flight',
    run: async () => {
      const player = new Player(0, 64, 0);
      player.setGameMode(GameMode.Creative);
      player.isFlying = true;
      assert(player.canFly(), 'creative player can fly');
      assert(player.isCreativeMode(), 'player reports creative mode');
      const healthBefore = player.health;
      assert(!player.attackEntityFrom(DamageSource.generic(), 5), 'creative player ignores ordinary damage');
      assertEqual(player.health, healthBefore, 'creative damage does not change health');
      player.addExhaustion(5);
      assertEqual(player.exhaustion, 0, 'creative player does not accumulate exhaustion');
      player.setGameMode(GameMode.Survival);
      assert(!player.canFly(), 'survival player cannot fly');
      assert(!player.isFlying, 'switching out of creative disables flight');
      assert(player.isSurvivalMode(), 'player reports survival mode');
      assert(player.attackEntityFrom(DamageSource.generic(), 2), 'survival player accepts ordinary damage');
      assertEqual(player.health, healthBefore - 2, 'survival damage changes health');
    },
  },
];

await runSuite('validateGameModes', tests);
