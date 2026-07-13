/**
 * アプリのキーボードショートカットの定義・キー入力とのマッチング・表示用フォーマット。
 * 実際のカスタムバインディングの保存先は settings-store.ts の AppSettings.shortcuts。
 */
import type { TranslationKey } from '../i18n/index.ts';

export interface ShortcutBinding {
  /** KeyboardEvent.key を正規化したもの(英字は小文字、'Backspace'は'Delete'として扱う) */
  key: string;
  /** Ctrl(Win/Linux) または Cmd(Mac) */
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export type ShortcutActionId = 'undo' | 'redo' | 'save' | 'deselect' | 'deleteSelection';

export interface ShortcutDefinition {
  id: ShortcutActionId;
  labelKey: TranslationKey;
  default: ShortcutBinding;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'undo', labelKey: 'tool.undo', default: { key: 'z', mod: true, shift: false, alt: false } },
  { id: 'redo', labelKey: 'tool.redo', default: { key: 'z', mod: true, shift: true, alt: false } },
  { id: 'save', labelKey: 'tool.save', default: { key: 's', mod: true, shift: false, alt: false } },
  { id: 'deselect', labelKey: 'shortcut.deselect', default: { key: 'escape', mod: false, shift: false, alt: false } },
  {
    id: 'deleteSelection',
    labelKey: 'shortcut.deleteSelection',
    default: { key: 'delete', mod: false, shift: false, alt: false },
  },
];

export type ShortcutSettings = Partial<Record<ShortcutActionId, ShortcutBinding>>;

export function defaultShortcuts(): Record<ShortcutActionId, ShortcutBinding> {
  const result = {} as Record<ShortcutActionId, ShortcutBinding>;
  for (const def of SHORTCUT_DEFINITIONS) result[def.id] = { ...def.default };
  return result;
}

function normalizeKey(key: string): string {
  if (key === 'Backspace') return 'delete';
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}

/** キー入力(KeyboardEvent)から、単体のmodifierキーだけの場合はnullを返しバインディング化する */
export function bindingFromEvent(e: KeyboardEvent): ShortcutBinding | null {
  if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return null;
  return {
    key: normalizeKey(e.key),
    mod: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };
}

export function resolveBinding(shortcuts: ShortcutSettings, actionId: ShortcutActionId): ShortcutBinding {
  const stored = shortcuts[actionId];
  if (stored) return stored;
  return SHORTCUT_DEFINITIONS.find((d) => d.id === actionId)!.default;
}

export function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return a.key === b.key && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt;
}

export function matchesBinding(e: KeyboardEvent, binding: ShortcutBinding): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (mod !== binding.mod || e.shiftKey !== binding.shift || e.altKey !== binding.alt) return false;
  return normalizeKey(e.key) === binding.key;
}

export function matchesShortcut(e: KeyboardEvent, shortcuts: ShortcutSettings, actionId: ShortcutActionId): boolean {
  return matchesBinding(e, resolveBinding(shortcuts, actionId));
}

function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

const KEY_DISPLAY_NAMES: Record<string, string> = {
  ' ': 'Space',
  'arrowup': '↑',
  'arrowdown': '↓',
  'arrowleft': '←',
  'arrowright': '→',
  'escape': 'Esc',
  'delete': 'Delete',
  'enter': 'Enter',
  'tab': 'Tab',
};

function formatKey(key: string): string {
  const named = KEY_DISPLAY_NAMES[key];
  if (named) return named;
  return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

export function formatBinding(binding: ShortcutBinding): string {
  const parts: string[] = [];
  if (binding.mod) parts.push(isMac() ? '⌘' : 'Ctrl');
  if (binding.shift) parts.push('Shift');
  if (binding.alt) parts.push(isMac() ? '⌥' : 'Alt');
  parts.push(formatKey(binding.key));
  return parts.join('+');
}
