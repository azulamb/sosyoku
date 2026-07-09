/*
<canvas-tabs>
複数ドキュメントのタブ。クリックで切り替え、×で閉じる、+で新規ドキュメントを作成する。
タブ名をダブルクリックするとドキュメント名を変更できる。
*/
import { t } from '../i18n/index.ts';
import { createIcon } from '../core/icon.ts';
import { showBlockingDialog } from '../core/dialog.ts';

export interface TabInfo {
  id: string;
  title: string;
  dirty: boolean;
}

interface CanvasTabsElement extends HTMLElement {
  setTabs(tabs: TabInfo[], activeId: string | null): void;
}

((script, init) => {
  const tagname = script.dataset['canvasTabs'] || 'canvas-tabs';
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
    class extends HTMLElement implements CanvasTabsElement {
      private list: HTMLDivElement;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display: flex; align-items: center; height: 100%; overflow-x: auto; }
          .list { display: flex; align-items: center; height: 100%; }
          .tab {
            display: flex; align-items: center; gap: 6px; padding: 0 10px; height: 100%;
            border-right: 1px solid var(--border); cursor: pointer; font-size: 12px; white-space: nowrap; flex: none;
          }
          .tab.active { background: var(--bg-sunken); box-shadow: inset 0 -2px 0 var(--accent); }
          .tab .close {
            border: none; background: transparent; color: var(--text-muted); cursor: pointer;
            border-radius: 3px; padding: 0; display: flex; align-items: center; justify-content: center;
          }
          .tab .close:hover { color: var(--danger); }
          .dirty-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex: none; }
          .new-btn {
            flex: none; width: 34px; height: 100%; border: none; background: transparent; color: inherit;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
          }
          .new-btn:hover { background: var(--bg-sunken); }
        `;

        this.list = document.createElement('div');
        this.list.className = 'list';

        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.className = 'new-btn';
        newBtn.appendChild(createIcon('add', 18));
        newBtn.title = t('tab.new');
        newBtn.addEventListener('click', () => {
          this.dispatchEvent(new CustomEvent('tab-new', { bubbles: true, composed: true }));
        });
        document.addEventListener('locale-changed', () => {
          newBtn.title = t('tab.new');
        });

        shadow.appendChild(style);
        shadow.appendChild(this.list);
        shadow.appendChild(newBtn);
      }

      setTabs(tabs: TabInfo[], activeId: string | null) {
        this.list.innerHTML = '';
        for (const tab of tabs) {
          const el = document.createElement('div');
          el.className = 'tab' + (tab.id === activeId ? ' active' : '');

          if (tab.dirty) {
            const dot = document.createElement('span');
            dot.className = 'dirty-dot';
            el.appendChild(dot);
          }

          const label = document.createElement('span');
          label.textContent = tab.title || '無題';
          label.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            void this.renameTab(tab);
          });
          el.appendChild(label);

          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'close';
          closeBtn.appendChild(createIcon('close', 14));
          closeBtn.title = t('dialog.close');
          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dispatchEvent(new CustomEvent('tab-close', { detail: { id: tab.id }, bubbles: true, composed: true }));
          });
          el.appendChild(closeBtn);

          el.addEventListener('click', () => {
            this.dispatchEvent(
              new CustomEvent('tab-select', { detail: { id: tab.id }, bubbles: true, composed: true }),
            );
          });

          this.list.appendChild(el);
        }
      }

      private async renameTab(tab: TabInfo) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = tab.title;
        input.style.cssText = 'width:100%;padding:8px;font-size:14px;box-sizing:border-box;';
        const result = await showBlockingDialog({
          title: t('rename.document.title'),
          content: input,
          saveLabel: t('dialog.change'),
        });
        if (result === 'save' && input.value.trim()) {
          this.dispatchEvent(
            new CustomEvent('tab-rename', {
              detail: { id: tab.id, name: input.value.trim() },
              bubbles: true,
              composed: true,
            }),
          );
        }
      }
    },
  );
});
