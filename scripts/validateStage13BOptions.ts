import { DEFAULT_GAME_SETTINGS, DEFAULT_KEY_BINDINGS, updateBinding, validateGameSettings } from '../src/settings/GameSettings.ts';
import { loadGameSettings, saveGameSettings } from '../src/settings/SettingsStorage.ts';
import { MemoryStorageBackend } from '../src/persistence2/backend/MemoryStorageBackend.ts';
import { Difficulty } from '../src/world/Difficulty.ts';
import { guiScaleLabel, nextGuiScale, normalizeGuiScale, computeGuiScale } from '../src/ui/GuiScale.ts';
import { assertEqual, runSuite, type TestCase } from './persistence2Harness.ts';

const tests: TestCase[] = [
  {
    name: 'settings validation clamps audio/video values and preserves valid controls',
    run: async () => {
      const settings = validateGameSettings({
        audio: { master: 2, music: -1, sound: 0.25 },
        mouse: { sensitivity: 4, invertY: true },
        video: { viewBobbing: false, guiScale: 3 },
        controls: { bindings: { forward: ['ArrowUp'], pause: ['Escape'] } },
        gameplay: { difficulty: Difficulty.Hard },
      });
      assertEqual(settings.audio.master, 1, 'master volume clamps high');
      assertEqual(settings.audio.music, 0, 'music volume clamps low');
      assertEqual(settings.audio.sound, 0.25, 'sound volume preserves valid value');
      assertEqual(settings.mouse.sensitivity, 1, 'sensitivity clamps high');
      assertEqual(settings.mouse.invertY, true, 'invert mouse setting preserved');
      assertEqual(settings.video.viewBobbing, false, 'view bobbing setting preserved');
      assertEqual(settings.video.guiScale, 3, 'gui scale setting preserved');
      assertEqual(settings.controls.bindings.forward[0], 'ArrowUp', 'custom forward binding preserved');
      assertEqual(settings.controls.bindings.pause[0], 'Escape', 'pause binding preserved');
      assertEqual(settings.gameplay.difficulty, Difficulty.Hard, 'difficulty setting preserved');
    },
  },
  {
    name: 'GUI scale helpers cycle and normalize Stage 13B options deterministically',
    run: async () => {
      assertEqual(normalizeGuiScale(99), 0, 'invalid GUI scale normalizes to auto');
      assertEqual(guiScaleLabel(0), 'Auto', 'auto label');
      assertEqual(guiScaleLabel(1), 'Small', 'small label');
      assertEqual(guiScaleLabel(2), 'Normal', 'normal label');
      assertEqual(guiScaleLabel(3), 'Large', 'large label');
      assertEqual(nextGuiScale(0), 1, 'auto cycles to small');
      assertEqual(nextGuiScale(1), 2, 'small cycles to normal');
      assertEqual(nextGuiScale(2), 3, 'normal cycles to large');
      assertEqual(nextGuiScale(3), 0, 'large cycles to auto');
      assertEqual(computeGuiScale(2), 2, 'explicit GUI scale is respected outside browser');
    },
  },
  {
    name: 'settings storage round-trips through the current backend record path',
    run: async () => {
      const backend = new MemoryStorageBackend();
      await backend.open();
      const defaultSettings = await loadGameSettings(backend);
      assertEqual(defaultSettings.video.viewBobbing, DEFAULT_GAME_SETTINGS.video.viewBobbing, 'missing settings load defaults');
      const rebound = updateBinding(DEFAULT_GAME_SETTINGS, 'inventory', 'KeyI');
      await saveGameSettings(backend, rebound);
      const loaded = await loadGameSettings(backend);
      assertEqual(loaded.controls.bindings.inventory[0], 'KeyI', 'saved key binding loads');
      assertEqual(loaded.controls.bindings.forward[0], DEFAULT_KEY_BINDINGS.forward[0], 'untouched binding stays default');
      await backend.close();
    },
  },
];

await runSuite('validateStage13BOptions', tests);
