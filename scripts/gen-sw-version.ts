/**
 * docs/sw.js の APP_SHELL に列挙されたファイル群の内容からハッシュを計算し、
 * CACHE_NAME に書き込む。ビルド成果物(app.js等)やstyles.css/manifest.json等が
 * 1バイトでも変わればsw.js自体のバイト列も変わるため、ブラウザの通常のService Worker
 * 更新検知(sw.jsのバイト比較)だけで確実に新しいキャッシュへ切り替わる。
 * `deno task build` の一部として自動実行される(手動でのバージョン文字列管理は不要)。
 */

const SW_PATH = 'docs/sw.js';

const swText = await Deno.readTextFile(SW_PATH);

const shellMatch = swText.match(/const APP_SHELL = \[([\s\S]*?)\];/);
if (!shellMatch) {
  throw new Error(`${SW_PATH} に APP_SHELL 配列が見つかりません`);
}
const entries = [...shellMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

const parts: Uint8Array[] = [];
for (const entry of entries) {
  if (entry.endsWith('/')) continue; // './' は index.html と内容が重複するのでスキップ
  const relative = entry.replace(/^\.\//, '');
  const bytes = await Deno.readFile(`docs/${relative}`);
  parts.push(bytes);
}

const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
const combined = new Uint8Array(totalLength);
let offset = 0;
for (const part of parts) {
  combined.set(part, offset);
  offset += part.length;
}

const digest = await crypto.subtle.digest('SHA-256', combined);
const hashHex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
const cacheName = `sosyoku-${hashHex.slice(0, 10)}`;

const CACHE_NAME_RE = /const CACHE_NAME = '[^']*';/;
if (!CACHE_NAME_RE.test(swText)) {
  throw new Error(`${SW_PATH} に CACHE_NAME の宣言が見つかりません`);
}
const updated = swText.replace(CACHE_NAME_RE, `const CACHE_NAME = '${cacheName}';`);

await Deno.writeTextFile(SW_PATH, updated);
console.log(`CACHE_NAME -> ${cacheName}`);
