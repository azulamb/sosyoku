import { hexToRgb } from './color.ts';

export type LayerType = 'normal' | 'reference';
export type BrushShape = 'round' | 'square';

interface LayerJSONBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
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

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `layer-${Date.now().toString(36)}-${sequence}`;
}

export abstract class LayerBase extends EventTarget {
  readonly id: string;
  name: string;
  visible = true;
  locked = false;
  opacity = 1;
  abstract readonly type: LayerType;
  canvas: OffscreenCanvas;

  constructor(id: string | undefined, name: string, width: number, height: number) {
    super();
    this.id = id ?? nextId();
    this.name = name;
    this.canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
    // convertToBlob()は一度もgetContext()されていないOffscreenCanvasに対しては失敗するため、
    // 未描画のまっさらなレイヤーでも保存できるよう先にコンテキストを確立しておく
    this.canvas.getContext('2d');
  }

  get ctx(): OffscreenCanvasRenderingContext2D {
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  /** ドキュメントサイズ変更時、左上を基準に透明領域を追加/切り詰め(拡大縮小はしない) */
  resizeCanvas(width: number, height: number) {
    const next = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
    const nctx = next.getContext('2d') as OffscreenCanvasRenderingContext2D;
    nctx.imageSmoothingEnabled = false;
    nctx.drawImage(this.canvas, 0, 0);
    this.canvas = next;
  }

  async toPngBytes(): Promise<Uint8Array<ArrayBuffer>> {
    const blob = await this.canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
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

  /** アンチエイリアスなしのブラシスタンプを1点描画する。eraseがtrueなら透明化する */
  stamp(
    cx: number,
    cy: number,
    radius: number,
    shape: BrushShape,
    erase: boolean,
  ): { x: number; y: number; w: number; h: number } | null {
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
    const data = imageData.data;
    const [cr, cg, cb] = hexToRgb(this.color);
    const r2 = r * r;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = minX + x;
        const py = minY + y;
        let inside: boolean;
        if (shape === 'round') {
          const dx = px + 0.5 - cx;
          const dy = py + 0.5 - cy;
          inside = dx * dx + dy * dy <= r2;
        } else {
          inside = Math.abs(px + 0.5 - cx) <= r && Math.abs(py + 0.5 - cy) <= r;
        }
        if (!inside) continue;
        const i = (y * w + x) * 4;
        if (erase) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        } else {
          data[i] = cr;
          data[i + 1] = cg;
          data[i + 2] = cb;
          data[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(imageData, minX, minY);
    return { x: minX, y: minY, w, h };
  }

  /** 単色・完全一致・4近傍のフラッドフィル。塗り済み領域(alpha=255)から未塗り領域(alpha=0)への流し込み */
  floodFill(startX: number, startY: number): { x: number; y: number; w: number; h: number } | null {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;

    const ctx = this.ctx;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const startIndex = (sy * width + sx) * 4;
    const targetAlpha = data[startIndex + 3];
    if (targetAlpha === 255) return null;

    const [cr, cg, cb] = hexToRgb(this.color);
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
      data[i] = cr;
      data[i + 1] = cg;
      data[i + 2] = cb;
      data[i + 3] = 255;
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

  private redraw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.sourceBitmap, this.x, this.y, this.width, this.height);
  }

  /** 移動・拡大縮小(アスペクト比固定)。回転は非対応 */
  setTransform(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.redraw();
    this.emitChanged();
  }

  override resizeCanvas(width: number, height: number) {
    super.resizeCanvas(width, height);
    this.redraw();
  }

  /** 保存時は表示用の(ドキュメントサイズに配置済みの)canvasではなく、劣化を避けるため自然解像度の元画像を書き出す */
  override async toPngBytes(): Promise<Uint8Array<ArrayBuffer>> {
    const natural = new OffscreenCanvas(this.naturalWidth, this.naturalHeight);
    const ctx = natural.getContext('2d') as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(this.sourceBitmap, 0, 0);
    const blob = await natural.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  }

  toJSON(file: string): ReferenceLayerJSON {
    return { ...this.baseJSON(file), type: 'reference', x: this.x, y: this.y, width: this.width, height: this.height };
  }
}

export type Layer = NormalLayer | ReferenceLayer;
