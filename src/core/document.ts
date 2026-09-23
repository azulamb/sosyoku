import type { Layer } from './layer.ts';
import { History } from './history.ts';
import { clamp, createId } from './util.ts';

export interface GridSetting {
  id: string;
  x: number;
  y: number;
  color: string;
}

export function nextGridId(): string {
  return createId('grid');
}

export const MAX_CANVAS_SIZE = 4096;

/** ドキュメントの既定背景色(完全不透明の白)。#RRGGBBAA形式で保持する */
export const DEFAULT_BACKGROUND_COLOR = '#ffffffff';

function clampCanvasSize(size: number): number {
  return clamp(Math.round(size), 1, MAX_CANVAS_SIZE);
}

export class SosyokuDocument extends EventTarget {
  readonly id: string;
  /** 空文字の場合、表示側で「無題」として扱う */
  title: string;
  width: number;
  height: number;
  /** layers[0] が最前面 */
  layers: Layer[] = [];
  grids: GridSetting[] = [];
  /** キャンバスの背景色(#RRGGBBAA)。アルファ値を持つ場合、表示上は市松模様に重ねて示すが、
   * エクスポート時にはこの色をアルファ込みでレイヤーの下に合成する。 */
  backgroundColor: string;
  activeLayerId: string | null = null;
  dirty = false;
  readonly history = new History();

  constructor(init: { id?: string; title?: string; width: number; height: number; backgroundColor?: string }) {
    super();
    this.id = init.id ?? createId('doc');
    this.title = init.title ?? '';
    this.width = Math.min(MAX_CANVAS_SIZE, init.width);
    this.height = Math.min(MAX_CANVAS_SIZE, init.height);
    this.backgroundColor = init.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  }

  get activeLayer(): Layer | null {
    return this.layers.find((l) => l.id === this.activeLayerId) ?? null;
  }

  /** indexを省略すると最前面に追加する */
  addLayer(layer: Layer, index = 0) {
    this.layers.splice(index, 0, layer);
    this.activeLayerId = layer.id;
    this.notify('layers-changed');
  }

  removeLayer(id: string) {
    const index = this.layers.findIndex((l) => l.id === id);
    if (index === -1) return;
    this.layers.splice(index, 1);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layers[Math.min(index, this.layers.length - 1)]?.id ?? null;
    }
    this.notify('layers-changed');
  }

  moveLayer(id: string, toIndex: number) {
    const fromIndex = this.layers.findIndex((l) => l.id === id);
    if (fromIndex === -1) return;
    const [layer] = this.layers.splice(fromIndex, 1);
    this.layers.splice(clamp(toIndex, 0, this.layers.length), 0, layer);
    this.notify('layers-changed');
  }

  /** サイズ変更。全レイヤーへ左上基準で透明領域を追加/切り詰め(拡大縮小はしない) */
  resize(width: number, height: number) {
    const w = clampCanvasSize(width);
    const h = clampCanvasSize(height);
    for (const layer of this.layers) layer.resizeCanvas(w, h);
    this.width = w;
    this.height = h;
    this.notify('document-changed');
  }

  addGrid(grid: Omit<GridSetting, 'id'>) {
    this.grids.push({ id: nextGridId(), ...grid });
    this.notify('grids-changed');
  }

  removeGrid(id: string) {
    this.grids = this.grids.filter((g) => g.id !== id);
    this.notify('grids-changed');
  }

  markDirty() {
    this.dirty = true;
  }

  private notify(type: 'layers-changed' | 'document-changed' | 'grids-changed') {
    this.markDirty();
    this.dispatchEvent(new CustomEvent(type));
  }
}
