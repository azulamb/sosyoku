import { hexToRgb } from './color.ts';
import { createId, type Rect } from './util.ts';

export type LayerType = 'normal' | 'reference';
export type BrushShape = 'round' | 'square';

interface LayerState {
  visible: boolean;
  locked: boolean;
  opacity: number;
}

interface LayerJSONBase extends LayerState {
  id: string;
  name: string;
  file: string;
}

export interface NormalLayerJSON extends LayerJSONBase {
  type: 'normal';
  color: string;
}

export interface ReferenceLayerJSON extends LayerJSONBase {
  type: 'reference';
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayerJSON = NormalLayerJSON | ReferenceLayerJSON;

function createCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
}

async function canvasToPngBytes(canvas: OffscreenCanvas): Promise<Uint8Array<ArrayBuffer>> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

/** RGBAバッファのバイトオフセットiのピクセルを、rgbで不透明に塗る(rgbがnullなら透明にする) */
function writePixel(data: Uint8ClampedArray, i: number, rgb: [number, number, number] | null) {
  if (rgb) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  } else {
    data.fill(0, i, i + 4);
  }
}

export abstract class LayerBase extends EventTarget implements LayerState {
  readonly id: string;
  name: string;
  visible = true;
  locked = false;
  opacity = 1;
  abstract readonly type: LayerType;
  canvas: OffscreenCanvas;

  constructor(id: string | undefined, name: string, width: number, height: number) {
    super();
    this.id = id ?? createId('layer');
    this.name = name;
    this.canvas = createCanvas(width, height);
    // convertToBlob()は一度もgetContext()されていないOffscreenCanvasに対しては失敗するため、
    // 未描画のまっさらなレイヤーでも保存できるよう先にコンテキストを確立しておく
    this.canvas.getContext('2d');
  }

  get ctx(): OffscreenCanvasRenderingContext2D {
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  /** 表示中かつロックされていない(編集操作を受け付ける)状態か */
  get editable(): boolean {
    return this.visible && !this.locked;
  }

  /** レイヤー全体のピクセルを取得する(Undo用の「変更前」スナップショット等に使う) */
  snapshot(): ImageData {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  /** 保存データから表示/ロック/不透明度を復元する */
  restoreState(state: LayerState) {
    this.visible = state.visible;
    this.locked = state.locked;
    this.opacity = state.opacity;
  }

  /** ドキュメントサイズ変更時、左上を基準に透明領域を追加/切り詰め(拡大縮小はしない) */
  resizeCanvas(width: number, height: number) {
    const next = createCanvas(width, height);
    const nctx = next.getContext('2d') as OffscreenCanvasRenderingContext2D;
    nctx.imageSmoothingEnabled = false;
    nctx.drawImage(this.canvas, 0, 0);
    this.canvas = next;
  }

  toPngBytes(): Promise<Uint8Array<ArrayBuffer>> {
    return canvasToPngBytes(this.canvas);
  }

  protected emitChanged() {
    this.dispatchEvent(new CustomEvent('changed'));
  }

  protected baseJSON(file: string): LayerJSONBase {
    return {
      id: this.id,
      name: this.name,
      visible: this.visible,
      locked: this.locked,
      opacity: this.opacity,
      file,
    };
  }
}

export class NormalLayer extends LayerBase {
  readonly type = 'normal' as const;
  color: string;

  constructor(opts: { id?: string; name: string; width: number; height: number; color: string }) {
    super(opts.id, opts.name, opts.width, opts.height);
    this.color = opts.color;
  }

  /** 色を変更し、既存の塗り部分(アルファ形状)をすべて新色に塗り替える */
  setColor(color: string) {
    this.color = color;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
    this.emitChanged();
  }

  /** アンチエイリアスなしのブラシスタンプを1点描画する。eraseがtrueなら透明化する。戻り値は変更範囲 */
  stamp(cx: number, cy: number, radius: number, shape: BrushShape, erase: boolean): Rect | null {
    const r = Math.max(0.5, radius);
    const minX = Math.max(0, Math.floor(cx - r));
    const minY = Math.max(0, Math.floor(cy - r));
    const maxX = Math.min(this.canvas.width - 1, Math.ceil(cx + r));
    const maxY = Math.min(this.canvas.height - 1, Math.ceil(cy + r));
    if (minX > maxX || minY > maxY) return null;

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const ctx = this.ctx;
    const imageData = ctx.getImageData(minX, minY, w, h);
    const rgb = erase ? null : hexToRgb(this.color);
    const r2 = r * r;

    for (let y = 0; y < h; y++) {
      const dy = minY + y + 0.5 - cy;
      for (let x = 0; x < w; x++) {
        const dx = minX + x + 0.5 - cx;
        const inside = shape === 'round' ? dx * dx + dy * dy <= r2 : Math.abs(dx) <= r && Math.abs(dy) <= r;
        if (inside) writePixel(imageData.data, (y * w + x) * 4, rgb);
      }
    }
    ctx.putImageData(imageData, minX, minY);
    return { x: minX, y: minY, w, h };
  }

  /** 単色・完全一致・4近傍のフラッドフィル。塗り済み領域(alpha=255)から未塗り領域(alpha=0)への流し込み */
  floodFill(startX: number, startY: number): Rect | null {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;

    const ctx = this.ctx;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const targetAlpha = data[(sy * width + sx) * 4 + 3];
    if (targetAlpha === 255) return null;

    const rgb = hexToRgb(this.color);
    const visited = new Uint8Array(width * height);
    const stack: number[] = [sx, sy];
    let minX = sx, minY = sy, maxX = sx, maxY = sy;

    while (stack.length > 0) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const idx = y * width + x;
      if (visited[idx]) continue;
      const i = idx * 4;
      if (data[i + 3] !== targetAlpha) continue;
      visited[idx] = 1;
      writePixel(data, i, rgb);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }

    ctx.putImageData(imageData, 0, 0);
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  toJSON(file: string): NormalLayerJSON {
    return { ...this.baseJSON(file), type: 'normal', color: this.color };
  }
}

export class ReferenceLayer extends LayerBase {
  readonly type = 'reference' as const;
  x: number;
  y: number;
  width: number;
  height: number;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  private sourceBitmap: ImageBitmap;

  constructor(
    opts: {
      id?: string;
      name: string;
      image: ImageBitmap;
      docWidth: number;
      docHeight: number;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    },
  ) {
    super(opts.id, opts.name, opts.docWidth, opts.docHeight);
    this.sourceBitmap = opts.image;
    this.naturalWidth = opts.image.width;
    this.naturalHeight = opts.image.height;
    this.width = opts.width ?? opts.image.width;
    this.height = opts.height ?? opts.image.height;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.redraw();
  }

  /** ドキュメント上の配置矩形 */
  get bounds(): Rect {
    return { x: this.x, y: this.y, w: this.width, h: this.height };
  }

  private redraw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.sourceBitmap, this.x, this.y, this.width, this.height);
  }

  /** 移動・拡大縮小(アスペクト比固定)。回転は非対応 */
  setTransform({ x, y, w, h }: Rect) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.redraw();
    this.emitChanged();
  }

  override resizeCanvas(width: number, height: number) {
    super.resizeCanvas(width, height);
    this.redraw();
  }

  /** 保存時は表示用の(ドキュメントサイズに配置済みの)canvasではなく、劣化を避けるため自然解像度の元画像を書き出す */
  override toPngBytes(): Promise<Uint8Array<ArrayBuffer>> {
    const natural = createCanvas(this.naturalWidth, this.naturalHeight);
    const ctx = natural.getContext('2d') as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(this.sourceBitmap, 0, 0);
    return canvasToPngBytes(natural);
  }

  toJSON(file: string): ReferenceLayerJSON {
    return { ...this.baseJSON(file), type: 'reference', x: this.x, y: this.y, width: this.width, height: this.height };
  }
}

export type Layer = NormalLayer | ReferenceLayer;
