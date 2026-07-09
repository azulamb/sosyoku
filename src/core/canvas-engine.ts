import type { SosyokuDocument } from './document.ts';
import { hexToRgba } from './color.ts';

export class CanvasEngine {
  private target: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  gridVisible = false;

  constructor(target: HTMLCanvasElement) {
    this.target = target;
    const ctx = target.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  resize(width: number, height: number) {
    if (this.target.width !== width) this.target.width = width;
    if (this.target.height !== height) this.target.height = height;
  }

  render(doc: SosyokuDocument) {
    const { ctx } = this;
    this.resize(doc.width, doc.height);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, doc.width, doc.height);
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const layer = doc.layers[i];
      if (!layer.visible) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.globalAlpha = 1;
    if (this.gridVisible) this.renderGrid(doc);
  }

  private renderGrid(doc: SosyokuDocument) {
    const { ctx } = this;
    for (const grid of doc.grids) {
      if (grid.x <= 0 || grid.y <= 0) continue;
      ctx.strokeStyle = grid.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= doc.width; x += grid.x) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, doc.height);
      }
      for (let y = 0; y <= doc.height; y += grid.y) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(doc.width, y + 0.5);
      }
      ctx.stroke();
    }
  }
}

/**
 * 現在表示状態(visible)のレイヤーのみを合成してPNG化する(グリッドは含めない)。
 * 背景色はアルファ値込みで実際に合成する(市松模様はあくまで編集画面の表示上のみなので含めない)。
 */
export async function exportFlattenedPng(doc: SosyokuDocument): Promise<Blob> {
  const canvas = new OffscreenCanvas(doc.width, doc.height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  const { r, g, b, a } = hexToRgba(doc.backgroundColor);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
  ctx.fillRect(0, 0, doc.width, doc.height);
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i];
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(layer.canvas, 0, 0);
  }
  return await canvas.convertToBlob({ type: 'image/png' });
}
