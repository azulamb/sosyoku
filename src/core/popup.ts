/**
 * 軽量なフローティングポップアップの共通機構。position:relativeなホスト要素内に置かれた
 * <dialog>を、画面内に収まるよう自動配置しつつ非モーダル(.show())で表示する。
 * 外側クリック/Escapeで自動的に閉じ、開いている他のポップアップも同時に閉じる。
 */

const openPopups = new Set<HTMLDialogElement>();
const initializedDialogs = new WeakSet<HTMLDialogElement>();
let listenersInstalled = false;

function ensureGlobalListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  document.body.addEventListener('click', (e) => {
    for (const dialog of [...openPopups]) {
      if (e.composedPath().includes(dialog)) continue;
      closePopup(dialog);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const dialog of [...openPopups]) closePopup(dialog);
  });
}

function positionFloating(dialog: HTMLDialogElement) {
  dialog.style.left = '0';
  dialog.style.right = 'auto';
  dialog.style.top = 'calc(100% + 4px)';
  dialog.style.bottom = 'auto';

  const rect = dialog.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  if (rect.right > viewportWidth) {
    dialog.style.left = 'auto';
    dialog.style.right = '0';
  }
  if (rect.bottom > viewportHeight) {
    dialog.style.top = 'auto';
    dialog.style.bottom = 'calc(100% + 4px)';
  }
}

export function openPopup(dialog: HTMLDialogElement) {
  ensureGlobalListeners();

  if (!initializedDialogs.has(dialog)) {
    initializedDialogs.add(dialog);
    dialog.addEventListener('click', (e) => e.stopPropagation());
  }

  for (const other of [...openPopups]) if (other !== dialog) closePopup(other);

  dialog.show();
  openPopups.add(dialog);
  positionFloating(dialog);
}

export function closePopup(dialog: HTMLDialogElement) {
  if (!dialog.open) return;
  dialog.close();
  openPopups.delete(dialog);
}
