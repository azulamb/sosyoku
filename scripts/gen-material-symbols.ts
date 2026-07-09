/**
 * Material Symbols Outlined から、アプリで使うアイコンだけを含む自前ホスト用woff2を生成する。
 * Google Fontsのサーバー側サブセット機能を1回だけ利用し、結果のwoff2ファイルをリポジトリにコミットして
 * 以降は完全に自己完結(実行時にGoogle CDNへは一切アクセスしない)。
 * アイコンを追加/削除する場合は ICON_NAMES を編集して再実行する: deno run -A scripts/gen-material-symbols.ts
 */

// アルファベット順である必要がある(Google Fonts側の制約)
const ICON_NAMES = [
  'add',
  'circle',
  'close',
  'crop_free',
  'delete',
  'drag_indicator',
  'draw',
  'format_color_fill',
  'grid_on',
  'ink_eraser',
  'lock',
  'lock_open',
  'more_vert',
  'open_with',
  'redo',
  'save',
  'square',
  'undo',
  'visibility',
  'visibility_off',
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const OUTPUT_PATH = 'docs/fonts/material-symbols-outlined-subset.woff2';

const cssUrl =
  `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&icon_names=${
    ICON_NAMES.join(',')
  }&display=block`;

const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': USER_AGENT } });
const css = await cssRes.text();
const fontUrlMatch = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/);
if (!fontUrlMatch) {
  throw new Error(`フォントURLの取得に失敗しました。レスポンス:\n${css}`);
}

const fontRes = await fetch(fontUrlMatch[1], { headers: { 'User-Agent': USER_AGENT } });
const fontBytes = new Uint8Array(await fontRes.arrayBuffer());
await Deno.mkdir('docs/fonts', { recursive: true });
await Deno.writeFile(OUTPUT_PATH, fontBytes);
console.log(`${OUTPUT_PATH} (${fontBytes.length} bytes, ${ICON_NAMES.length} icons)`);
