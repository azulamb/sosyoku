/*
<app-menu>
menu-button内にスロットされるメニュー項目一覧。
ファイルを開く/保存する/エクスポート/ドキュメントの設定/設定/アプリをインストール/Sosyokuについて を発火する。
「アプリをインストール」はPWAとしてインストール可能な間だけ表示する('sosyoku-installable-changed'イベントで制御)。
実際の処理はイベントを受け取ったapp.ts側が行う(このコンポーネントはイベント発行のみ)。
*/
import { t } from '../i18n/index.ts';
import type { TranslationKey } from '../i18n/index.ts';
import type { MenuButtonElement } from './menu-button.ts';

((script, init) => {
  const tagname = script.dataset['appMenu'] || 'app-menu';
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
    class extends HTMLElement {
      private installBtn: HTMLButtonElement | null = null;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display: block; min-width: 190px; }
          button {
            display: block; width: 100%; text-align: left; padding: 8px 10px; border: none;
            background: transparent; color: inherit; font-size: 13px; cursor: pointer; border-radius: 6px;
          }
          button:hover { background: var(--bg-sunken); }
          .sep { height: 1px; background: var(--border); margin: 4px 2px; }
        `;
        shadow.appendChild(style);

        const groups: { key: TranslationKey; event: string }[][] = [
          [
            { key: 'menu.open', event: 'sosyoku-open-request' },
            { key: 'menu.save', event: 'sosyoku-save-request' },
            { key: 'menu.export', event: 'sosyoku-export-request' },
          ],
          [
            { key: 'menu.documentSettings', event: 'sosyoku-document-settings-request' },
            { key: 'menu.settings', event: 'sosyoku-settings-request' },
          ],
          [
            { key: 'menu.install', event: 'sosyoku-install-request' },
            { key: 'menu.about', event: 'sosyoku-about-request' },
          ],
        ];

        const buttons: { key: TranslationKey; btn: HTMLButtonElement }[] = [];

        groups.forEach((group, index) => {
          for (const item of group) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = t(item.key);
            btn.addEventListener('click', () => {
              document.dispatchEvent(new CustomEvent(item.event));
              this.closeParentMenu();
            });
            buttons.push({ key: item.key, btn });
            if (item.key === 'menu.install') {
              this.installBtn = btn;
              btn.style.display = 'none';
            }
            shadow.appendChild(btn);
          }
          if (index < groups.length - 1) {
            const sep = document.createElement('div');
            sep.className = 'sep';
            shadow.appendChild(sep);
          }
        });

        document.addEventListener('locale-changed', () => {
          for (const { key, btn } of buttons) btn.textContent = t(key);
        });

        document.addEventListener('sosyoku-installable-changed', (e) => {
          const installable = (e as CustomEvent<{ installable: boolean }>).detail.installable;
          if (this.installBtn) this.installBtn.style.display = installable ? '' : 'none';
        });
      }

      private closeParentMenu() {
        const menuButton = this.closest('menu-button') as MenuButtonElement | null;
        menuButton?.close();
      }
    },
  );
});
