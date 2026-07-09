/** Cancel/Saveのどちらかを押すまで閉じないブロッキングモーダルの共通基盤。背景操作はdialog.showModal()のネイティブ動作で無効化する。 */
import { t } from '../i18n/index.ts';

export interface BlockingDialogOptions {
  title: string;
  content: HTMLElement;
  saveLabel?: string;
  cancelLabel?: string;
}

export function showBlockingDialog(options: BlockingDialogOptions): Promise<'save' | 'cancel'> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'padding:0;border:none;max-width:min(92vw,640px);width:100%;';

    const titleEl = document.createElement('div');
    titleEl.textContent = options.title;
    titleEl.style.cssText = 'padding:14px 18px;font-weight:600;border-bottom:1px solid var(--border);';

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px 18px;max-height:70vh;overflow:auto;';
    body.appendChild(options.content);

    const footer = document.createElement('div');
    footer.style.cssText =
      'display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--border);';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = options.cancelLabel ?? t('dialog.cancel');
    cancelBtn.style.cssText =
      'background:transparent;border:1px solid var(--border);border-radius:4px;padding:6px 14px;color:inherit;';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = options.saveLabel ?? t('dialog.save');
    saveBtn.style.cssText =
      'background:var(--accent);color:var(--accent-contrast);border:none;border-radius:4px;padding:6px 14px;';

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    dialog.appendChild(titleEl);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    document.body.appendChild(dialog);

    dialog.addEventListener('cancel', (e) => e.preventDefault());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) e.stopPropagation();
    });

    const cleanup = (result: 'save' | 'cancel') => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    cancelBtn.addEventListener('click', () => cleanup('cancel'));
    saveBtn.addEventListener('click', () => cleanup('save'));

    dialog.showModal();
  });
}
