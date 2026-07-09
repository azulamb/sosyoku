/*
<status-bar>
ズーム割合・キャンバスサイズ・筆圧を表示するステータスバー。
ズーム割合をダブルクリックすると、スライダー・数値入力・リセットを持つポップアップが開き、
リアルタイムにズームを変更できる(他の場所をクリック/Escapeで閉じる)。
*/
import { t } from '../i18n/index.ts';
import { openPopup } from '../core/popup.ts';

interface StatusBarElement extends HTMLElement {
  setZoom(zoom: number): void;
  setSize(width: number, height: number): void;
  setPressure(pressure: number | null): void;
  setZoomChangeCallback(cb: (zoom: number) => void): void;
}

const ZOOM_MIN_PERCENT = 5;
const ZOOM_MAX_PERCENT = 1600;

((script, init) => {
  const tagname = script.dataset['statusBar'] || 'status-bar';
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
    class extends HTMLElement implements StatusBarElement {
      private zoomEl: HTMLSpanElement;
      private sizeEl: HTMLSpanElement;
      private pressureEl: HTMLSpanElement;
      private currentPressure: number | null = null;
      private currentZoom = 1;
      private onZoomChange: ((zoom: number) => void) | null = null;

      private zoomPopup: HTMLDialogElement;
      private zoomSlider: HTMLInputElement;
      private zoomNumber: HTMLInputElement;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display: flex; align-items: center; gap: 16px; }
          span { white-space: nowrap; }
          .zoom-wrap { position: relative; display: inline-flex; }
          .zoom-value { cursor: pointer; }
          .zoom-value:hover { color: var(--text); }
          .zoom-popup {
            position: absolute; margin: 0; padding: 14px; min-width: 240px;
            border: 1px solid var(--border); border-radius: 8px;
            background: var(--bg-elevated); box-shadow: var(--shadow); color: var(--text); font-size: 12px;
          }
          .zoom-popup:not([open]) { display: none; }
          .zoom-slider-row { display: flex; align-items: center; margin-bottom: 10px; }
          .zoom-slider {
            width: 220px; height: 22px; accent-color: var(--accent); cursor: pointer;
          }
          .zoom-input-row { display: flex; align-items: center; gap: 8px; }
          .zoom-number {
            width: 64px; padding: 5px 6px; border: 1px solid var(--border); border-radius: 4px;
            background: var(--bg); color: inherit; font-size: 12px;
          }
          .zoom-reset {
            margin-left: auto; padding: 5px 10px; border: 1px solid var(--border); border-radius: 4px;
            background: transparent; color: inherit; cursor: pointer; font-size: 12px;
          }
          .zoom-reset:hover { background: var(--bg-sunken); }
        `;

        const zoomWrap = document.createElement('span');
        zoomWrap.className = 'zoom-wrap';

        this.zoomEl = document.createElement('span');
        this.zoomEl.className = 'zoom-value';
        this.zoomEl.title = t('statusbar.zoom.hint');

        this.zoomPopup = document.createElement('dialog');
        this.zoomPopup.className = 'zoom-popup';

        const sliderRow = document.createElement('div');
        sliderRow.className = 'zoom-slider-row';
        this.zoomSlider = document.createElement('input');
        this.zoomSlider.type = 'range';
        this.zoomSlider.className = 'zoom-slider';
        this.zoomSlider.min = String(ZOOM_MIN_PERCENT);
        this.zoomSlider.max = String(ZOOM_MAX_PERCENT);
        sliderRow.appendChild(this.zoomSlider);

        const inputRow = document.createElement('div');
        inputRow.className = 'zoom-input-row';
        this.zoomNumber = document.createElement('input');
        this.zoomNumber.type = 'number';
        this.zoomNumber.className = 'zoom-number';
        this.zoomNumber.min = String(ZOOM_MIN_PERCENT);
        this.zoomNumber.max = String(ZOOM_MAX_PERCENT);
        const percentLabel = document.createElement('span');
        percentLabel.textContent = '%';
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'zoom-reset';
        resetBtn.textContent = t('statusbar.zoom.reset');
        inputRow.appendChild(this.zoomNumber);
        inputRow.appendChild(percentLabel);
        inputRow.appendChild(resetBtn);

        this.zoomPopup.appendChild(sliderRow);
        this.zoomPopup.appendChild(inputRow);

        zoomWrap.appendChild(this.zoomEl);
        zoomWrap.appendChild(this.zoomPopup);

        this.sizeEl = document.createElement('span');
        this.pressureEl = document.createElement('span');
        shadow.appendChild(style);
        shadow.appendChild(zoomWrap);
        shadow.appendChild(this.sizeEl);
        shadow.appendChild(this.pressureEl);

        this.zoomEl.addEventListener('click', () => this.openZoomPopup());
        this.zoomSlider.addEventListener('input', () => {
          this.applyZoomPercent(Number(this.zoomSlider.value));
        });
        this.zoomNumber.addEventListener('input', () => {
          this.applyZoomPercent(Number(this.zoomNumber.value));
        });
        resetBtn.addEventListener('click', () => this.applyZoomPercent(100));

        this.setZoom(1);
        this.setSize(0, 0);
        this.setPressure(null);

        document.addEventListener('locale-changed', () => {
          this.setPressure(this.currentPressure);
          this.zoomEl.title = t('statusbar.zoom.hint');
          resetBtn.textContent = t('statusbar.zoom.reset');
        });
      }

      setZoomChangeCallback(cb: (zoom: number) => void) {
        this.onZoomChange = cb;
      }

      private openZoomPopup() {
        const percent = Math.round(this.currentZoom * 100);
        this.zoomSlider.value = String(percent);
        this.zoomNumber.value = String(percent);
        openPopup(this.zoomPopup);
      }

      private applyZoomPercent(percent: number) {
        const clamped = Math.max(ZOOM_MIN_PERCENT, Math.min(ZOOM_MAX_PERCENT, percent || 100));
        this.zoomSlider.value = String(clamped);
        this.zoomNumber.value = String(clamped);
        this.onZoomChange?.(clamped / 100);
      }

      setZoom(zoom: number) {
        this.currentZoom = zoom;
        this.zoomEl.textContent = `${Math.round(zoom * 100)}%`;
      }

      setSize(width: number, height: number) {
        this.sizeEl.textContent = `${width} × ${height}px`;
      }

      setPressure(pressure: number | null) {
        this.currentPressure = pressure;
        const label = t('statusbar.pressure');
        this.pressureEl.textContent = pressure === null ? `${label}: -` : `${label}: ${Math.round(pressure * 100)}%`;
      }
    },
  );
});
