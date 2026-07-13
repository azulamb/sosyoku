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
  defaultShortcuts,
  formatBinding,
  SHORTCUT_DEFINITIONS,
  type ShortcutActionId,
  type ShortcutBinding,
} from './shortcuts.ts';

export interface EditableCategory {
  id: string;
  label: string;
  content: HTMLElement;
  apply: () => void;
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
  initial: Record<ShortcutActionId, ShortcutBinding>,
): { content: HTMLElement; getShortcuts: () => Record<ShortcutActionId, ShortcutBinding> } {
  const content = document.createElement('div');
  let current: Record<ShortcutActionId, ShortcutBinding> = { ...initial };

  const conflictMsg = document.createElement('div');
  conflictMsg.style.cssText = 'color:var(--danger); font-size:12px; min-height:16px; margin-top:8px;';

  let stopRecording: (() => void) | null = null;

  const rows: { id: ShortcutActionId; keyEl: HTMLSpanElement }[] = [];
  const refreshRow = (id: ShortcutActionId) => {
    const row = rows.find((r) => r.id === id);
    if (row) row.keyEl.textContent = formatBinding(current[id]);
  };

  for (const def of SHORTCUT_DEFINITIONS) {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border);';

    const label = document.createElement('span');
    label.textContent = t(def.labelKey);
    label.style.cssText = 'flex:1; font-size:13px;';

    const keyEl = document.createElement('span');
    keyEl.style.cssText =
      'font-family:monospace; font-size:12px; padding:4px 8px; border:1px solid var(--border); border-radius:4px; background:var(--bg); min-width:90px; text-align:center; flex:none;';
    keyEl.textContent = formatBinding(current[def.id]);
    rows.push({ id: def.id, keyEl });

    const changeBtn = actionButton(t('shortcut.change'));
    changeBtn.style.flex = 'none';
    const resetBtn = actionButton(t('shortcut.reset'));
    resetBtn.style.flex = 'none';

    changeBtn.addEventListener('click', () => {
      stopRecording?.();
      conflictMsg.textContent = '';
      keyEl.textContent = t('shortcut.recording');

      const handler = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
          stopRecording?.();
          return;
        }
        const binding = bindingFromEvent(e);
        if (!binding) return;

        const conflictDef = SHORTCUT_DEFINITIONS.find(
          (d) => d.id !== def.id && bindingsEqual(current[d.id], binding),
        );
        if (conflictDef) {
          conflictMsg.textContent = t('shortcut.conflict', { action: t(conflictDef.labelKey) });
          stopRecording?.();
          return;
        }

        current[def.id] = binding;
        conflictMsg.textContent = '';
        stopRecording?.();
      };

      globalThis.addEventListener('keydown', handler, true);
      stopRecording = () => {
        globalThis.removeEventListener('keydown', handler, true);
        stopRecording = null;
        refreshRow(def.id);
      };
    });

    resetBtn.addEventListener('click', () => {
      current[def.id] = { ...def.default };
      conflictMsg.textContent = '';
      refreshRow(def.id);
    });

    row.appendChild(label);
    row.appendChild(keyEl);
    row.appendChild(changeBtn);
    row.appendChild(resetBtn);
    content.appendChild(row);
  }

  const resetAllBtn = actionButton(t('shortcut.resetAll'));
  resetAllBtn.style.marginTop = '10px';
  resetAllBtn.addEventListener('click', () => {
    stopRecording?.();
    current = defaultShortcuts();
    conflictMsg.textContent = '';
    for (const row of rows) refreshRow(row.id);
  });
  content.appendChild(resetAllBtn);
  content.appendChild(conflictMsg);

  return { content, getShortcuts: () => current };
}
