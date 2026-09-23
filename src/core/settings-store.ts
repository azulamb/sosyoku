import { type CurvePoint, DEFAULT_PRESSURE_CURVE } from './pressure-curve.ts';
import { defaultShortcuts, normalizeShortcuts, type ShortcutAssignment } from './shortcuts.ts';
import type { BrushShape } from './layer.ts';
import { createId } from './util.ts';

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
export type PenShape = BrushShape;

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
  touchDrawingDisabled: boolean;
  shortcuts: ShortcutAssignment[];
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
    touchDrawingDisabled: false,
    shortcuts: defaultShortcuts(),
  };
}

let cache: AppSettings | null = null;

/** JSON文字列を既定値で補完した設定に変換する(不正なJSONは例外を投げる) */
function parseSettings(json: string): AppSettings {
  const parsed = JSON.parse(json);
  return { ...defaults(), ...parsed, shortcuts: normalizeShortcuts(parsed.shortcuts) };
}

function load(): AppSettings {
  if (cache) return cache;
  let result: AppSettings | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) result = parseSettings(raw);
  } catch {
    // 破損データは無視してデフォルトへフォールバック
  }
  cache = result ?? defaults();
  return cache;
}

/** 保存して 'settings-changed' を通知する */
function persistAndNotify(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  document.dispatchEvent(new CustomEvent('settings-changed', { detail: settings }));
}

export function applyTheme(theme: ThemeSetting) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function nextPenId(): string {
  return createId('pen');
}

export const settingsStore = {
  get(): AppSettings {
    return load();
  },
  update(patch: Partial<AppSettings>) {
    persistAndNotify(Object.assign(load(), patch));
  },
  exportJSON(): string {
    return JSON.stringify(load(), null, 2);
  },
  importJSON(json: string) {
    cache = parseSettings(json);
    persistAndNotify(cache);
  },
};
