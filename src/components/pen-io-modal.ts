/*
<pen-io-modal>
ペンのエクスポート/インポート用の選択式モーダル。チェックボックスで対象ペンを選び実行する。
*/
import { showBlockingDialog } from '../core/dialog.ts';
import { downloadBlob, pickFiles } from '../core/file-io.ts';
import { nextPenId, settingsStore } from '../core/settings-store.ts';
import type { PenSetting } from '../core/settings-store.ts';
import { t } from '../i18n/index.ts';

interface PenIoModalElement extends HTMLElement {
  openExport(pens: PenSetting[]): Promise<void>;
  openImport(): Promise<void>;
}

((script, init) => {
  const tagname = script.dataset['penIoModal'] || 'pen-io-modal';
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
    class extends HTMLElement implements PenIoModalElement {
      async openExport(pens: PenSetting[]): Promise<void> {
        if (pens.length === 0) return;
        const { content, getSelected } = this.buildChecklist(pens);
        const result = await showBlockingDialog({
          title: t('pen.export.title'),
          content,
          saveLabel: t('pen.export.action'),
        });
        if (result !== 'save') return;
        const selected = getSelected();
        if (!selected.length) return;
        downloadBlob(new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' }), 'sosyoku-pens.json');
      }

      async openImport(): Promise<void> {
        const [file] = await pickFiles('application/json');
        if (!file) return;
        let imported: PenSetting[] = [];
        try {
          const parsed = JSON.parse(await file.text());
          if (Array.isArray(parsed)) imported = parsed;
        } catch {
          imported = [];
        }
        if (!imported.length) return;

        const { content, getSelected } = this.buildChecklist(imported);
        const result = await showBlockingDialog({
          title: t('pen.import.title'),
          content,
          saveLabel: t('pen.import.action'),
        });
        if (result !== 'save') return;
        const selected = getSelected();
        if (!selected.length) return;
        const current = settingsStore.get().pens;
        const additions = selected.map((pen) => ({ ...pen, id: nextPenId() }));
        settingsStore.update({ pens: [...current, ...additions] });
      }

      private buildChecklist(pens: PenSetting[]) {
        const content = document.createElement('div');
        const checkboxes: { pen: PenSetting; input: HTMLInputElement }[] = [];
        for (const pen of pens) {
          const row = document.createElement('label');
          row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 0; font-size:13px;';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = true;
          const label = document.createElement('span');
          label.textContent = `${pen.name}(${pen.shape === 'round' ? '丸' : '四角'} / ${pen.size}px)`;
          row.appendChild(input);
          row.appendChild(label);
          content.appendChild(row);
          checkboxes.push({ pen, input });
        }
        return {
          content,
          getSelected: () => checkboxes.filter((c) => c.input.checked).map((c) => c.pen),
        };
      }
    },
  );
});
