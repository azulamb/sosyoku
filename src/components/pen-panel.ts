/*
<pen-panel>
ペンの一覧・追加・削除・選択(アクティブブラシ切り替え)を管理するパネル。LocalStorageに永続化する。
*/
import { nextPenId, settingsStore } from '../core/settings-store.ts';
import type { PenSetting } from '../core/settings-store.ts';
import { t } from '../i18n/index.ts';
import { createIcon } from '../core/icon.ts';
import type { PenItemElement } from './pen-item.ts';
import type { PenIoModalElement } from './pen-io-modal.ts';
import type { MenuButtonElement } from './menu-button.ts';

export interface PenPanelElement extends HTMLElement {
  setActiveChangeCallback(cb: (pen: PenSetting) => void): void;
}

((script, init) => {
  const tagname = script.dataset['penPanel'] || 'pen-panel';
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
    class extends HTMLElement implements PenPanelElement {
      private list: HTMLDivElement;
      private activePenId: string;
      private onActiveChange: ((pen: PenSetting) => void) | null = null;

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
          .actions > button {
            width:26px; height:26px; border:none; background:transparent; color:inherit;
            font-size:14px; cursor:pointer; border-radius:4px;
          }
          .actions > button:hover { background: var(--bg-sunken); }
          .list { flex:1; overflow-y:auto; min-height:0; }
        `;

        const header = document.createElement('header');
        const title = document.createElement('span');
        title.textContent = t('panel.pens');
        const actions = document.createElement('div');
        actions.className = 'actions';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.appendChild(createIcon('add', 16));
        addBtn.title = t('panel.pens.add');
        actions.appendChild(addBtn);

        const ioMenu = document.createElement('menu-button') as unknown as MenuButtonElement;
        ioMenu.setAttribute('aria-label', t('panel.pens.io'));

        const ioIcon = createIcon('more_vert', 18);
        ioIcon.slot = 'icon';
        ioIcon.title = t('panel.pens.io');

        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.textContent = t('panel.pens.export');
        const importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.textContent = t('panel.pens.import');

        ioMenu.appendChild(ioIcon);
        ioMenu.appendChild(exportBtn);
        ioMenu.appendChild(importBtn);
        actions.appendChild(ioMenu);
        header.appendChild(title);
        header.appendChild(actions);

        this.list = document.createElement('div');
        this.list.className = 'list';

        document.addEventListener('locale-changed', () => {
          title.textContent = t('panel.pens');
          addBtn.title = t('panel.pens.add');
          ioMenu.setAttribute('aria-label', t('panel.pens.io'));
          ioIcon.title = t('panel.pens.io');
          exportBtn.textContent = t('panel.pens.export');
          importBtn.textContent = t('panel.pens.import');
        });

        shadow.appendChild(style);
        shadow.appendChild(header);
        shadow.appendChild(this.list);

        this.activePenId = settingsStore.get().pens[0]?.id ?? '';

        addBtn.addEventListener('click', () => this.addPen());
        exportBtn.addEventListener('click', () => {
          ioMenu.close();
          const modal = document.querySelector('pen-io-modal') as PenIoModalElement | null;
          void modal?.openExport(settingsStore.get().pens);
        });
        importBtn.addEventListener('click', () => {
          ioMenu.close();
          const modal = document.querySelector('pen-io-modal') as PenIoModalElement | null;
          void modal?.openImport().then(() => this.renderList());
        });

        this.list.addEventListener('pen-selected', (e) => {
          const id = (e as CustomEvent<{ id: string }>).detail.id;
          this.activePenId = id;
          this.renderList();
          const pen = settingsStore.get().pens.find((p) => p.id === id);
          if (pen) this.onActiveChange?.(pen);
        });
        this.list.addEventListener('pen-changed', () => this.persistAndNotify());
        this.list.addEventListener('pen-delete', (e) => {
          this.deletePen((e as CustomEvent<{ id: string }>).detail.id);
        });

        this.renderList();
      }

      setActiveChangeCallback(cb: (pen: PenSetting) => void) {
        this.onActiveChange = cb;
        const pen = settingsStore.get().pens.find((p) => p.id === this.activePenId);
        if (pen) cb(pen);
      }

      private renderList() {
        this.list.innerHTML = '';
        for (const pen of settingsStore.get().pens) {
          const item = document.createElement('pen-item') as PenItemElement;
          item.bind(pen, pen.id === this.activePenId);
          this.list.appendChild(item);
        }
      }

      private persistAndNotify() {
        settingsStore.update({ pens: settingsStore.get().pens });
        const pen = settingsStore.get().pens.find((p) => p.id === this.activePenId);
        if (pen) this.onActiveChange?.(pen);
      }

      private addPen() {
        const pens = settingsStore.get().pens;
        const newPen: PenSetting = {
          id: nextPenId(),
          name: t('pen.defaultName', { n: pens.length + 1 }),
          size: 10,
          shape: 'round',
        };
        settingsStore.update({ pens: [...pens, newPen] });
        this.activePenId = newPen.id;
        this.renderList();
        this.onActiveChange?.(newPen);
      }

      private deletePen(id: string) {
        const pens = settingsStore.get().pens;
        if (pens.length <= 1) return;
        const next = pens.filter((p) => p.id !== id);
        settingsStore.update({ pens: next });
        if (this.activePenId === id) {
          this.activePenId = next[0].id;
          this.onActiveChange?.(next[0]);
        }
        this.renderList();
      }
    },
  );
});
