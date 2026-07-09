/*
<menu-button>
Dialogを使ったメニューを表示するボタンコンポーネント。クリックで開閉、外側クリック/Escapeで閉じる。
中身(メニュー項目)はスロットされた子要素(例: <app-menu>、または任意の<button>群)。
ボタンの見た目は slot="icon" の子要素で差し替え可能(未指定時はfavicon.svgのアイコン)。
aria-labelはホスト要素のaria-label属性があればそれを使う(未指定時は「メニュー」)。
開閉・外側クリック/Escapeでの自動クローズ・画面内に収まる自動配置は core/popup.ts に委譲している。
*/
import { closePopup, openPopup } from '../core/popup.ts';

interface MenuButtonElement extends HTMLElement {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

((script, init) => {
  const tagname = script.dataset['menu-button'] || 'menu-button';
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
    class extends HTMLElement implements MenuButtonElement {
      protected dialog: HTMLDialogElement;

      constructor() {
        super();

        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', this.getAttribute('aria-label') || 'メニュー');

        const iconSlot = document.createElement('slot');
        iconSlot.name = 'icon';
        const defaultIcon = document.createElement('span');
        defaultIcon.className = 'default-icon';
        iconSlot.appendChild(defaultIcon);
        button.appendChild(iconSlot);

        this.dialog = document.createElement('dialog');
        this.dialog.setAttribute('role', 'menu');
        this.dialog.appendChild(document.createElement('slot'));

        const style = document.createElement('style');
        style.textContent = `
          :host { position: relative; display: inline-flex; }
          button {
            width: 34px; height: 34px; border: none; color: inherit;
            cursor: pointer; border-radius: 6px; padding: 0;
            background-color: transparent;
            display: flex; align-items: center; justify-content: center;
          }
          button:hover { background-color: var(--bg-sunken); }
          .default-icon {
            display: block; width: 22px; height: 22px;
            background-image: url('favicon.svg');
            background-repeat: no-repeat;
            background-position: center;
            background-size: 22px 22px;
          }
          dialog {
            position: absolute; top: calc(100% + 4px); left: 0; margin: 0; padding: 6px;
            min-width: 200px; border: 1px solid var(--border); border-radius: 8px;
            background: var(--bg-elevated); box-shadow: var(--shadow); color: var(--text);
          }
          dialog:not([open]) { display: none; }
          ::slotted(*) { display: block; width: 100%; }
          ::slotted(button) {
            text-align: left; padding: 8px 10px; border: none; background: transparent;
            color: inherit; font-size: 13px; cursor: pointer; border-radius: 6px;
          }
          ::slotted(button:hover) { background: var(--bg-sunken); }
        `;

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.appendChild(style);
        shadow.appendChild(button);
        shadow.appendChild(this.dialog);

        button.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.isOpen()) this.close();
          else this.open();
        });
      }

      isOpen(): boolean {
        return this.dialog.open;
      }

      public open() {
        openPopup(this.dialog);
      }

      public close() {
        closePopup(this.dialog);
      }
    },
  );
});
