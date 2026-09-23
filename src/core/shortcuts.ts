/** Keyboard and gamepad shortcut definitions, persistence helpers, and input formatting. */
import type { TranslationKey } from '../i18n/index.ts';
import { createId } from './util.ts';

export interface KeyboardShortcutBinding {
  type: 'keyboard';
  key: string;
  /** Ctrl on Windows/Linux or Cmd on macOS. */
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export interface GamepadButtonBinding {
  type: 'gamepad-button';
  button: number;
}

export interface GamepadAxisBinding {
  type: 'gamepad-axis';
  axis: number;
  direction: -1 | 1;
}

export type ShortcutBinding = KeyboardShortcutBinding | GamepadButtonBinding | GamepadAxisBinding;

export type ShortcutActionId =
  | 'undo'
  | 'redo'
  | 'save'
  | 'deselect'
  | 'deleteSelection'
  | 'penPrevious'
  | 'penNext'
  | 'layerUp'
  | 'layerDown'
  | 'toolPen'
  | 'toolEraser'
  | 'toolFill'
  | 'toolSelect'
  | 'toolMove'
  | 'toolPrevious'
  | 'toolNext'
  | 'toggleGrid'
  | 'toggleTouchDrawing';

export interface ShortcutDefinition {
  id: ShortcutActionId;
  labelKey: TranslationKey;
  default?: KeyboardShortcutBinding;
}

export interface ShortcutAssignment {
  id: string;
  action: ShortcutActionId;
  binding: ShortcutBinding;
}

const keyboard = (key: string, mod = false, shift = false, alt = false): KeyboardShortcutBinding => ({
  type: 'keyboard',
  key,
  mod,
  shift,
  alt,
});

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'undo', labelKey: 'tool.undo', default: keyboard('z', true) },
  { id: 'redo', labelKey: 'tool.redo', default: keyboard('z', true, true) },
  { id: 'save', labelKey: 'tool.save', default: keyboard('s', true) },
  { id: 'deselect', labelKey: 'shortcut.deselect', default: keyboard('escape') },
  { id: 'deleteSelection', labelKey: 'shortcut.deleteSelection', default: keyboard('delete') },
  { id: 'penPrevious', labelKey: 'shortcut.penPrevious' },
  { id: 'penNext', labelKey: 'shortcut.penNext' },
  { id: 'layerUp', labelKey: 'shortcut.layerUp' },
  { id: 'layerDown', labelKey: 'shortcut.layerDown' },
  { id: 'toolPen', labelKey: 'shortcut.toolPen' },
  { id: 'toolEraser', labelKey: 'shortcut.toolEraser' },
  { id: 'toolFill', labelKey: 'shortcut.toolFill' },
  { id: 'toolSelect', labelKey: 'shortcut.toolSelect' },
  { id: 'toolMove', labelKey: 'shortcut.toolMove' },
  { id: 'toolPrevious', labelKey: 'shortcut.toolPrevious' },
  { id: 'toolNext', labelKey: 'shortcut.toolNext' },
  { id: 'toggleGrid', labelKey: 'shortcut.toggleGrid' },
  { id: 'toggleTouchDrawing', labelKey: 'shortcut.toggleTouchDrawing' },
];

const ACTION_IDS = new Set<ShortcutActionId>(SHORTCUT_DEFINITIONS.map((definition) => definition.id));

function nextAssignmentId(): string {
  return createId('shortcut');
}

export function createShortcutAssignment(action: ShortcutActionId, binding: ShortcutBinding): ShortcutAssignment {
  return { id: nextAssignmentId(), action, binding: { ...binding } };
}

export function defaultShortcuts(): ShortcutAssignment[] {
  return SHORTCUT_DEFINITIONS.flatMap((definition) =>
    definition.default
      ? [{ id: `default-${definition.id}`, action: definition.id, binding: { ...definition.default } }]
      : []
  );
}

function normalizeKey(key: string): string {
  if (key === 'Backspace') return 'delete';
  return key.toLowerCase();
}

export function bindingFromEvent(e: KeyboardEvent): KeyboardShortcutBinding | null {
  if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return null;
  return keyboard(normalizeKey(e.key), e.ctrlKey || e.metaKey, e.shiftKey, e.altKey);
}

function normalizeBinding(value: unknown): ShortcutBinding | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.type === 'keyboard' || (!record.type && typeof record.key === 'string')) {
    if (typeof record.key !== 'string') return null;
    return keyboard(normalizeKey(record.key), Boolean(record.mod), Boolean(record.shift), Boolean(record.alt));
  }
  if (record.type === 'gamepad-button' && Number.isInteger(record.button) && Number(record.button) >= 0) {
    return { type: 'gamepad-button', button: Number(record.button) };
  }
  if (
    record.type === 'gamepad-axis' && Number.isInteger(record.axis) && Number(record.axis) >= 0 &&
    (record.direction === -1 || record.direction === 1)
  ) {
    return { type: 'gamepad-axis', axis: Number(record.axis), direction: record.direction };
  }
  return null;
}

/** Converts legacy action-keyed settings and validates current assignment arrays. */
export function normalizeShortcuts(value: unknown): ShortcutAssignment[] {
  if (Array.isArray(value)) {
    const result: ShortcutAssignment[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      if (typeof record.action !== 'string' || !ACTION_IDS.has(record.action as ShortcutActionId)) continue;
      const binding = normalizeBinding(record.binding);
      if (!binding) continue;
      result.push({
        id: typeof record.id === 'string' && record.id ? record.id : nextAssignmentId(),
        action: record.action as ShortcutActionId,
        binding,
      });
    }
    return result;
  }

  if (value && typeof value === 'object') {
    const legacy = value as Record<string, unknown>;
    return SHORTCUT_DEFINITIONS.flatMap((definition) => {
      const binding = normalizeBinding(legacy[definition.id] ?? definition.default);
      return binding ? [{ id: `default-${definition.id}`, action: definition.id, binding }] : [];
    });
  }
  return defaultShortcuts();
}

export function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'keyboard' && b.type === 'keyboard') {
    return a.key === b.key && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt;
  }
  if (a.type === 'gamepad-button' && b.type === 'gamepad-button') return a.button === b.button;
  return a.type === 'gamepad-axis' && b.type === 'gamepad-axis' &&
    a.axis === b.axis && a.direction === b.direction;
}

export function matchesBinding(e: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (binding.type !== 'keyboard') return false;
  const mod = e.ctrlKey || e.metaKey;
  if (mod !== binding.mod || e.shiftKey !== binding.shift || e.altKey !== binding.alt) return false;
  return normalizeKey(e.key) === binding.key;
}

export function findKeyboardShortcutAction(
  e: KeyboardEvent,
  shortcuts: ShortcutAssignment[],
): ShortcutActionId | null {
  return shortcuts.find((assignment) => matchesBinding(e, assignment.binding))?.action ?? null;
}

function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

const KEY_DISPLAY_NAMES: Record<string, string> = {
  ' ': 'Space',
  'arrowup': 'Up',
  'arrowdown': 'Down',
  'arrowleft': 'Left',
  'arrowright': 'Right',
  'escape': 'Esc',
  'delete': 'Delete',
  'enter': 'Enter',
  'tab': 'Tab',
};

const GAMEPAD_BUTTON_NAMES: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'Back',
  9: 'Start',
  10: 'L3',
  11: 'R3',
  12: 'D-pad Up',
  13: 'D-pad Down',
  14: 'D-pad Left',
  15: 'D-pad Right',
  16: 'Home',
};

function formatKey(key: string): string {
  const named = KEY_DISPLAY_NAMES[key];
  if (named) return named;
  return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

export function formatBinding(binding: ShortcutBinding): string {
  if (binding.type === 'gamepad-button') {
    return `Gamepad ${GAMEPAD_BUTTON_NAMES[binding.button] ?? `Button ${binding.button + 1}`}`;
  }
  if (binding.type === 'gamepad-axis') {
    return `Gamepad Axis ${binding.axis + 1}${binding.direction > 0 ? '+' : '-'}`;
  }
  const parts: string[] = [];
  if (binding.mod) parts.push(isMac() ? 'Cmd' : 'Ctrl');
  if (binding.shift) parts.push('Shift');
  if (binding.alt) parts.push(isMac() ? 'Option' : 'Alt');
  parts.push(formatKey(binding.key));
  return parts.join('+');
}

export function gamepadBindingToken(binding: GamepadButtonBinding | GamepadAxisBinding): string {
  return binding.type === 'gamepad-button' ? `button:${binding.button}` : `axis:${binding.axis}:${binding.direction}`;
}

export function readActiveGamepadBindings(): (GamepadButtonBinding | GamepadAxisBinding)[] {
  const getGamepads = navigator.getGamepads?.bind(navigator);
  if (!getGamepads) return [];
  const bindings = new Map<string, GamepadButtonBinding | GamepadAxisBinding>();
  for (const gamepad of getGamepads()) {
    if (!gamepad) continue;
    gamepad.buttons.forEach((button, index) => {
      if (button.pressed || button.value >= 0.6) {
        const binding: GamepadButtonBinding = { type: 'gamepad-button', button: index };
        bindings.set(gamepadBindingToken(binding), binding);
      }
    });
    gamepad.axes.forEach((value, index) => {
      if (Math.abs(value) < 0.65) return;
      const binding: GamepadAxisBinding = { type: 'gamepad-axis', axis: index, direction: value < 0 ? -1 : 1 };
      bindings.set(gamepadBindingToken(binding), binding);
    });
  }
  return [...bindings.values()];
}

export function startGamepadCapture(
  onCapture: (binding: GamepadButtonBinding | GamepadAxisBinding) => void,
): () => void {
  let stopped = false;
  let frame = 0;
  let previous = new Set(readActiveGamepadBindings().map(gamepadBindingToken));
  const poll = () => {
    if (stopped) return;
    const active = readActiveGamepadBindings();
    const next = new Set(active.map(gamepadBindingToken));
    const pressed = active.find((binding) => !previous.has(gamepadBindingToken(binding)));
    previous = next;
    if (pressed) {
      stopped = true;
      onCapture(pressed);
      return;
    }
    frame = requestAnimationFrame(poll);
  };
  frame = requestAnimationFrame(poll);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}
