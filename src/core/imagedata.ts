/** 大きいImageDataから矩形領域だけを切り出す(getImageDataで直接読めない「変更前」の全体スナップショットから使う) */
export function cropImageData(full: ImageData, x: number, y: number, w: number, h: number): ImageData {
  const out = new ImageData(w, h);
  for (let row = 0; row < h; row++) {
    const srcOffset = ((y + row) * full.width + x) * 4;
    const dstOffset = row * w * 4;
    out.data.set(full.data.subarray(srcOffset, srcOffset + w * 4), dstOffset);
  }
  return out;
}
