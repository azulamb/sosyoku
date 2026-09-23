import { bindingsEqual, defaultShortcuts, normalizeShortcuts } from './shortcuts.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('default shortcuts retain the existing five keyboard bindings', () => {
  const shortcuts = defaultShortcuts();
  assert(shortcuts.length === 5, 'expected five default assignments');
  assert(shortcuts.every((assignment) => assignment.binding.type === 'keyboard'), 'defaults must use keyboard input');
});

Deno.test('legacy action-keyed shortcut settings migrate to assignments', () => {
  const shortcuts = normalizeShortcuts({
    undo: { key: 'u', mod: true, shift: false, alt: false },
  });
  const undo = shortcuts.find((assignment) => assignment.action === 'undo');
  assert(undo?.binding.type === 'keyboard', 'undo should migrate as a keyboard binding');
  assert(undo.binding.key === 'u', 'custom legacy key should be retained');
});

Deno.test('gamepad bindings survive normalization and compare by control', () => {
  const shortcuts = normalizeShortcuts([
    { id: 'pad-a', action: 'toolNext', binding: { type: 'gamepad-button', button: 0 } },
    { id: 'stick-left', action: 'layerUp', binding: { type: 'gamepad-axis', axis: 0, direction: -1 } },
  ]);
  assert(shortcuts.length === 2, 'expected both gamepad assignments');
  assert(
    bindingsEqual(shortcuts[0].binding, { type: 'gamepad-button', button: 0 }),
    'gamepad button should compare equal',
  );
  assert(
    bindingsEqual(shortcuts[1].binding, { type: 'gamepad-axis', axis: 0, direction: -1 }),
    'gamepad axis should compare equal',
  );
});
