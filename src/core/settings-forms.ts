/** settings-modal に渡す「ドキュメントの設定」「設定」の各カテゴリのフォームを組み立てる */
import { type GridSetting, MAX_CANVAS_SIZE, nextGridId, type SosyokuDocument } from './document.ts';
import { applyTheme, settingsStore } from './settings-store.ts';
import { downloadBlob, pickFiles } from './file-io.ts';
import { t } from '../i18n/index.ts';
import type { PressureCurveEditorElement } from '../components/pressure-curve-editor.ts';
import { hexToRgba, rgbaToHex8, rgbToHex } from './color.ts';
import {
  bindingFromEvent,
  bindingsEqual,
  createShortcutAssignment,
  defaultShortcuts,
  formatBinding,
  SHORTCUT_DEFINITIONS,
  type ShortcutActionId,
  type ShortcutAssignment,
  type ShortcutBinding,
  startGamepadCapture,
} from './shortcuts.ts';

export interface EditableCategory {
  id: string;
  label: string;
  content: HTMLElement;
  apply: () => void;
  dispose?: () => void;
}

function fieldStyle(el: HTMLElement) {
  el.style.cssText =
    'padding:6px 8px; border:1px solid var(--border); border-radius:4px; background:var(--bg); color:inherit; font-size:13px;';
}

function labeledField(label: string, input: HTMLElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex; flex-direction:column; gap:4px; margin-bottom:12px; font-size:12px;';
  const span = document.createElement('span');
  span.textContent = label;
  span.style.color = 'var(--text-muted)';
  wrap.appendChild(span);
  wrap.appendChild(input);
  return wrap;
}

function actionButton(label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.style.cssText =
    'padding:6px 10px; border:1px solid var(--border); background:transparent; color:inherit; border-radius:4px; cursor:pointer; font-size:12px;';
  return btn;
}

export function buildDocumentSettingsCategories(doc: SosyokuDocument): EditableCategory[] {
  const docContent = document.createElement('div');
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = doc.title;
  fieldStyle(titleInput);

  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.min = '1';
  widthInput.max = String(MAX_CANVAS_SIZE);
  widthInput.value = String(doc.width);
  fieldStyle(widthInput);

  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.min = '1';
  heightInput.max = String(MAX_CANVAS_SIZE);
  heightInput.value = String(doc.height);
  fieldStyle(heightInput);

  docContent.appendChild(labeledField(t('docsettings.title.label'), titleInput));
  docContent.appendChild(labeledField(t('docsettings.width.label', { max: MAX_CANVAS_SIZE }), widthInput));
  docContent.appendChild(labeledField(t('docsettings.height.label', { max: MAX_CANVAS_SIZE }), heightInput));

  const bgRow = document.createElement('div');
  bgRow.style.cssText = 'display:flex; align-items:center; gap:10px;';
  const bgColorInput = document.createElement('input');
  bgColorInput.type = 'color';
  bgColorInput.style.cssText =
    'width:48px; height:30px; padding:0; border:1px solid var(--border); border-radius:4px; background:none; flex:none;';
  const bgAlphaInput = document.createElement('input');
  bgAlphaInput.type = 'range';
  bgAlphaInput.min = '0';
  bgAlphaInput.max = '100';
  bgAlphaInput.title = t('docsettings.backgroundColor.alpha');
  bgAlphaInput.style.cssText = 'flex:1; accent-color: var(--accent);';

  const initialBg = hexToRgba(doc.backgroundColor);
  bgColorInput.value = rgbToHex(initialBg.r, initialBg.g, initialBg.b);
  bgAlphaInput.value = String(Math.round(initialBg.a * 100));

  bgRow.appendChild(bgColorInput);
  bgRow.appendChild(bgAlphaInput);
  docContent.appendChild(labeledField(t('docsettings.backgroundColor.label'), bgRow));

  const gridContent = document.createElement('div');
  const gridList = document.createElement('div');
  gridList.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin-bottom:12px;';

  const rows: { id: string; xInput: HTMLInputElement; yInput: HTMLInputElement; colorInput: HTMLInputElement }[] = [];

  const addRow = (grid: GridSetting) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:6px;';

    const xInput = document.createElement('input');
    xInput.type = 'number';
    xInput.min = '1';
    xInput.value = String(grid.x);
    fieldStyle(xInput);
    xInput.style.width = '64px';
    xInput.style.flex = 'none';

    const yInput = document.createElement('input');
    yInput.type = 'number';
    yInput.min = '1';
    yInput.value = String(grid.y);
    fieldStyle(yInput);
    yInput.style.width = '64px';
    yInput.style.flex = 'none';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = grid.color;
    colorInput.style.cssText =
      'width:36px; height:30px; padding:0; border:1px solid var(--border); border-radius:4px; background:none; flex:none;';

    const removeBtn = actionButton(t('docsettings.grid.remove'));
    removeBtn.style.flex = 'none';
    removeBtn.addEventListener('click', () => {
      row.remove();
      const idx = rows.findIndex((r) => r.xInput === xInput);
      if (idx !== -1) rows.splice(idx, 1);
    });

    row.appendChild(xInput);
    row.appendChild(document.createTextNode('×'));
    row.appendChild(yInput);
    row.appendChild(colorInput);
    row.appendChild(removeBtn);
    gridList.appendChild(row);
    rows.push({ id: grid.id, xInput, yInput, colorInput });
  };

  for (const grid of doc.grids) addRow(grid);

  const addGridBtn = actionButton(t('docsettings.grid.add'));
  addGridBtn.addEventListener('click', () => addRow({ id: nextGridId(), x: 50, y: 50, color: '#7f8c99' }));

  gridContent.appendChild(gridList);
  gridContent.appendChild(addGridBtn);

  return [
    {
      id: 'document',
      label: t('docsettings.category.document'),
      content: docContent,
      apply: () => {
        doc.title = titleInput.value.trim() || doc.title;
        const w = Number(widthInput.value);
        const h = Number(heightInput.value);
        if (w > 0 && h > 0 && (w !== doc.width || h !== doc.height)) doc.resize(w, h);
        const { r, g, b } = hexToRgba(bgColorInput.value);
        doc.backgroundColor = rgbaToHex8(r, g, b, Number(bgAlphaInput.value) / 100);
        doc.markDirty();
      },
    },
    {
      id: 'grid',
      label: t('docsettings.category.grid'),
      content: gridContent,
      apply: () => {
        doc.grids = rows.map((r) => ({
          id: r.id,
          x: Number(r.xInput.value) || 1,
          y: Number(r.yInput.value) || 1,
          color: r.colorInput.value,
        }));
        doc.markDirty();
      },
    },
  ];
}

export function buildAppSettingsCategories(): EditableCategory[] {
  const settings = settingsStore.get();

  const generalContent = document.createElement('div');
  const langSelect = document.createElement('select');
  fieldStyle(langSelect);
  for (
    const [value, key] of [['auto', 'appsettings.language.auto'], ['ja', 'appsettings.language.ja'], [
      'en',
      'appsettings.language.en',
    ]] as const
  ) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = t(key);
    langSelect.appendChild(opt);
  }
  langSelect.value = settings.language;

  const themeSelect = document.createElement('select');
  fieldStyle(themeSelect);
  for (
    const [value, key] of [['auto', 'appsettings.theme.auto'], ['light', 'appsettings.theme.light'], [
      'dark',
      'appsettings.theme.dark',
    ]] as const
  ) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = t(key);
    themeSelect.appendChild(opt);
  }
  themeSelect.value = settings.theme;

  generalContent.appendChild(labeledField(t('appsettings.language.label'), langSelect));
  generalContent.appendChild(labeledField(t('appsettings.theme.label'), themeSelect));

  const zoomReverseRow = document.createElement('label');
  zoomReverseRow.style.cssText =
    'display:flex; align-items:center; gap:8px; margin-bottom:12px; font-size:12px; cursor:pointer;';
  const zoomReverseCheckbox = document.createElement('input');
  zoomReverseCheckbox.type = 'checkbox';
  zoomReverseCheckbox.checked = settings.zoomWheelReversed;
  const zoomReverseText = document.createElement('span');
  zoomReverseText.textContent = t('appsettings.zoomWheelReversed.label');
  zoomReverseRow.appendChild(zoomReverseCheckbox);
  zoomReverseRow.appendChild(zoomReverseText);
  generalContent.appendChild(zoomReverseRow);

  const paletteContent = document.createElement('div');
  const grid = document.createElement('div');
  grid.style.cssText =
    'display:grid; grid-template-columns:repeat(auto-fill,minmax(32px,1fr)); gap:10px; margin-bottom:14px;';

  let palette = [...settings.palette];

  const renderGrid = () => {
    grid.innerHTML = '';
    palette.forEach((color, index) => {
      const cell = document.createElement('div');
      cell.style.cssText = 'position:relative;';
      const swatch = document.createElement('div');
      swatch.style.cssText =
        `width:32px; height:32px; border-radius:4px; border:1px solid var(--border); background:${color};`;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.style.cssText =
        'position:absolute; top:-6px; right:-6px; width:16px; height:16px; border-radius:50%; border:none; background:var(--danger); color:#fff; font-size:10px; line-height:1; cursor:pointer; padding:0;';
      removeBtn.addEventListener('click', () => {
        palette.splice(index, 1);
        renderGrid();
      });
      cell.appendChild(swatch);
      cell.appendChild(removeBtn);
      grid.appendChild(cell);
    });
  };
  renderGrid();

  const addRow = document.createElement('div');
  addRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:14px;';
  const addColorInput = document.createElement('input');
  addColorInput.type = 'color';
  addColorInput.value = '#7f8c99';
  addColorInput.style.cssText =
    'width:36px; height:30px; padding:0; border:1px solid var(--border); border-radius:4px; background:none;';
  const addBtn = actionButton(t('appsettings.palette.add'));
  addBtn.addEventListener('click', () => {
    palette.push(addColorInput.value);
    renderGrid();
  });
  addRow.appendChild(addColorInput);
  addRow.appendChild(addBtn);

  const ioRow = document.createElement('div');
  ioRow.style.cssText = 'display:flex; gap:8px;';
  const exportBtn = actionButton(t('appsettings.export'));
  exportBtn.addEventListener('click', () => {
    downloadBlob(new Blob([settingsStore.exportJSON()], { type: 'application/json' }), 'sosyoku-settings.json');
  });
  const importBtn = actionButton(t('appsettings.import'));
  importBtn.addEventListener('click', async () => {
    const [file] = await pickFiles('application/json');
    if (!file) return;
    settingsStore.importJSON(await file.text());
    palette = [...settingsStore.get().palette];
    renderGrid();
  });
  ioRow.appendChild(exportBtn);
  ioRow.appendChild(importBtn);

  paletteContent.appendChild(grid);
  paletteContent.appendChild(addRow);
  paletteContent.appendChild(ioRow);

  const pressureContent = document.createElement('div');
  const curveEditor = document.createElement('pressure-curve-editor') as unknown as PressureCurveEditorElement;
  curveEditor.setPoints(settings.pressureCurve);
  pressureContent.appendChild(curveEditor);

  const shortcuts = buildShortcutsContent(settings.shortcuts);

  return [
    {
      id: 'general',
      label: t('appsettings.category.general'),
      content: generalContent,
      apply: () => {
        settingsStore.update({
          language: langSelect.value as 'auto' | 'ja' | 'en',
          theme: themeSelect.value as 'auto' | 'light' | 'dark',
          zoomWheelReversed: zoomReverseCheckbox.checked,
        });
        applyTheme(settingsStore.get().theme);
      },
    },
    {
      id: 'palette',
      label: t('appsettings.category.palette'),
      content: paletteContent,
      apply: () => {
        settingsStore.update({ palette: [...palette] });
      },
    },
    {
      id: 'pressure',
      label: t('appsettings.category.pressure'),
      content: pressureContent,
      apply: () => {
        settingsStore.update({ pressureCurve: curveEditor.getPoints() });
      },
    },
    {
      id: 'shortcuts',
      label: t('appsettings.category.shortcuts'),
      content: shortcuts.content,
      apply: () => {
        settingsStore.update({ shortcuts: shortcuts.getShortcuts() });
      },
      dispose: shortcuts.dispose,
    },
  ];
}

/**
 * ショートカット一覧の表示・変更・リセットを行うUIを組み立てる。
 * 変更ボタンを押すと次のキー入力を捕捉してバインディングに変換する(Escapeでキャンセル、
 * 他のアクションと重複する場合は反映せず警告を出す)。捕捉中は他のグローバルショートカット
 * (元に戻す/やり直す/選択解除等)が誤発火しないよう、capture段階でイベントを止める。
 */
function buildShortcutsContent(
  initial: ShortcutAssignment[],
): { content: HTMLElement; getShortcuts: () => ShortcutAssignment[]; dispose: () => void } {
  type EditableAssignment = Omit<ShortcutAssignment, 'binding'> & { binding: ShortcutBinding | null };

  const content = document.createElement('div');
  const list = document.createElement('div');
  let current: EditableAssignment[] = initial.map((assignment) => ({
    ...assignment,
    binding: { ...assignment.binding },
  }));

  const conflictMsg = document.createElement('div');
  conflictMsg.style.cssText = 'color:var(--danger); font-size:12px; min-height:16px; margin-top:8px;';

  let stopRecording: (() => void) | null = null;
  const stopCapture = () => {
    const stop = stopRecording;
    stopRecording = null;
    stop?.();
  };

  const definitionFor = (action: ShortcutActionId) => SHORTCUT_DEFINITIONS.find((item) => item.id === action)!;

  const assignBinding = (id: string, binding: ShortcutBinding) => {
    const conflict = current.find((item) => item.id !== id && item.binding && bindingsEqual(item.binding, binding));
    if (conflict) {
      conflictMsg.textContent = t('shortcut.conflict', { action: t(definitionFor(conflict.action).labelKey) });
      stopCapture();
      render();
      return;
    }
    const assignment = current.find((item) => item.id === id);
    if (assignment) assignment.binding = binding;
    conflictMsg.textContent = '';
    stopCapture();
    render();
  };

  const startRecording = (id: string, bindingEl: HTMLSpanElement) => {
    stopCapture();
    conflictMsg.textContent = '';
    bindingEl.textContent = t('shortcut.recording');

    const keyboardHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        stopCapture();
        render();
        return;
      }
      const binding = bindingFromEvent(e);
      if (binding) assignBinding(id, binding);
    };
    globalThis.addEventListener('keydown', keyboardHandler, true);
    const stopGamepad = startGamepadCapture((binding) => assignBinding(id, binding));
    stopRecording = () => {
      globalThis.removeEventListener('keydown', keyboardHandler, true);
      stopGamepad();
    };
  };

  const render = () => {
    list.innerHTML = '';
    for (const assignment of current) {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:9px 0; border-bottom:1px solid var(--border);';

      const actionSelect = document.createElement('select');
      fieldStyle(actionSelect);
      actionSelect.style.cssText += 'flex:1 1 180px; min-width:150px;';
      for (const definition of SHORTCUT_DEFINITIONS) {
        const option = document.createElement('option');
        option.value = definition.id;
        option.textContent = t(definition.labelKey);
        actionSelect.appendChild(option);
      }
      actionSelect.value = assignment.action;
      actionSelect.addEventListener('change', () => {
        assignment.action = actionSelect.value as ShortcutActionId;
        render();
      });

      const bindingEl = document.createElement('span');
      bindingEl.style.cssText =
        'font-family:monospace; font-size:12px; padding:5px 8px; border:1px solid var(--border); border-radius:4px; background:var(--bg); min-width:130px; text-align:center; flex:1 1 130px;';
      bindingEl.textContent = assignment.binding ? formatBinding(assignment.binding) : t('shortcut.unassigned');

      const changeBtn = actionButton(t('shortcut.change'));
      changeBtn.addEventListener('click', () => startRecording(assignment.id, bindingEl));

      const resetBtn = actionButton(t('shortcut.reset'));
      const defaultBinding = definitionFor(assignment.action).default;
      resetBtn.disabled = !defaultBinding;
      resetBtn.style.opacity = defaultBinding ? '1' : '0.45';
      resetBtn.addEventListener('click', () => {
        const next = definitionFor(assignment.action).default;
        if (next) assignBinding(assignment.id, { ...next });
      });

      const deleteBtn = actionButton(t('shortcut.remove'));
      deleteBtn.addEventListener('click', () => {
        stopCapture();
        current = current.filter((item) => item.id !== assignment.id);
        conflictMsg.textContent = '';
        render();
      });

      row.appendChild(actionSelect);
      row.appendChild(bindingEl);
      row.appendChild(changeBtn);
      row.appendChild(resetBtn);
      row.appendChild(deleteBtn);
      list.appendChild(row);
    }
  };

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex; gap:8px; margin-top:10px;';
  const addBtn = actionButton(t('shortcut.add'));
  addBtn.addEventListener('click', () => {
    stopCapture();
    const assignment = createShortcutAssignment('undo', {
      type: 'keyboard',
      key: '',
      mod: false,
      shift: false,
      alt: false,
    });
    current.push({ ...assignment, binding: null });
    conflictMsg.textContent = '';
    render();
  });

  const resetAllBtn = actionButton(t('shortcut.resetAll'));
  resetAllBtn.addEventListener('click', () => {
    stopCapture();
    current = defaultShortcuts();
    conflictMsg.textContent = '';
    render();
  });
  controls.appendChild(addBtn);
  controls.appendChild(resetAllBtn);

  render();
  content.appendChild(list);
  content.appendChild(controls);
  content.appendChild(conflictMsg);

  return {
    content,
    dispose: stopCapture,
    getShortcuts: () => {
      stopCapture();
      return current.flatMap((assignment) =>
        assignment.binding ? [{ ...assignment, binding: { ...assignment.binding } }] : []
      );
    },
  };
}
