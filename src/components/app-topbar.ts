/*
<app-topbar>
上部バー。左端にメニューアイコン(slot="menu")、それ以外にツールエリア(slot="tools")を並べる。
*/
((script, init) => {
  const tagname = script.dataset['appTopbar'] || 'app-topbar';
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
      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display:flex; align-items:center; width:100%; gap:6px; }
          .menu-slot { flex:none; display:flex; align-items:center; }
          .tools-slot { flex:1; display:flex; align-items:center; overflow-x:auto; }
        `;
        const menuSlotWrap = document.createElement('div');
        menuSlotWrap.className = 'menu-slot';
        const menuSlot = document.createElement('slot');
        menuSlot.name = 'menu';
        menuSlotWrap.appendChild(menuSlot);

        const toolsSlotWrap = document.createElement('div');
        toolsSlotWrap.className = 'tools-slot';
        const toolsSlot = document.createElement('slot');
        toolsSlot.name = 'tools';
        toolsSlotWrap.appendChild(toolsSlot);

        shadow.appendChild(style);
        shadow.appendChild(menuSlotWrap);
        shadow.appendChild(toolsSlotWrap);
      }
    },
  );
});
