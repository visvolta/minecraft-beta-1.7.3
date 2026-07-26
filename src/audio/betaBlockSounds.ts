import { BlockIds } from '../blocks/BlockId';
import type { BlockSoundDefinition, DigSoundMaterial, StepSoundMaterial } from './BlockSoundMaterial';

/**
 * Beta 1.7.3 per-block sound materials, transcribed from the `setStepSound`
 * calls in the decompiled `Block.java` static initialiser.
 *
 * Previously only one block declared a sound and everything else fell back to
 * the stone default, which is why flowers, grass, sand and wood all broke and
 * placed with stone sounds. Declaring the whole table here keeps the mapping
 * in one place instead of scattering block-specific conditionals through the
 * audio manager.
 *
 * Beta's `StepSound` types map onto this project's materials as:
 *   soundStoneFootstep / soundPowderFootstep -> stone
 *   soundWoodFootstep                        -> wood
 *   soundGrassFootstep                       -> grass
 *   soundGravelFootstep                      -> gravel
 *   soundSandFootstep                        -> sand
 *   soundClothFootstep                       -> cloth
 *   soundGlassFootstep                       -> glass (steps fall back to stone)
 *   soundMetalFootstep                       -> stone at pitch 1.5
 */

/** Beta `soundMetalFootstep` is the stone sound played 1.5x higher. */
const METAL_PITCH = 1.5;

function sound(dig: DigSoundMaterial, step: StepSoundMaterial, pitch?: number): BlockSoundDefinition {
  return pitch === undefined ? { dig, step } : { dig, step, pitch };
}

const STONE = sound('stone', 'stone');
const WOOD = sound('wood', 'wood');
const GRASS = sound('grass', 'grass');
const GRAVEL = sound('gravel', 'gravel');
const SAND = sound('sand', 'sand');
const CLOTH = sound('cloth', 'cloth');
/** Glass breaks with a shatter but is walked on like stone. */
const GLASS = sound('glass', 'stone');
const METAL = sound('stone', 'stone', METAL_PITCH);

export const BETA_BLOCK_SOUNDS: Readonly<Record<number, BlockSoundDefinition>> = {
  [BlockIds.Stone]: STONE,
  [BlockIds.Cobblestone]: STONE,
  [BlockIds.MossyCobblestone]: STONE,
  [BlockIds.Bedrock]: STONE,
  [BlockIds.Obsidian]: STONE,
  [BlockIds.Netherrack]: STONE,
  [BlockIds.SandStone]: STONE,
  [BlockIds.LapisBlock]: STONE,
  [BlockIds.BrickBlock]: STONE,
  [BlockIds.CobblestoneStairs]: STONE,
  [BlockIds.CoalOre]: STONE,
  [BlockIds.IronOre]: STONE,
  [BlockIds.GoldOre]: STONE,
  [BlockIds.DiamondOre]: STONE,
  [BlockIds.LapisOre]: STONE,
  [BlockIds.RedstoneOre]: STONE,
  [BlockIds.Furnace]: STONE,
  [BlockIds.FurnaceBurning]: STONE,
  [BlockIds.Slab]: STONE,
  [BlockIds.DoubleSlab]: STONE,
  [BlockIds.StoneButton]: STONE,
  [BlockIds.StonePressurePlate]: STONE,
  [BlockIds.Spawner]: METAL,
  // Beta `redstoneWire` uses soundPowderFootstep, itself the stone sound.
  [BlockIds.RedstoneWire]: STONE,

  [BlockIds.Planks]: WOOD,
  [BlockIds.Log]: WOOD,
  [BlockIds.SpruceLog]: WOOD,
  [BlockIds.BirchLog]: WOOD,
  [BlockIds.Bookshelf]: WOOD,
  [BlockIds.Chest]: WOOD,
  [BlockIds.CraftingTable]: WOOD,
  [BlockIds.Fence]: WOOD,
  [BlockIds.WoodStairs]: WOOD,
  [BlockIds.WoodDoor]: WOOD,
  [BlockIds.Ladder]: WOOD,
  [BlockIds.SignPost]: WOOD,
  [BlockIds.WallSign]: WOOD,
  [BlockIds.Lever]: WOOD,
  [BlockIds.WoodPressurePlate]: WOOD,
  [BlockIds.Trapdoor]: WOOD,
  [BlockIds.Torch]: WOOD,
  [BlockIds.RedstoneTorchOn]: WOOD,
  [BlockIds.RedstoneTorchOff]: WOOD,
  [BlockIds.Pumpkin]: WOOD,
  [BlockIds.Fire]: WOOD,

  [BlockIds.Grass]: GRASS,
  [BlockIds.Leaves]: GRASS,
  [BlockIds.SpruceLeaves]: GRASS,
  [BlockIds.BirchLeaves]: GRASS,
  [BlockIds.TallGrass]: GRASS,
  [BlockIds.DeadBush]: GRASS,
  [BlockIds.Dandelion]: GRASS,
  [BlockIds.Rose]: GRASS,
  [BlockIds.BrownMushroom]: GRASS,
  [BlockIds.RedMushroom]: GRASS,
  [BlockIds.Sapling]: GRASS,
  [BlockIds.Crops]: GRASS,
  [BlockIds.Reed]: GRASS,
  [BlockIds.TNT]: GRASS,

  [BlockIds.Dirt]: GRAVEL,
  [BlockIds.Gravel]: GRAVEL,
  [BlockIds.Clay]: GRAVEL,
  [BlockIds.Farmland]: GRAVEL,
  [BlockIds.Podzol]: GRAVEL,

  [BlockIds.Sand]: SAND,
  // Beta `slowSand` uses soundSandFootstep.
  [BlockIds.SoulSand]: SAND,

  [BlockIds.Wool]: CLOTH,
  [BlockIds.Bed]: CLOTH,
  [BlockIds.Snow]: CLOTH,
  [BlockIds.SnowBlock]: CLOTH,
  [BlockIds.Cactus]: CLOTH,

  [BlockIds.Glass]: GLASS,
  [BlockIds.Ice]: GLASS,
  // Beta `glowStone` uses soundGlassFootstep.
  [BlockIds.Glowstone]: GLASS,

  [BlockIds.GoldBlock]: METAL,
  [BlockIds.IronBlock]: METAL,
  [BlockIds.DiamondBlock]: METAL,
  [BlockIds.IronDoor]: METAL,
  [BlockIds.Rail]: METAL,
  [BlockIds.PoweredRail]: METAL,
  [BlockIds.DetectorRail]: METAL,
};
