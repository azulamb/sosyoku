import { ja } from './ja.ts';
import { en } from './en.ts';
import type { TranslationKey } from './ja.ts';
import { settingsStore } from '../core/settings-store.ts';

export type Locale = 'ja' | 'en';

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { ja, en };

function detectBrowserLocale(): Locale {
  const lang = (navigator.language || 'ja').toLowerCase();
  return lang.startsWith('ja') ? 'ja' : 'en';
}

function resolveLocale(): Locale {
  const setting = settingsStore.get().language;
  if (setting === 'auto') return detectBrowserLocale();
  return setting;
}

let currentLocale: Locale = resolveLocale();

document.addEventListener('settings-changed', () => {
  const next = resolveLocale();
  if (next !== currentLocale) {
    currentLocale = next;
    document.dispatchEvent(new CustomEvent('locale-changed', { detail: { locale: currentLocale } }));
  }
});

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale];
  let text = dict[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
}

export type { TranslationKey };
