/*
<canvas-desk>
スクロール可能なビューポート。スロットされたキャンバス要素(drawing-canvas)をホストし、
子から発火される 'pan-zoom' イベント(2本指操作)を受けてスクロール位置とズーム倍率を更新する。
拡大縮小時はスクロールバーで移動できる。Ctrl+ホイールでも拡大縮小できる(方向は設定で反転可能)。
*/
import { settingsStore } from '../core/settings-store.ts';

interface CanvasDeskElement extends HTMLElement {
  readonly zoom: number;
  setZoom(zoom: number): void;
}

((script, init) => {
  const tagname = script.dataset['canvasDesk'] || 'canvas-desk';
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
    class extends HTMLElement implements CanvasDeskElement {
      private zoomValue = 1;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display: block; overflow: auto; position: relative; }
          .surface { display: inline-block; padding: 64px; }
          ::slotted(*) { transform-origin: top left; display: block; }
        `;
        const surface = document.createElement('div');
        surface.className = 'surface';
        surface.appendChild(document.createElement('slot'));
        shadow.appendChild(style);
        shadow.appendChild(surface);

        this.addEventListener('pan-zoom', this.onPanZoom as EventListener);
        this.addEventListener('wheel', this.onWheel, { passive: false });
      }

      get zoom(): number {
        return this.zoomValue;
      }

      setZoom(zoom: number) {
        this.zoomValue = Math.max(0.05, Math.min(16, zoom));
        this.applyZoom();
        this.dispatchEvent(
          new CustomEvent('zoom-changed', { detail: { zoom: this.zoomValue }, bubbles: true, composed: true }),
        );
      }

      private applyZoom() {
        const target = this.firstElementChild as HTMLElement | null;
        if (target) target.style.transform = `scale(${this.zoomValue})`;
      }

      private onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const reversed = settingsStore.get().zoomWheelReversed;
        const delta = reversed ? e.deltaY : -e.deltaY;
        const factor = Math.exp(delta * 0.0015);
        this.setZoom(this.zoomValue * factor);
      };

      private onPanZoom = (e: Event) => {
        const detail = (e as CustomEvent).detail as { dx: number; dy: number; scaleFactor: number };
        this.scrollLeft -= detail.dx;
        this.scrollTop -= detail.dy;
        if (detail.scaleFactor && Math.abs(detail.scaleFactor - 1) > 0.001) {
          this.setZoom(this.zoomValue * detail.scaleFactor);
        }
      };
    },
  );
});
