/*
<layer-add-modal>
通常レイヤーの色、または参照レイヤーに使う画像ファイルを選ぶモーダル。
*/
import { showBlockingDialog } from '../core/dialog.ts';
import { pickFiles } from '../core/file-io.ts';
import { settingsStore } from '../core/settings-store.ts';
import { t } from '../i18n/index.ts';

export type LayerAddChoice =
  | { type: 'normal'; color: string }
  | { type: 'reference'; file: File };

export interface LayerAddModalElement extends HTMLElement {
  open(currentColor: string): Promise<LayerAddChoice | null>;
}

((script, init) => {
  const tagname = script.dataset['layerAddModal'] || 'layer-add-modal';
  if (customElements.get(tagname)) return;
  if (document.readyState !== 'loading') return init(script, tagname);
  document.addEventListener('DOMContentLoaded', () => init(script, tagname));
})(document.currentScript as HTMLScriptElement, (_script: HTMLScriptElement, tagname: string) => {
  customElements.define(
    tagname,
    class extends HTMLElement implements LayerAddModalElement {
      async open(currentColor: string): Promise<LayerAddChoice | null> {
        const selection: { mode: 'normal' | 'reference' } = { mode: 'normal' };
        let selectedColor = currentColor;
        let selectedFile: File | null = null;
        let previewUrl: string | null = null;

        const content = document.createElement('div');
        const tabs = document.createElement('div');
        tabs.setAttribute('role', 'tablist');
        tabs.style.cssText = 'display:flex;border-bottom:1px solid var(--border);margin:-4px 0 16px;';

        const colorTab = this.makeTab(t('layer.add.colorTab'));
        const fileTab = this.makeTab(t('layer.add.fileTab'));
        tabs.appendChild(colorTab);
        tabs.appendChild(fileTab);

        const colorPanel = document.createElement('div');
        colorPanel.setAttribute('role', 'tabpanel');
        const nativeRow = document.createElement('div');
        nativeRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px;';
        const nativeInput = document.createElement('input');
        nativeInput.type = 'color';
        nativeInput.value = currentColor;
        nativeInput.style.cssText =
          'width:48px;height:36px;padding:0;border:1px solid var(--border);border-radius:4px;background:none;';
        const nativeLabel = document.createElement('span');
        nativeLabel.textContent = currentColor;
        nativeRow.appendChild(nativeInput);
        nativeRow.appendChild(nativeLabel);

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
          selectedColor = nativeInput.value;
          nativeLabel.textContent = selectedColor;
          highlightSwatch(selectedColor);
        });
        for (const color of settingsStore.get().palette) {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.dataset.color = color;
          swatch.title = color;
          swatch.style.cssText =
            `width:28px;height:28px;border-radius:4px;border:1px solid var(--border);background:${color};cursor:pointer;padding:0;`;
          swatch.addEventListener('click', () => {
            selectedColor = color;
            nativeInput.value = color;
            nativeLabel.textContent = color;
            highlightSwatch(color);
          });
          swatches.push(swatch);
          grid.appendChild(swatch);
        }
        highlightSwatch(currentColor);
        colorPanel.appendChild(nativeRow);
        colorPanel.appendChild(grid);

        const filePanel = document.createElement('div');
        filePanel.setAttribute('role', 'tabpanel');
        filePanel.style.cssText =
          'display:none;min-height:180px;align-items:center;justify-content:center;flex-direction:column;gap:10px;';
        const preview = document.createElement('img');
        preview.alt = '';
        preview.style.cssText =
          'display:none;max-width:100%;height:180px;object-fit:contain;border:1px solid var(--border);background:var(--bg-sunken);';
        const fileName = document.createElement('div');
        fileName.textContent = t('layer.add.noFile');
        fileName.style.cssText =
          'max-width:100%;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        filePanel.appendChild(preview);
        filePanel.appendChild(fileName);

        const selectFile = async () => {
          const [file] = await pickFiles('image/png,image/jpeg,.png,.jpg,.jpeg');
          if (!file) return;
          selectedFile = file;
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          previewUrl = URL.createObjectURL(file);
          preview.src = previewUrl;
          preview.style.display = 'block';
          fileName.textContent = file.name;
        };
        const setMode = (next: 'normal' | 'reference') => {
          selection.mode = next;
          const isColor = selection.mode === 'normal';
          colorTab.setAttribute('aria-selected', String(isColor));
          fileTab.setAttribute('aria-selected', String(!isColor));
          this.styleTab(colorTab, isColor);
          this.styleTab(fileTab, !isColor);
          colorPanel.style.display = isColor ? 'block' : 'none';
          filePanel.style.display = isColor ? 'none' : 'flex';
        };
        colorTab.addEventListener('click', () => setMode('normal'));
        fileTab.addEventListener('click', () => {
          setMode('reference');
          void selectFile();
        });
        setMode('normal');

        content.appendChild(tabs);
        content.appendChild(colorPanel);
        content.appendChild(filePanel);
        const result = await showBlockingDialog({
          title: t('layer.add.title'),
          content,
          saveLabel: t('layer.add.action'),
        });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (result !== 'save') return null;
        if (selection.mode === 'reference') return selectedFile ? { type: 'reference', file: selectedFile } : null;
        return { type: 'normal', color: selectedColor };
      }

      private makeTab(label: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.textContent = label;
        button.style.cssText =
          'padding:8px 14px;border:none;border-bottom:2px solid transparent;background:transparent;color:inherit;cursor:pointer;';
        return button;
      }

      private styleTab(button: HTMLButtonElement, active: boolean) {
        button.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
        button.style.color = active ? 'var(--text)' : 'var(--text-muted)';
        button.style.fontWeight = active ? '600' : '400';
      }
    },
  );
});
