import { definePreset } from '@primeuix/themes'
import { BASE_PRESET } from '@/themes/basePreset'

// Full Tailwind CSS v3 50-950 color palettes used as PrimeVue primary tokens.
// Each theme sets all 11 shades so PrimeVue component hover/focus/active states
// are consistent (they reference --p-primary-300, --p-primary-700, etc. internally).
const PALETTES = {
  emerald: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },
  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },
  // NetXMS brand family - warm orange centered on #f99012 (logo gradient mid-point)
  flame: {
    50: '#fff9ed',
    100: '#fff2d0',
    200: '#fde4a2',
    300: '#fccf6a',
    400: '#fbb83c',
    500: '#f99012',
    600: '#df720a',
    700: '#b85808',
    800: '#934409',
    900: '#78350a',
    950: '#421805',
  },
  // NetXMS brand family - saturated red centered on #ed3118 (logo gradient start)
  crimson: {
    50: '#fff1ee',
    100: '#ffe1da',
    200: '#ffc3b6',
    300: '#fe9880',
    400: '#f95e49',
    500: '#ed3118',
    600: '#d42515',
    700: '#b01b0e',
    800: '#8e180e',
    900: '#75160f',
    950: '#400808',
  },
  // NetXMS brand family - sky blue, complements the dark-teal header
  ocean: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  },
}

/**
 * The NetXMS color themes (see THEMES in @/themes for the field list).
 *
 * Dark-header variants each try a different separation approach:
 *   flame   - header border separates header from nav (same nav color)
 *   crimson - no separator, unified dark panel (reference)
 *   ocean   - lighter nav distinguishes it from the header
 */
export const THEMES = {
  emerald: {
    id: 'emerald',
    label: 'Emerald',
    swatch: '#10b981',
    palette: PALETTES.emerald,
    preset: definePreset(BASE_PRESET, { semantic: { primary: PALETTES.emerald } }),
    headerTone: 'light',
    vars: {
      '--app-header-border': 'rgba(180, 180, 180, 0.3)',
    },
  },
  flame: {
    id: 'flame',
    label: 'Flame',
    swatch: '#f99012',
    palette: PALETTES.flame,
    preset: definePreset(BASE_PRESET, { semantic: { primary: PALETTES.flame } }),
    headerTone: 'dark',
    vars: {
      '--app-header-bg': '#0e324e',
      '--app-header-fg': '#c8dce8',
      '--app-header-border': 'rgba(255, 255, 255, 0.12)',
      '--app-nav-bg': '#0e324e',
      '--app-nav-border': '#1c4f70',
      '--app-nav-fg': '#c8dce8',
    },
  },
  crimson: {
    id: 'crimson',
    label: 'Crimson',
    swatch: '#ed3118',
    palette: PALETTES.crimson,
    preset: definePreset(BASE_PRESET, { semantic: { primary: PALETTES.crimson } }),
    headerTone: 'dark',
    vars: {
      '--app-header-bg': '#0e324e',
      '--app-header-fg': '#c8dce8',
      '--app-nav-bg': '#0e324e',
      '--app-nav-border': '#1c4f70',
      '--app-nav-fg': '#c8dce8',
    },
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    swatch: '#0ea5e9',
    palette: PALETTES.ocean,
    preset: definePreset(BASE_PRESET, { semantic: { primary: PALETTES.ocean } }),
    headerTone: 'dark',
    vars: {
      '--app-header-bg': '#0e324e',
      '--app-header-fg': '#c8dce8',
      '--app-nav-bg': '#1a4a6a',
      '--app-nav-border': '#235e84',
      '--app-nav-fg': '#dae6ec',
    },
  },
  blue: {
    id: 'blue',
    label: 'Blue',
    swatch: '#3b82f6',
    palette: PALETTES.blue,
    preset: definePreset(BASE_PRESET, { semantic: { primary: PALETTES.blue } }),
    headerTone: 'light',
    vars: {
      '--app-header-border': 'rgba(180, 180, 180, 0.3)',
    },
  },
}
