/** DOM 操作の小さな共通ヘルパー */

/** Shadow DOM の外まで届く(bubbles + composed)CustomEvent を発火する */
export function emit<T>(target: EventTarget, type: string, detail?: T): void {
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

/** CustomEvent の detail を型付きで受け取るリスナーを登録する */
export function listen<T>(target: EventTarget, type: string, handler: (detail: T) => void): void {
  target.addEventListener(type, (e) => handler((e as CustomEvent<T>).detail));
}

/** テキスト入力中(ショートカットを発火させるべきでない要素)かどうか */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' ||
    target.isContentEditable;
}

/** type="button" のボタンを作る */
export function createButton(options: { text?: string; className?: string; title?: string } = {}): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  if (options.text !== undefined) button.textContent = options.text;
  if (options.className) button.className = options.className;
  if (options.title) button.title = options.title;
  return button;
}
