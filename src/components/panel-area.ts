/*
<panel-area>
左右パネルのスロット。中身のパネル要素をプログラムから入れ替えられるようにする。
*/
interface PanelAreaElement extends HTMLElement {
  setPanel(el: HTMLElement): void;
}

((script, init) => {
  const tagname = script.dataset['panelArea'] || 'panel-area';
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
    class extends HTMLElement implements PanelAreaElement {
      private slotHost: HTMLDivElement;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display:flex; flex-direction:column; height:100%; min-height:0; }
          .slot-host { flex:1; min-height:0; display:flex; flex-direction:column; }
        `;

        this.slotHost = document.createElement('div');
        this.slotHost.className = 'slot-host';

        shadow.appendChild(style);
        shadow.appendChild(this.slotHost);
      }

      setPanel(el: HTMLElement) {
        this.slotHost.innerHTML = '';
        this.slotHost.appendChild(el);
      }
    },
  );
});
