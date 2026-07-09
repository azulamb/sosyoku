import { type CurvePoint, DEFAULT_PRESSURE_CURVE } from './pressure-curve.ts';

export const DEFAULT_PALETTE: string[] = [
  '#F5F8FF', // soft white
  '#141820', // soft black
  '#7F8C99', // slate gray
  '#E0546B', // soft red
  '#E87A9E', // rose
  '#E0813A', // burnt orange
  '#F2C14E', // amber
  '#E8E06B', // pale yellow
  '#8FCB6E', // leaf green
  '#4FA37B', // pine green
  '#57C2C2', // teal
  '#5CA7D9', // sky blue
  '#3E6FB8', // deep blue
  '#6C63C4', // indigo
  '#9B6BC4', // violet
  '#C46BAF', // orchid
  '#7A5A4A', // umber
  '#A6836A', // tan
  '#C9A98B', // sand
  '#3A3F44', // charcoal
];

export type ThemeSetting = 'auto' | 'light' | 'dark';
export type LanguageSetting = 'auto' | 'ja' | 'en';
export type PenShape = 'round' | 'square';

export interface PenSetting {
  id: string;
  name: string;
  size: number;
  shape: PenShape;
}

export const DEFAULT_PENS: PenSetting[] = [
  { id: 'pen-default-thin', name: '細いペン', size: 6, shape: 'round' },
  { id: 'pen-default-thick', name: '太いペン', size: 20, shape: 'round' },
];

export interface AppSettings {
  palette: string[];
  language: LanguageSetting;
  theme: ThemeSetting;
  pens: PenSetting[];
  pressureCurve: CurvePoint[];
  zoomWheelReversed: boolean;
}

const STORAGE_KEY = 'sosyoku.settings.v1';

function defaults(): AppSettings {
  return {
    palette: [...DEFAULT_PALETTE],
    language: 'auto',
    theme: 'auto',
    pens: DEFAULT_PENS.map((p) => ({ ...p })),
    pressureCurve: DEFAULT_PRESSURE_CURVE.map((p) => ({ ...p })),
    zoomWheelReversed: false,
  };
}

let cache: AppSettings | null = null;

function load(): AppSettings {
  if (cache) return cache;
  let result: AppSettings | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      result = { ...defaults(), ...parsed };
    }
  } catch {
    // 破損データは無視してデフォルトへフォールバック
  }
  cache = result ?? defaults();
  return cache;
}

function persist() {
  if (!cache) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export function applyTheme(theme: ThemeSetting) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function nextPenId(): string {
  return `pen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const settingsStore = {
  get(): AppSettings {
    return load();
  },
  update(patch: Partial<AppSettings>) {
    const current = load();
    Object.assign(current, patch);
    persist();
    document.dispatchEvent(new CustomEvent('settings-changed', { detail: current }));
  },
  exportJSON(): string {
    return JSON.stringify(load(), null, 2);
  },
  importJSON(json: string) {
    const parsed = JSON.parse(json);
    cache = { ...defaults(), ...parsed };
    persist();
    document.dispatchEvent(new CustomEvent('settings-changed', { detail: cache }));
  },
};
