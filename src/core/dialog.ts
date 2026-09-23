/** Cancel/Saveのどちらかを押すまで閉じないブロッキングモーダルの共通基盤。背景操作はdialog.showModal()のネイティブ動作で無効化する。 */
import { t } from '../i18n/index.ts';
import { createButton } from './dom.ts';

export type DialogResult = 'save' | 'cancel';

export interface BlockingDialogOptions {
  title: string;
  content: HTMLElement;
  saveLabel?: string;
  cancelLabel?: string;
}

const BUTTON_STYLES = {
  primary: 'background:var(--accent);color:var(--accent-contrast);border:none;border-radius:4px;padding:6px 14px;',
  secondary: 'background:transparent;border:1px solid var(--border);border-radius:4px;padding:6px 14px;color:inherit;',
} as const;

/** モーダルのフッターに並べるボタン(primary: 決定系 / secondary: キャンセル等) */
export function createDialogButton(label: string, variant: keyof typeof BUTTON_STYLES): HTMLButtonElement {
  const button = createButton({ text: label });
  button.style.cssText = BUTTON_STYLES[variant];
  return button;
}

/** 本文とフッターを持つモーダル用<dialog>を組み立ててbodyに追加する(表示はしない) */
export function createModalDialog(maxWidth: string, parts: HTMLElement[]): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.style.cssText = `padding:0;border:none;max-width:${maxWidth};width:100%;`;
  for (const part of parts) dialog.appendChild(part);
  document.body.appendChild(dialog);
  return dialog;
}

export function createDialogFooter(justify: 'flex-end' | 'space-between', buttons: HTMLElement[]): HTMLDivElement {
  const footer = document.createElement('div');
  footer.style.cssText =
    `display:flex;justify-content:${justify};gap:8px;padding:12px 18px;border-top:1px solid var(--border);`;
  for (const button of buttons) footer.appendChild(button);
  return footer;
}

export function showBlockingDialog(options: BlockingDialogOptions): Promise<DialogResult> {
  return new Promise((resolve) => {
    const titleEl = document.createElement('div');
    titleEl.textContent = options.title;
    titleEl.style.cssText = 'padding:14px 18px;font-weight:600;border-bottom:1px solid var(--border);';

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px 18px;max-height:70vh;overflow:auto;';
    body.appendChild(options.content);

    const cancelBtn = createDialogButton(options.cancelLabel ?? t('dialog.cancel'), 'secondary');
    const saveBtn = createDialogButton(options.saveLabel ?? t('dialog.save'), 'primary');
    const footer = createDialogFooter('flex-end', [cancelBtn, saveBtn]);

    const dialog = createModalDialog('min(92vw,640px)', [titleEl, body, footer]);
    dialog.addEventListener('cancel', (e) => e.preventDefault());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) e.stopPropagation();
    });

    const finish = (result: DialogResult) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    cancelBtn.addEventListener('click', () => finish('cancel'));
    saveBtn.addEventListener('click', () => finish('save'));

    dialog.showModal();
  });
}

/** 1行テキストの入力ダイアログ。変更が確定され、空白以外の値があればトリム済みの値を返す */
export async function showTextInputDialog(title: string, initialValue: string): Promise<string | null> {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = initialValue;
  input.style.cssText = 'width:100%;padding:8px;font-size:14px;box-sizing:border-box;';
  const result = await showBlockingDialog({ title, content: input, saveLabel: t('dialog.change') });
  const value = input.value.trim();
  return result === 'save' && value ? value : null;
}
