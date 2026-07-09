/*
<layer-panel>
レイヤーの一覧・追加・削除・並び替えを管理するパネル。中身は <layer-item> を並べる。
*/
import type { SosyokuDocument } from '../core/document.ts';
import { NormalLayer } from '../core/layer.ts';
import { t } from '../i18n/index.ts';
import { createIcon } from '../core/icon.ts';
import type { ColorPickerModalElement } from './color-picker-modal.ts';
import type { LayerItemElement } from './layer-item.ts';

export interface LayerPanelElement extends HTMLElement {
  setDocument(doc: SosyokuDocument): void;
  setRenderCallback(cb: () => void): void;
}

((script, init) => {
  const tagname = script.dataset['layerPanel'] || 'layer-panel';
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
    class extends HTMLElement implements LayerPanelElement {
      private doc: SosyokuDocument | null = null;
      private list: HTMLDivElement;
      private renderCallback: (() => void) | null = null;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display:flex; flex-direction:column; height:100%; min-height:0; }
          header {
            display:flex; align-items:center; justify-content:space-between;
            padding:8px; border-bottom:1px solid var(--border); font-size:12px; font-weight:600;
          }
          .actions { display:flex; gap:4px; }
          .actions button {
            width:26px; height:26px; border:none; background:transparent; color:inherit;
            font-size:14px; cursor:pointer; border-radius:4px;
          }
          .actions button:hover { background: var(--bg-sunken); }
          .list { flex:1; overflow-y:auto; min-height:0; }
        `;

        const header = document.createElement('header');
        const title = document.createElement('span');
        title.textContent = t('panel.layers');

        const actions = document.createElement('div');
        actions.className = 'actions';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.appendChild(createIcon('add', 16));
        addBtn.title = t('panel.layers.add');
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.appendChild(createIcon('delete', 16));
        delBtn.title = t('panel.layers.remove');
        actions.appendChild(addBtn);
        actions.appendChild(delBtn);

        document.addEventListener('locale-changed', () => {
          title.textContent = t('panel.layers');
          addBtn.title = t('panel.layers.add');
          delBtn.title = t('panel.layers.remove');
        });

        header.appendChild(title);
        header.appendChild(actions);

        this.list = document.createElement('div');
        this.list.className = 'list';

        shadow.appendChild(style);
        shadow.appendChild(header);
        shadow.appendChild(this.list);

        addBtn.addEventListener('click', () => this.addLayer());
        delBtn.addEventListener('click', () => this.deleteActiveLayer());

        this.list.addEventListener('layer-selected', () => this.renderList());
        this.list.addEventListener('layer-changed', () => this.notifyRender());
        this.list.addEventListener('layer-reorder', (e) => {
          const { id, toIndex } = (e as CustomEvent).detail;
          this.doc?.moveLayer(id, toIndex);
          this.renderList();
          this.notifyRender();
        });
      }

      setDocument(doc: SosyokuDocument) {
        this.doc = doc;
        doc.addEventListener('layers-changed', () => this.renderList());
        this.renderList();
      }

      setRenderCallback(cb: () => void) {
        this.renderCallback = cb;
      }

      private notifyRender() {
        this.doc?.markDirty();
        this.renderCallback?.();
      }

      private renderList() {
        if (!this.doc) return;
        this.list.innerHTML = '';
        for (const layer of this.doc.layers) {
          const item = document.createElement('layer-item') as LayerItemElement;
          item.bind(layer, this.doc);
          this.list.appendChild(item);
        }
      }

      private async addLayer() {
        if (!this.doc) return;
        const picker = document.querySelector('color-picker-modal') as ColorPickerModalElement | null;
        const defaultColor = '#141820';
        const color = picker ? await picker.open(defaultColor) : defaultColor;
        if (!color) return;
        const layer = new NormalLayer({
          name: t('layer.defaultName', { n: this.doc.layers.length + 1 }),
          width: this.doc.width,
          height: this.doc.height,
          color,
        });
        this.doc.addLayer(layer, 0);
        this.notifyRender();
      }

      private deleteActiveLayer() {
        if (!this.doc || !this.doc.activeLayerId) return;
        if (this.doc.layers.length <= 1) return;
        this.doc.removeLayer(this.doc.activeLayerId);
        this.notifyRender();
      }
    },
  );
});
