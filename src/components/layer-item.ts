/*
<layer-item>
レイヤー1件を表す行コンポーネント。通常レイヤー(色チップ)と参照レイヤー(サムネイル)の両方に対応する。
表示/非表示・ロック・名前(ダブルクリックで変更)・透過度・並び替え用ハンドルを持つ。
*/
import type { SosyokuDocument } from '../core/document.ts';
import type { Layer } from '../core/layer.ts';
import { showBlockingDialog } from '../core/dialog.ts';
import { t } from '../i18n/index.ts';
import { createIcon } from '../core/icon.ts';

interface ColorPickerModalElement extends HTMLElement {
  open(currentColor: string): Promise<string | null>;
}

interface LayerItemElement extends HTMLElement {
  bind(layer: Layer, doc: SosyokuDocument): void;
}

((script, init) => {
  const tagname = script.dataset['layerItem'] || 'layer-item';
  if (customElements.get(tagname)) {
    return;
  }
  if (document.readyState !== 'loading') {
    return init(script, tagname);
  }
  document.addEventListener('DOMContentLoaded', () => {
    init(script, tagname);
  });
})(document.currentScript as HTMLScriptElement, (_script: HTMLScriptElement, tagname: string) => {
  customElements.define(
    tagname,
    class extends HTMLElement implements LayerItemElement {
      private layer: Layer | null = null;
      private doc: SosyokuDocument | null = null;

      private root: HTMLDivElement;
      private handle: HTMLDivElement;
      private visibleBtn: HTMLButtonElement;
      private visibleIcon: HTMLSpanElement;
      private lockBtn: HTMLButtonElement;
      private lockIcon: HTMLSpanElement;
      private swatch: HTMLButtonElement;
      private thumbCanvas: HTMLCanvasElement;
      private nameEl: HTMLSpanElement;
      private opacityInput: HTMLInputElement;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display:block; }
          .row {
            display:flex; align-items:center; gap:6px; padding:6px 8px;
            border-bottom:1px solid var(--border); cursor:pointer; touch-action:pan-y;
          }
          .row.active { background: color-mix(in srgb, var(--accent) 18%, transparent); }
          .handle { cursor: grab; opacity:.5; padding:2px; touch-action:none; user-select:none; }
          .handle:active { cursor: grabbing; }
          button.icon {
            width:24px; height:24px; border:none; background:transparent; color:inherit;
            font-size:14px; cursor:pointer; border-radius:4px; flex:none;
          }
          button.icon:hover { background: var(--bg-sunken); }
          button.icon.off { opacity:.35; }
          .swatch {
            width:24px; height:24px; border-radius:4px; border:1px solid var(--border);
            flex:none; padding:0; cursor:pointer; overflow:hidden;
          }
          .swatch canvas { width:100%; height:100%; display:block; image-rendering:pixelated; }
          .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
          .opacity { width:56px; flex:none; }
        `;

        this.root = document.createElement('div');
        this.root.className = 'row';

        this.handle = document.createElement('div');
        this.handle.className = 'handle';
        this.handle.appendChild(createIcon('drag_indicator', 16));

        this.visibleBtn = document.createElement('button');
        this.visibleBtn.className = 'icon';
        this.visibleBtn.type = 'button';
        this.visibleBtn.title = t('layer.visibility');
        this.visibleIcon = createIcon('visibility', 16);
        this.visibleBtn.appendChild(this.visibleIcon);

        this.lockBtn = document.createElement('button');
        this.lockBtn.className = 'icon';
        this.lockBtn.type = 'button';
        this.lockBtn.title = t('layer.lock');
        this.lockIcon = createIcon('lock_open', 16);
        this.lockBtn.appendChild(this.lockIcon);

        this.swatch = document.createElement('button');
        this.swatch.className = 'swatch';
        this.swatch.type = 'button';
        this.thumbCanvas = document.createElement('canvas');
        this.thumbCanvas.width = 24;
        this.thumbCanvas.height = 24;
        this.swatch.appendChild(this.thumbCanvas);

        this.nameEl = document.createElement('span');
        this.nameEl.className = 'name';

        this.opacityInput = document.createElement('input');
        this.opacityInput.className = 'opacity';
        this.opacityInput.type = 'range';
        this.opacityInput.min = '0';
        this.opacityInput.max = '100';

        this.root.appendChild(this.handle);
        this.root.appendChild(this.visibleBtn);
        this.root.appendChild(this.lockBtn);
        this.root.appendChild(this.swatch);
        this.root.appendChild(this.nameEl);
        this.root.appendChild(this.opacityInput);
        shadow.appendChild(style);
        shadow.appendChild(this.root);

        this.root.addEventListener('click', (e) => {
          if (e.target === this.visibleBtn || e.target === this.lockBtn || e.target === this.opacityInput) return;
          this.selectLayer();
        });
        this.visibleBtn.addEventListener('click', () => this.toggleVisible());
        this.lockBtn.addEventListener('click', () => this.toggleLock());
        this.swatch.addEventListener('click', () => this.openColorPicker());
        this.nameEl.addEventListener('dblclick', () => this.openRename());
        this.opacityInput.addEventListener('input', () => this.changeOpacity());
        this.handle.addEventListener('pointerdown', (e) => this.startReorder(e));
      }

      bind(layer: Layer, doc: SosyokuDocument) {
        this.layer = layer;
        this.doc = doc;
        this.refresh();
      }

      refresh() {
        if (!this.layer || !this.doc) return;
        const layer = this.layer;
        this.visibleIcon.textContent = layer.visible ? 'visibility' : 'visibility_off';
        this.visibleBtn.classList.toggle('off', !layer.visible);
        this.lockIcon.textContent = layer.locked ? 'lock' : 'lock_open';
        this.nameEl.textContent = layer.name;
        this.opacityInput.value = String(Math.round(layer.opacity * 100));
        this.root.classList.toggle('active', this.doc.activeLayerId === layer.id);
        this.redrawThumb();
      }

      private redrawThumb() {
        if (!this.layer) return;
        const ctx = this.thumbCanvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = this.layer.type === 'reference';
        ctx.clearRect(0, 0, 24, 24);
        if (this.layer.type === 'normal') {
          ctx.fillStyle = this.layer.color;
          ctx.fillRect(0, 0, 24, 24);
        } else {
          const { x, y, width, height } = this.layer;
          ctx.drawImage(this.layer.canvas, x, y, width, height, 0, 0, 24, 24);
        }
      }

      private selectLayer() {
        if (!this.doc || !this.layer) return;
        this.doc.activeLayerId = this.layer.id;
        this.dispatchEvent(
          new CustomEvent('layer-selected', { detail: { id: this.layer.id }, bubbles: true, composed: true }),
        );
      }

      private toggleVisible() {
        if (!this.layer || !this.doc) return;
        this.layer.visible = !this.layer.visible;
        this.doc.markDirty();
        this.refresh();
        this.notifyChanged();
      }

      private toggleLock() {
        if (!this.layer) return;
        this.layer.locked = !this.layer.locked;
        this.refresh();
      }

      private changeOpacity() {
        if (!this.layer || !this.doc) return;
        this.layer.opacity = Number(this.opacityInput.value) / 100;
        this.doc.markDirty();
        this.notifyChanged();
      }

      private async openColorPicker() {
        if (!this.layer || this.layer.type !== 'normal') return;
        const picker = document.querySelector('color-picker-modal') as ColorPickerModalElement | null;
        if (!picker) return;
        const color = await picker.open(this.layer.color);
        if (color && this.layer.type === 'normal') {
          this.layer.setColor(color);
          this.doc?.markDirty();
          this.refresh();
          this.notifyChanged();
        }
      }

      private async openRename() {
        if (!this.layer) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.layer.name;
        input.style.cssText = 'width:100%;padding:8px;font-size:14px;box-sizing:border-box;';
        const result = await showBlockingDialog({
          title: t('rename.layer.title'),
          content: input,
          saveLabel: t('dialog.change'),
        });
        if (result === 'save' && input.value.trim()) {
          this.layer.name = input.value.trim();
          this.refresh();
          this.notifyChanged();
        }
      }

      private startReorder(e: PointerEvent) {
        if (!this.layer) return;
        e.preventDefault();
        const layerId = this.layer.id;
        const parent = this.parentElement;
        if (!parent) return;
        this.handle.setPointerCapture(e.pointerId);
        this.root.style.opacity = '0.6';

        const onMove = (_ev: PointerEvent) => {
          // ドラッグ中の視覚フィードバックのみ。並び替え自体はpointerup時に確定する。
        };
        const onUp = (ev: PointerEvent) => {
          this.handle.releasePointerCapture(ev.pointerId);
          globalThis.removeEventListener('pointermove', onMove);
          globalThis.removeEventListener('pointerup', onUp);
          this.root.style.opacity = '';

          const siblings = [...parent.children] as HTMLElement[];
          let toIndex = siblings.length - 1;
          for (let i = 0; i < siblings.length; i++) {
            const rect = siblings[i].getBoundingClientRect();
            if (ev.clientY < rect.top + rect.height / 2) {
              toIndex = i;
              break;
            }
          }
          this.dispatchEvent(
            new CustomEvent('layer-reorder', { detail: { id: layerId, toIndex }, bubbles: true, composed: true }),
          );
        };
        globalThis.addEventListener('pointermove', onMove);
        globalThis.addEventListener('pointerup', onUp);
      }

      private notifyChanged() {
        this.dispatchEvent(new CustomEvent('layer-changed', { bubbles: true, composed: true }));
      }
    },
  );
});
