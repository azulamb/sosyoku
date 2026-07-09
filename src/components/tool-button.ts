/*
<tool-button>
ツールバー用のシンプルなトグル/アクションボタン。属性 active / disabled で状態を切り替える。
*/
export interface ToolButtonElement extends HTMLElement {
  active: boolean;
  disabled: boolean;
}

((script, init) => {
  const tagname = script.dataset['toolButton'] || 'tool-button';
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
    class extends HTMLElement implements ToolButtonElement {
      static get observedAttributes() {
        return ['label', 'active', 'disabled'];
      }

      private button: HTMLButtonElement;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display:inline-flex; }
          button {
            width:32px; height:32px; border:none; border-radius:6px; background:transparent; color:inherit;
            font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;
          }
          button:hover { background: var(--bg-sunken); }
          button.active { background: var(--accent); color: var(--accent-contrast); }
          button:disabled { opacity:.35; cursor:default; }
        `;
        this.button = document.createElement('button');
        this.button.type = 'button';
        const slot = document.createElement('slot');
        this.button.appendChild(slot);
        shadow.appendChild(style);
        shadow.appendChild(this.button);

        this.button.addEventListener('click', () => {
          if (this.disabled) return;
          this.dispatchEvent(new CustomEvent('tool-click', { bubbles: true, composed: true }));
        });
      }

      attributeChangedCallback() {
        this.button.classList.toggle('active', this.hasAttribute('active'));
        this.button.disabled = this.hasAttribute('disabled');
        this.button.title = this.getAttribute('label') || '';
      }

      get active(): boolean {
        return this.hasAttribute('active');
      }
      set active(v: boolean) {
        if (v) this.setAttribute('active', '');
        else this.removeAttribute('active');
      }
      get disabled(): boolean {
        return this.hasAttribute('disabled');
      }
      set disabled(v: boolean) {
        if (v) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
      }
    },
  );
});
