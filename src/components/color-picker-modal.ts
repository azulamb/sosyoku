/*
<color-picker-modal>
色選択モーダル。ネイティブカラーピッカーと、設定パレットの色一覧をクリックで選べるグリッドを提供する。
body に1つ配置しておき、open(currentColor) を呼び出して使う。
*/
import { showBlockingDialog } from '../core/dialog.ts';
import { settingsStore } from '../core/settings-store.ts';
import { t } from '../i18n/index.ts';

export interface ColorPickerModalElement extends HTMLElement {
  open(currentColor: string): Promise<string | null>;
}

((script, init) => {
  const tagname = script.dataset['colorPickerModal'] || 'color-picker-modal';
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
    class extends HTMLElement implements ColorPickerModalElement {
      async open(currentColor: string): Promise<string | null> {
        let selected = currentColor;

        const content = document.createElement('div');

        const nativeRow = document.createElement('div');
        nativeRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px;';

        const nativeInput = document.createElement('input');
        nativeInput.type = 'color';
        nativeInput.value = currentColor;
        nativeInput.style.cssText =
          'width:48px;height:36px;padding:0;border:1px solid var(--border);border-radius:4px;background:none;';

        const nativeLabel = document.createElement('span');
        nativeLabel.textContent = currentColor;

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(28px,1fr));gap:6px;';

        const swatches: HTMLButtonElement[] = [];
        const highlightSwatch = (color: string) => {
          for (const swatch of swatches) {
            swatch.style.outline = swatch.dataset.color?.toLowerCase() === color.toLowerCase()
              ? '2px solid var(--accent)'
              : 'none';
          }
        };

        nativeInput.addEventListener('input', () => {
          selected = nativeInput.value;
          nativeLabel.textContent = selected;
          highlightSwatch(selected);
        });

        for (const color of settingsStore.get().palette) {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.dataset.color = color;
          swatch.title = color;
          swatch.style.cssText =
            `width:28px;height:28px;border-radius:4px;border:1px solid var(--border);background:${color};cursor:pointer;padding:0;`;
          swatch.addEventListener('click', () => {
            selected = color;
            nativeInput.value = color;
            nativeLabel.textContent = color;
            highlightSwatch(color);
          });
          swatches.push(swatch);
          grid.appendChild(swatch);
        }
        highlightSwatch(currentColor);

        nativeRow.appendChild(nativeInput);
        nativeRow.appendChild(nativeLabel);
        content.appendChild(nativeRow);
        content.appendChild(grid);

        const result = await showBlockingDialog({ title: t('colorpicker.title'), content });
        return result === 'save' ? selected : null;
      }
    },
  );
});
