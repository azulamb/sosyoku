/*
<pen-item>
ペン1件を表す行コンポーネント。名前(ダブルクリックで変更)・サイズ・形状(丸/四角)・削除・選択(アクティブ化)を扱う。
*/
import type { PenSetting } from '../core/settings-store.ts';
import { showBlockingDialog } from '../core/dialog.ts';
import { t } from '../i18n/index.ts';
import { createIcon } from '../core/icon.ts';

export interface PenItemElement extends HTMLElement {
  bind(pen: PenSetting, isActive: boolean): void;
}

((script, init) => {
  const tagname = script.dataset['penItem'] || 'pen-item';
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
    class extends HTMLElement implements PenItemElement {
      private pen: PenSetting | null = null;
      private root: HTMLDivElement;
      private shapeBtn: HTMLButtonElement;
      private nameEl: HTMLSpanElement;
      private sizeInput: HTMLInputElement;
      private deleteBtn: HTMLButtonElement;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display:block; }
          .row {
            display:flex; align-items:center; gap:8px; padding:6px 8px;
            border-bottom:1px solid var(--border); cursor:pointer;
          }
          .row.active { background: color-mix(in srgb, var(--accent) 18%, transparent); }
          .shape {
            width:24px; height:24px; border:1px solid var(--border); background:transparent; color:inherit;
            cursor:pointer; border-radius:4px; flex:none; display:flex; align-items:center; justify-content:center; font-size:13px;
          }
          .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
          .size {
            width:52px; flex:none; padding:4px; border:1px solid var(--border); border-radius:4px;
            background:var(--bg); color:inherit; font-size:12px;
          }
          .delete {
            width:22px; height:22px; border:none; background:transparent; color:var(--text-muted); cursor:pointer;
            border-radius:4px; flex:none; display:flex; align-items:center; justify-content:center; padding:0;
          }
          .delete:hover { background: var(--bg-sunken); color:var(--danger); }
        `;

        this.root = document.createElement('div');
        this.root.className = 'row';

        this.shapeBtn = document.createElement('button');
        this.shapeBtn.type = 'button';
        this.shapeBtn.className = 'shape';
        this.shapeBtn.title = t('pen.shapeToggle');

        this.nameEl = document.createElement('span');
        this.nameEl.className = 'name';

        this.sizeInput = document.createElement('input');
        this.sizeInput.type = 'number';
        this.sizeInput.className = 'size';
        this.sizeInput.min = '1';
        this.sizeInput.max = '200';
        this.sizeInput.title = t('pen.size');

        this.deleteBtn = document.createElement('button');
        this.deleteBtn.type = 'button';
        this.deleteBtn.className = 'delete';
        this.deleteBtn.appendChild(createIcon('close', 16));
        this.deleteBtn.title = t('pen.delete');

        this.root.appendChild(this.shapeBtn);
        this.root.appendChild(this.nameEl);
        this.root.appendChild(this.sizeInput);
        this.root.appendChild(this.deleteBtn);
        shadow.appendChild(style);
        shadow.appendChild(this.root);

        this.root.addEventListener('click', (e) => {
          if (e.target === this.sizeInput || e.target === this.deleteBtn || e.target === this.shapeBtn) return;
          this.dispatchSelect();
        });
        this.shapeBtn.addEventListener('click', () => this.toggleShape());
        this.nameEl.addEventListener('dblclick', () => void this.openRename());
        this.sizeInput.addEventListener('change', () => this.changeSize());
        this.deleteBtn.addEventListener('click', () => this.dispatchDelete());
      }

      bind(pen: PenSetting, isActive: boolean) {
        this.pen = pen;
        this.shapeBtn.textContent = pen.shape === 'round' ? '●' : '■';
        this.nameEl.textContent = pen.name;
        this.sizeInput.value = String(pen.size);
        this.root.classList.toggle('active', isActive);
      }

      private dispatchSelect() {
        if (!this.pen) return;
        this.dispatchEvent(
          new CustomEvent('pen-selected', { detail: { id: this.pen.id }, bubbles: true, composed: true }),
        );
      }

      private dispatchDelete() {
        if (!this.pen) return;
        this.dispatchEvent(
          new CustomEvent('pen-delete', { detail: { id: this.pen.id }, bubbles: true, composed: true }),
        );
      }

      private toggleShape() {
        if (!this.pen) return;
        this.pen.shape = this.pen.shape === 'round' ? 'square' : 'round';
        this.shapeBtn.textContent = this.pen.shape === 'round' ? '●' : '■';
        this.notifyChanged();
      }

      private changeSize() {
        if (!this.pen) return;
        const size = Math.max(1, Math.min(200, Number(this.sizeInput.value) || this.pen.size));
        this.pen.size = size;
        this.sizeInput.value = String(size);
        this.notifyChanged();
      }

      private async openRename() {
        if (!this.pen) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.pen.name;
        input.style.cssText = 'width:100%;padding:8px;font-size:14px;box-sizing:border-box;';
        const result = await showBlockingDialog({
          title: t('rename.pen.title'),
          content: input,
          saveLabel: t('dialog.change'),
        });
        if (result === 'save' && input.value.trim() && this.pen) {
          this.pen.name = input.value.trim();
          this.nameEl.textContent = this.pen.name;
          this.notifyChanged();
        }
      }

      private notifyChanged() {
        this.dispatchEvent(new CustomEvent('pen-changed', { bubbles: true, composed: true }));
      }
    },
  );
});
