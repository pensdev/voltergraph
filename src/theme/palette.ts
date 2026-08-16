import { hex, type Color } from '../core/color.js';

export interface Theme {
  name: string;
  /** Page/card background. */
  bg: Color;
  /** Plot well background. */
  plot: Color;
  /** Raised panel fill (tooltips, legend). */
  panel: Color;
  /** Primary text and axis lines. */
  ink: Color;
  /** Secondary text (tick labels). */
  inkSoft: Color;
  /** Gridlines. */
  grid: Color;
  /** Bevel highlight. */
  light: Color;
  /** Bevel shade. */
  dark: Color;
  /** Hard drop shadow under panels. */
  shadow: Color;
  series: Color[];
}

/**
 * The default face: warm parchment ground, near-black ink, saturated but
 * slightly muted series colors. Kept to a small fixed set on purpose — an
 * unbounded generated palette is what makes retro charts look fake.
 */
export const origins: Theme = {
  name: 'origins',
  bg: hex('#ede6d5'),
  plot: hex('#f6f1e3'),
  panel: hex('#e2d9c4'),
  ink: hex('#2b2b3a'),
  inkSoft: hex('#6f6a5e'),
  grid: hex('#cdc3ab'),
  light: hex('#fffdf6'),
  dark: hex('#b8ad93'),
  shadow: hex('#9a9081'),
  series: [
    hex('#e0a428'),
    hex('#c4483f'),
    hex('#4a7fbd'),
    hex('#78a83f'),
    hex('#8a5fb0'),
    hex('#3fa39b'),
    hex('#d9762c'),
    hex('#cc6f9e'),
  ],
};

/** Night variant — same structure, cool ground. */
export const midnight: Theme = {
  name: 'midnight',
  bg: hex('#1d1f2b'),
  plot: hex('#262a38'),
  panel: hex('#323749'),
  ink: hex('#eae6dc'),
  inkSoft: hex('#9aa0b4'),
  grid: hex('#3a4053'),
  light: hex('#4b5268'),
  dark: hex('#161822'),
  shadow: hex('#101219'),
  series: [
    hex('#f2c14e'),
    hex('#e0625a'),
    hex('#5b9bd8'),
    hex('#8dc44f'),
    hex('#a37ad0'),
    hex('#4fc0b6'),
    hex('#f08a3c'),
    hex('#e28ab8'),
  ],
};

export const themes: Record<string, Theme> = { origins, midnight };

export function resolveTheme(theme?: Theme | string): Theme {
  if (!theme) return origins;
  if (typeof theme === 'string') {
    const t = themes[theme];
    if (!t) throw new Error(`volter-graph: unknown theme "${theme}"`);
    return t;
  }
  return theme;
}

export function seriesColor(theme: Theme, index: number): Color {
  return theme.series[index % theme.series.length];
}
