/**
 * docs/favicon.svg から各サイズのPWAアイコンPNGをInkscapeで書き出す。
 * デザイン変更時に手動実行する: deno task build:icons
 * (要 Inkscape: https://inkscape.org/ 、PATHに `inkscape` コマンドが通っていること)
 */

const SOURCE_SVG = 'docs/favicon.svg';
const MASKABLE_SAFE_ZONE = 0.8; // アイコン本体をキャンバスの何%に収めるか(残りが安全マージン)
const MASKABLE_BACKGROUND = '#007acc';

const svgText = await Deno.readTextFile(SOURCE_SVG);
const viewBoxMatch = svgText.match(/viewBox="([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)"/);
if (!viewBoxMatch) {
  throw new Error(`${SOURCE_SVG} に viewBox が見つかりません`);
}
const [minX, minY, width, height] = viewBoxMatch.slice(1).map(Number);

async function exportPng(args: string[], label: string) {
  const command = new Deno.Command('inkscape', {
    args: [SOURCE_SVG, '--export-type=png', ...args],
    stdout: 'null',
    stderr: 'null', // InkscapeのGLib/UWP関連の無害な警告を抑制する
  });
  const { success, code } = await command.output();
  if (!success) {
    throw new Error(`inkscape の実行に失敗しました(exit ${code}): ${label}`);
  }
  console.log(label);
}

// 通常アイコン(透過背景、フルブリード)
for (const size of [192, 512]) {
  const outfile = `docs/icons/icon-${size}.png`;
  await exportPng(
    [`--export-filename=${outfile}`, `-w`, String(size), `-h`, String(size)],
    outfile,
  );
}

// マスカブルアイコン(セーフゾーン確保のため縮小して中央配置、背景を不透明で塗りつぶす)
{
  const size = 512;
  const outfile = `docs/icons/icon-maskable-${size}.png`;
  const scaledWidth = width / MASKABLE_SAFE_ZONE;
  const scaledHeight = height / MASKABLE_SAFE_ZONE;
  const padX = (scaledWidth - width) / 2;
  const padY = (scaledHeight - height) / 2;
  const exportArea = `${minX - padX}:${minY - padY}:${minX + width + padX}:${minY + height + padY}`;

  await exportPng(
    [
      `--export-filename=${outfile}`,
      `--export-area=${exportArea}`,
      `--export-background=${MASKABLE_BACKGROUND}`,
      `--export-background-opacity=1`,
      `-w`,
      String(size),
      `-h`,
      String(size),
    ],
    outfile,
  );
}
