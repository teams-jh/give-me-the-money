import type {
  TypeAction,
  PaletteColor,
  ColorSystemOptions,
  PaletteColorChannel,
} from '@mui/material/styles';
import type { SchemesRecord } from '../types';

import { varAlpha, createPaletteChannel } from 'minimal-shared/utils';

import { opacity } from './opacity';

// ----------------------------------------------------------------------

/**
 * TypeScript extension for MUI theme augmentation.
 * @to {@link file://./../extend-theme-types.d.ts}
 */

// Keys for core palette colors
export type PaletteColorKey = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';
export type CommonColorsKeys = 'black' | 'white';

// Palette color without channels
export type PaletteColorNoChannels = Omit<PaletteColor, 'lighterChannel' | 'darkerChannel'>;

// Palette color with channels
export type PaletteColorWithChannels = PaletteColor & PaletteColorChannel;

// Extended palette color shades
export type PaletteColorExtend = {
  lighter: string;
  darker: string;
  lighterChannel: string;
  darkerChannel: string;
};

// Extended common colors
export type CommonColorsExtend = {
  whiteChannel: string;
  blackChannel: string;
};

// Extended text colors
export type TypeTextExtend = {
  disabledChannel: string;
};

// Extended background colors
export type TypeBackgroundExtend = {
  neutral: string;
  neutralChannel: string;
};

// Extended grey colors
export type GreyExtend = {
  '50Channel': string;
  '100Channel': string;
  '200Channel': string;
  '300Channel': string;
  '400Channel': string;
  '500Channel': string;
  '600Channel': string;
  '700Channel': string;
  '800Channel': string;
  '900Channel': string;
};

// Extended palette
export type PaletteExtend = {
  shared: {
    inputOutlined: string;
    inputUnderline: string;
    paperOutlined: string;
    buttonOutlined: string;
  };
};

/**
 * ➤
 * ➤ ➤ Core palette (primary, secondary, info, success, warning, error, common, grey)
 * ➤
 */
export const primary = createPaletteChannel({
  lighter: '#C8FAD6',
  light: '#5BE49B',
  main: '#00A76F',
  dark: '#007867',
  darker: '#004B50',
  contrastText: '#FFFFFF',
}) as any;
export const secondary = createPaletteChannel({
  lighter: '#EFD6FF',
  light: '#C684FF',
  main: '#8E33FF',
  dark: '#5119B7',
  darker: '#27097A',
  contrastText: '#FFFFFF',
}) as any;
export const info = createPaletteChannel({
  lighter: '#CAFDF5',
  light: '#61F3F3',
  main: '#00B8D9',
  dark: '#006C9C',
  darker: '#003768',
  contrastText: '#FFFFFF',
}) as any;
export const success = createPaletteChannel({
  lighter: '#D3FCD2',
  light: '#77ED8B',
  main: '#22C55E',
  dark: '#118D57',
  darker: '#065E49',
  contrastText: '#ffffff',
}) as any;
export const warning = createPaletteChannel({
  lighter: '#FFF5CC',
  light: '#FFD666',
  main: '#FFAB00',
  dark: '#B76E00',
  darker: '#7A4100',
  contrastText: '#1C252E',
}) as any;
export const error = createPaletteChannel({
  lighter: '#FFE9D5',
  light: '#FFAC82',
  main: '#FF5630',
  dark: '#B71D18',
  darker: '#7A0916',
  contrastText: '#FFFFFF',
}) as any;
export const common = createPaletteChannel({
  black: '#000000',
  white: '#FFFFFF',
}) as any;
export const grey = createPaletteChannel({
  50: '#FCFDFD',
  100: '#F9FAFB',
  200: '#F4F6F8',
  300: '#DFE3E8',
  400: '#C4CDD5',
  500: '#919EAB',
  600: '#637381',
  700: '#454F5B',
  800: '#1C252E',
  900: '#141A21',
}) as any;

/**
 * ➤
 * ➤ ➤ Text, background, action
 * ➤
 */
export const text = {
  light: createPaletteChannel({ primary: grey[800], secondary: grey[600], disabled: grey[500] }),
  dark: createPaletteChannel({ primary: '#FFFFFF', secondary: grey[500], disabled: grey[600] }),
};

export const background = {
  light: createPaletteChannel({ paper: '#FFFFFF', default: '#FFFFFF', neutral: grey[200] }),
  dark: createPaletteChannel({ paper: grey[800], default: grey[900], neutral: '#28323D' }),
};

export const action = (mode: 'light' | 'dark'): Partial<TypeAction> => ({
  active: mode === 'light' ? grey[600] : grey[500],
  hover: varAlpha(grey['500Channel'], 0.08),
  selected: varAlpha(grey['500Channel'], 0.16),
  focus: varAlpha(grey['500Channel'], 0.24),
  disabled: varAlpha(grey['500Channel'], 0.8),
  disabledBackground: varAlpha(grey['500Channel'], 0.24),
  hoverOpacity: 0.08,
  selectedOpacity: 0.08,
  focusOpacity: 0.12,
  activatedOpacity: 0.12,
  disabledOpacity: 0.48,
});

/**
 * ➤
 * ➤ ➤ Extended palette
 * ➤
 */
export const extendPalette: PaletteExtend = {
  shared: {
    inputUnderline: varAlpha(grey['500Channel'], opacity.inputUnderline),
    inputOutlined: varAlpha(grey['500Channel'], 0.2),
    paperOutlined: varAlpha(grey['500Channel'], 0.16),
    buttonOutlined: varAlpha(grey['500Channel'], 0.32),
  },
};

/**
 * ➤
 * ➤ ➤ Base configuration
 * ➤
 */
const basePalette: ColorSystemOptions['palette'] = {
  primary,
  secondary,
  info,
  success,
  warning,
  error,
  common,
  grey,
  divider: varAlpha(grey['500Channel'], 0.2),
  TableCell: { border: varAlpha(grey['500Channel'], 0.2) },
  ...extendPalette,
};

/* **********************************************************************
 * 📦 Final
 * **********************************************************************/
export const palette: SchemesRecord<ColorSystemOptions['palette']> = {
  light: {
    ...basePalette,
    text: text.light,
    background: background.light,
    action: action('light'),
  },
  dark: {
    ...basePalette,
    text: text.dark,
    background: background.dark,
    action: action('dark'),
  },
};

export const colorKeys: {
  palette: PaletteColorKey[];
  common: CommonColorsKeys[];
} = {
  palette: ['primary', 'secondary', 'info', 'success', 'warning', 'error'],
  common: ['black', 'white'],
};
