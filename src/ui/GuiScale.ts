export type GuiScaleSetting = 0 | 1 | 2 | 3;

let currentGuiScaleSetting: GuiScaleSetting = 0;

export function setGlobalGuiScaleSetting(setting: GuiScaleSetting): void {
  currentGuiScaleSetting = normalizeGuiScale(setting);
  applyGuiScaleCssVariables();
}

export function getGlobalGuiScaleSetting(): GuiScaleSetting {
  return currentGuiScaleSetting;
}

export function normalizeGuiScale(value: unknown): GuiScaleSetting {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

export function guiScaleLabel(setting: GuiScaleSetting): string {
  if (setting === 0) return 'Auto';
  if (setting === 1) return 'Small';
  if (setting === 2) return 'Normal';
  return 'Large';
}

export function nextGuiScale(setting: GuiScaleSetting): GuiScaleSetting {
  return (((normalizeGuiScale(setting) + 1) % 4) as GuiScaleSetting);
}

export function computeGuiScale(setting: GuiScaleSetting = currentGuiScaleSetting): number {
  if (typeof window === 'undefined') return setting === 0 ? 3 : setting;
  const normalized = normalizeGuiScale(setting);
  if (normalized !== 0) return normalized;
  let scale = 1;
  while (scale < 4 && window.innerWidth / (scale + 1) >= 320 && window.innerHeight / (scale + 1) >= 240) scale++;
  return scale;
}

export function logicalWidth(setting: GuiScaleSetting = currentGuiScaleSetting): number {
  return Math.max(1, Math.floor((typeof window === 'undefined' ? 854 : window.innerWidth) / computeGuiScale(setting)));
}

export function logicalHeight(setting: GuiScaleSetting = currentGuiScaleSetting): number {
  return Math.max(1, Math.floor((typeof window === 'undefined' ? 480 : window.innerHeight) / computeGuiScale(setting)));
}

export function applyGuiScaleCssVariables(setting: GuiScaleSetting = currentGuiScaleSetting): void {
  if (typeof document === 'undefined') return;
  const scale = computeGuiScale(setting);
  document.documentElement.style.setProperty('--mc-gui-scale', String(scale));
}
