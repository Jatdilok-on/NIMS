export type ThemeId = 'light' | 'dark' | 'midnight' | 'emerald' | 'indigo' | 'nord';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  isDark: boolean;
  sidebarHex: string;
  accentHex: string;
  bgHex: string;
}

export const NIMS_THEMES: ThemeDefinition[] = [
  {
    id: 'light',
    name: 'Enterprise Light',
    isDark: false,
    sidebarHex: '#0f2942',
    accentHex: '#2563eb',
    bgHex: '#f3f5f8',
  },
  {
    id: 'dark',
    name: 'Dark Obsidian',
    isDark: true,
    sidebarHex: '#090f1d',
    accentHex: '#3b82f6',
    bgHex: '#0b1120',
  },
  {
    id: 'midnight',
    name: 'Midnight NOC',
    isDark: true,
    sidebarHex: '#050c1a',
    accentHex: '#06b6d4',
    bgHex: '#060d1f',
  },
  {
    id: 'emerald',
    name: 'Emerald Forest',
    isDark: false,
    sidebarHex: '#064e3b',
    accentHex: '#059669',
    bgHex: '#f0fdf7',
  },
  {
    id: 'indigo',
    name: 'Royal Indigo',
    isDark: false,
    sidebarHex: '#1e1b4b',
    accentHex: '#4f46e5',
    bgHex: '#f5f6ff',
  },
  {
    id: 'nord',
    name: 'Nordic Slate',
    isDark: true,
    sidebarHex: '#191f2a',
    accentHex: '#38bdf8',
    bgHex: '#1e2430',
  },
];

export function isValidThemeId(val: unknown): val is ThemeId {
  return typeof val === 'string' && NIMS_THEMES.some((t) => t.id === val);
}

export function getThemeDefinition(id: ThemeId): ThemeDefinition {
  return NIMS_THEMES.find((t) => t.id === id) ?? NIMS_THEMES[0];
}
