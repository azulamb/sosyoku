/**
 * Material Symbols Outlined(自前ホスト: docs/fonts/material-symbols-outlined-subset.woff2)を
 * 使った単色アイコン要素を作る。@font-faceはdocs/styles.cssで一度だけ登録されており、
 * Shadow DOM内からもドキュメント全体で共有される。
 */
export function createIcon(name: string, sizePx = 18): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = name;
  span.setAttribute('aria-hidden', 'true');
  span.style.cssText = [
    `font-family:'Material Symbols Outlined'`,
    `font-size:${sizePx}px`,
    `line-height:1`,
    `display:inline-block`,
    `-webkit-font-feature-settings:'liga'`,
    `font-feature-settings:'liga'`,
    `user-select:none`,
  ].join(';');
  return span;
}
