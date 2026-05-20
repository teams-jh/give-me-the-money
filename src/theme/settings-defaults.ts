import type { ThemeColorPreset } from './with-settings/color-presets';

import { CONFIG } from 'src/global-config';

import { themeConfig } from './theme-config';

// ----------------------------------------------------------------------

export type SettingsState = {
  fontSize: number;
  fontFamily: string;
  primaryColor: ThemeColorPreset;
  version: string;
};

export const defaultSettings: SettingsState = {
  fontSize: 16,
  fontFamily: themeConfig.fontFamily.primary,
  primaryColor: 'preset1',
  version: CONFIG.appVersion,
};
