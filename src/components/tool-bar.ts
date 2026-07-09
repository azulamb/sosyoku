/*
<tool-bar>
上部バーのツールエリア。戻る/進む/保存/グリッド表示切替/ペン/塗りつぶし/消しゴム/選択/移動を提供する。
*/
import './tool-button.ts';
import { t } from '../i18n/index.ts';
import type { TranslationKey } from '../i18n/index.ts';
import { createIcon } from '../core/icon.ts';
import type { ToolButtonElement } from './tool-button.ts';

export type ToolBarTool = 'pen' | 'eraser' | 'fill' | 'select' | 'move';

export interface ToolBarElement extends HTMLElement {
  setActiveTool(tool: ToolBarTool): void;
  setUndoRedoEnabled(canUndo: boolean, canRedo: boolean): void;
  setGridActive(active: boolean): void;
}

((script, init) => {
  const tagname = script.dataset['toolBar'] || 'tool-bar';
  if (customElements.get(tagname)) {
    return;
  }
  if (document.readyState !== 'loading') {
    return init(script, tagname);
  }
  document.addEventListener('DOMContentLoaded', () => {
    init(script, tagname);
  });
})(document.currentScript as HTMLScriptElement, (_script: HTMLScriptElement, tagname: string) => {
  customElements.define(
    tagname,
    class extends HTMLElement implements ToolBarElement {
      private toolButtons = new Map<ToolBarTool, ToolButtonElement>();
      private undoBtn: ToolButtonElement;
      private redoBtn: ToolButtonElement;
      private gridBtn: ToolButtonElement;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display:flex; align-items:center; gap:2px; }
          .sep { width:1px; height:22px; background:var(--border); margin:0 6px; flex:none; }
        `;
        shadow.appendChild(style);

        const labeledButtons: { key: TranslationKey; btn: ToolButtonElement }[] = [];
        const makeButton = (labelKey: TranslationKey, icon: string): ToolButtonElement => {
          const btn = document.createElement('tool-button') as ToolButtonElement;
          btn.setAttribute('label', t(labelKey));
          btn.appendChild(createIcon(icon));
          labeledButtons.push({ key: labelKey, btn });
          return btn;
        };

        this.undoBtn = makeButton('tool.undo', 'undo');
        this.redoBtn = makeButton('tool.redo', 'redo');
        const saveBtn = makeButton('tool.save', 'save');
        this.gridBtn = makeButton('tool.grid', 'grid_on');

        const penBtn = makeButton('tool.pen', 'draw');
        const fillBtn = makeButton('tool.fill', 'format_color_fill');
        const eraserBtn = makeButton('tool.eraser', 'ink_eraser');
        const selectBtn = makeButton('tool.select', 'crop_free');
        const moveBtn = makeButton('tool.move', 'open_with');

        document.addEventListener('locale-changed', () => {
          for (const { key, btn } of labeledButtons) btn.setAttribute('label', t(key));
        });

        this.toolButtons.set('pen', penBtn);
        this.toolButtons.set('fill', fillBtn);
        this.toolButtons.set('eraser', eraserBtn);
        this.toolButtons.set('select', selectBtn);
        this.toolButtons.set('move', moveBtn);

        const sep1 = document.createElement('div');
        sep1.className = 'sep';
        const sep2 = document.createElement('div');
        sep2.className = 'sep';

        shadow.appendChild(this.undoBtn);
        shadow.appendChild(this.redoBtn);
        shadow.appendChild(sep1);
        shadow.appendChild(saveBtn);
        shadow.appendChild(this.gridBtn);
        shadow.appendChild(sep2);
        for (const btn of this.toolButtons.values()) shadow.appendChild(btn);

        this.undoBtn.addEventListener('tool-click', () => this.dispatchEvent(new CustomEvent('undo')));
        this.redoBtn.addEventListener('tool-click', () => this.dispatchEvent(new CustomEvent('redo')));
        saveBtn.addEventListener('tool-click', () => this.dispatchEvent(new CustomEvent('save')));
        this.gridBtn.addEventListener('tool-click', () => this.dispatchEvent(new CustomEvent('grid-toggle')));

        for (const [tool, btn] of this.toolButtons) {
          btn.addEventListener('tool-click', () => {
            this.setActiveTool(tool);
            this.dispatchEvent(new CustomEvent('tool-change', { detail: { tool }, bubbles: true, composed: true }));
          });
        }

        this.setActiveTool('pen');
      }

      setActiveTool(tool: ToolBarTool) {
        for (const [toolKey, btn] of this.toolButtons) btn.active = toolKey === tool;
      }

      setUndoRedoEnabled(canUndo: boolean, canRedo: boolean) {
        this.undoBtn.disabled = !canUndo;
        this.redoBtn.disabled = !canRedo;
      }

      setGridActive(active: boolean) {
        this.gridBtn.active = active;
      }
    },
  );
});
