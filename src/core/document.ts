import type { Layer } from './layer.ts';
import { History } from './history.ts';

export interface GridSetting {
  id: string;
  x: number;
  y: number;
  color: string;
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

export function nextGridId(): string {
  return nextId('grid');
}

export const MAX_CANVAS_SIZE = 4096;

export class SosyokuDocument extends EventTarget {
  readonly id: string;
  title: string;
  width: number;
  height: number;
  layers: Layer[] = [];
  grids: GridSetting[] = [];
  activeLayerId: string | null = null;
  dirty = false;
  readonly history = new History();

  constructor(init: { id?: string; title?: string; width: number; height: number }) {
    super();
    this.id = init.id ?? nextId('doc');
    this.title = init.title ?? '無題';
    this.width = Math.min(MAX_CANVAS_SIZE, init.width);
    this.height = Math.min(MAX_CANVAS_SIZE, init.height);
  }

  get activeLayer(): Layer | null {
    return this.layers.find((l) => l.id === this.activeLayerId) ?? null;
  }

  /** layers[0] が最前面。indexを省略すると最前面に追加する */
  addLayer(layer: Layer, index = 0) {
    this.layers.splice(index, 0, layer);
    this.activeLayerId = layer.id;
    this.markDirty();
    this.dispatchEvent(new CustomEvent('layers-changed'));
  }

  removeLayer(id: string) {
    const index = this.layers.findIndex((l) => l.id === id);
    if (index === -1) return;
    this.layers.splice(index, 1);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layers[Math.min(index, this.layers.length - 1)]?.id ?? null;
    }
    this.markDirty();
    this.dispatchEvent(new CustomEvent('layers-changed'));
  }

  moveLayer(id: string, toIndex: number) {
    const fromIndex = this.layers.findIndex((l) => l.id === id);
    if (fromIndex === -1) return;
    const [layer] = this.layers.splice(fromIndex, 1);
    this.layers.splice(Math.max(0, Math.min(toIndex, this.layers.length)), 0, layer);
    this.markDirty();
    this.dispatchEvent(new CustomEvent('layers-changed'));
  }

  /** サイズ変更。全レイヤーへ左上基準で透明領域を追加/切り詰め(拡大縮小はしない) */
  resize(width: number, height: number) {
    const w = Math.max(1, Math.min(MAX_CANVAS_SIZE, Math.round(width)));
    const h = Math.max(1, Math.min(MAX_CANVAS_SIZE, Math.round(height)));
    for (const layer of this.layers) layer.resizeCanvas(w, h);
    this.width = w;
    this.height = h;
    this.markDirty();
    this.dispatchEvent(new CustomEvent('document-changed'));
  }

  addGrid(grid: Omit<GridSetting, 'id'>) {
    this.grids.push({ id: nextGridId(), ...grid });
    this.markDirty();
    this.dispatchEvent(new CustomEvent('grids-changed'));
  }

  removeGrid(id: string) {
    this.grids = this.grids.filter((g) => g.id !== id);
    this.markDirty();
    this.dispatchEvent(new CustomEvent('grids-changed'));
  }

  markDirty() {
    this.dirty = true;
  }
}
