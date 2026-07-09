/*
<settings-modal>
左に設定の大カテゴリ、右に設定内容を表示する汎用モーダル。ドキュメント設定・アプリ設定の両方で使い回す。
最下部のキャンセル/保存のどちらかを押すまで閉じない(showBlockingDialogの挙動を利用)。
*/
import { showBlockingDialog } from '../core/dialog.ts';

export interface SettingsCategory {
  id: string;
  label: string;
  content: HTMLElement;
}

export interface SettingsModalElement extends HTMLElement {
  open(title: string, categories: SettingsCategory[], initialCategoryId?: string): Promise<'save' | 'cancel'>;
}

((script, init) => {
  const tagname = script.dataset['settingsModal'] || 'settings-modal';
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
    class extends HTMLElement implements SettingsModalElement {
      async open(
        title: string,
        categories: SettingsCategory[],
        initialCategoryId?: string,
      ): Promise<'save' | 'cancel'> {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; min-height:320px; gap:0;';

        const nav = document.createElement('div');
        nav.style.cssText =
          'width:140px; flex:none; border-right:1px solid var(--border); display:flex; flex-direction:column; gap:2px; padding-right:10px;';

        const contentHost = document.createElement('div');
        contentHost.style.cssText = 'flex:1; min-width:0; padding-left:16px;';

        const navButtons = new Map<string, HTMLButtonElement>();

        const selectCategory = (id: string) => {
          for (const [cid, btn] of navButtons) {
            const active = cid === id;
            btn.style.background = active ? 'var(--accent)' : 'transparent';
            btn.style.color = active ? 'var(--accent-contrast)' : 'inherit';
          }
          contentHost.innerHTML = '';
          const category = categories.find((c) => c.id === id);
          if (category) contentHost.appendChild(category.content);
        };

        for (const category of categories) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = category.label;
          btn.style.cssText =
            'text-align:left; padding:8px 10px; border:none; border-radius:4px; background:transparent; color:inherit; cursor:pointer; font-size:12px;';
          btn.addEventListener('click', () => selectCategory(category.id));
          navButtons.set(category.id, btn);
          nav.appendChild(btn);
        }

        wrapper.appendChild(nav);
        wrapper.appendChild(contentHost);

        const initial = initialCategoryId ?? categories[0]?.id;
        if (initial) selectCategory(initial);

        return await showBlockingDialog({ title, content: wrapper, saveLabel: '保存' });
      }
    },
  );
});
