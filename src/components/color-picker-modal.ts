/* <color-picker-modal> Detailed HSV and HEX color editor with live preview. */
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from '../core/color.ts';
import { showBlockingDialog } from '../core/dialog.ts';
import { settingsStore } from '../core/settings-store.ts';
import { t } from '../i18n/index.ts';

export interface ColorPickerModalElement extends HTMLElement {
  open(currentColor: string, onPreview?: (color: string) => void): Promise<string | null>;
}

((script, init) => {
  const tagname = script.dataset['colorPickerModal'] || 'color-picker-modal';
  if (customElements.get(tagname)) return;
  if (document.readyState !== 'loading') return init(script, tagname);
  document.addEventListener('DOMContentLoaded', () => init(script, tagname));
})(document.currentScript as HTMLScriptElement, (_script: HTMLScriptElement, tagname: string) => {
  customElements.define(
    tagname,
    class extends HTMLElement implements ColorPickerModalElement {
      async open(currentColor: string, onPreview?: (color: string) => void): Promise<string | null> {
        const [red, green, blue] = hexToRgb(currentColor);
        let { h, s, v } = rgbToHsv(red, green, blue);
        let selected = rgbToHex(red, green, blue);

        const content = document.createElement('div');
        content.style.cssText = 'width:min(420px,100%);';
        const style = document.createElement('style');
        style.textContent = `
          .color-hue { appearance:none; width:100%; height:18px; margin:0; background:transparent; }
          .color-hue::-webkit-slider-runnable-track {
            height:12px; border-radius:3px;
            background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);
          }
          .color-hue::-webkit-slider-thumb {
            appearance:none; width:16px; height:16px; margin-top:-2px; border-radius:50%;
            border:2px solid #fff; background:#222; box-shadow:0 0 0 1px #000;
          }
          .color-hue::-moz-range-track {
            height:12px; border-radius:3px;
            background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);
          }
          .color-hue::-moz-range-thumb {
            width:14px; height:14px; border-radius:50%;
            border:2px solid #fff; background:#222; box-shadow:0 0 0 1px #000;
          }
        `;
        content.appendChild(style);

        const field = document.createElement('div');
        field.tabIndex = 0;
        field.setAttribute('role', 'application');
        field.setAttribute('aria-label', t('colorpicker.saturationValue'));
        field.style.cssText =
          'position:relative;width:100%;aspect-ratio:2/1;touch-action:none;cursor:crosshair;border:1px solid var(--border);border-radius:4px;overflow:hidden;';

        const marker = document.createElement('div');
        marker.style.cssText =
          'position:absolute;width:14px;height:14px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #000,0 1px 3px #0008;transform:translate(-50%,-50%);pointer-events:none;';
        field.appendChild(marker);

        const hueRow = document.createElement('label');
        hueRow.style.cssText =
          'display:grid;grid-template-columns:42px 1fr 48px;align-items:center;gap:8px;margin-top:14px;';
        const hueLabel = document.createElement('span');
        hueLabel.textContent = t('colorpicker.hue');
        hueLabel.style.color = 'var(--text-muted)';
        const hueInput = document.createElement('input');
        hueInput.type = 'range';
        hueInput.className = 'color-hue';
        hueInput.min = '0';
        hueInput.max = '359';
        hueInput.value = String(Math.round(h));
        const hueValue = document.createElement('span');
        hueValue.style.cssText = 'font-variant-numeric:tabular-nums;text-align:right;';
        hueRow.appendChild(hueLabel);
        hueRow.appendChild(hueInput);
        hueRow.appendChild(hueValue);

        const valueRow = document.createElement('div');
        valueRow.style.cssText =
          'display:grid;grid-template-columns:48px 1fr;align-items:center;gap:10px;margin-top:14px;';
        const preview = document.createElement('div');
        preview.style.cssText = 'width:48px;height:36px;border:1px solid var(--border);border-radius:4px;';
        const palette = document.createElement('div');
        palette.style.cssText =
          'display:grid;grid-template-columns:repeat(auto-fill,24px);justify-content:start;gap:5px;min-width:0;';
        const paletteButtons: HTMLButtonElement[] = [];
        for (const color of settingsStore.get().palette) {
          const swatch = document.createElement('button');
          swatch.type = 'button';
          swatch.dataset.color = color;
          swatch.title = color;
          swatch.setAttribute('aria-label', color);
          swatch.style.cssText =
            `width:24px;height:24px;padding:0;border:1px solid var(--border);border-radius:4px;background:${color};cursor:pointer;`;
          swatch.addEventListener('click', () => {
            const [r, g, b] = hexToRgb(color);
            ({ h, s, v } = rgbToHsv(r, g, b));
            updateUi(true);
          });
          paletteButtons.push(swatch);
          palette.appendChild(swatch);
        }
        valueRow.appendChild(preview);
        valueRow.appendChild(palette);

        const hexWrap = document.createElement('label');
        hexWrap.style.cssText =
          'display:grid;grid-template-columns:48px 1fr;align-items:center;gap:10px;margin-top:12px;';
        const hexLabel = document.createElement('span');
        hexLabel.textContent = 'HEX';
        hexLabel.style.color = 'var(--text-muted)';
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.maxLength = 7;
        hexInput.spellcheck = false;
        hexInput.style.cssText =
          'width:100%;padding:7px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:inherit;font-family:monospace;';
        hexWrap.appendChild(hexLabel);
        hexWrap.appendChild(hexInput);

        const updateUi = (notify: boolean) => {
          const [r, g, b] = hsvToRgb(h, s, v);
          selected = rgbToHex(r, g, b);
          field.style.background =
            `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${h} 100% 50%))`;
          marker.style.left = `${s * 100}%`;
          marker.style.top = `${(1 - v) * 100}%`;
          hueInput.value = String(Math.round(h));
          hueValue.textContent = `${Math.round(h)}°`;
          preview.style.background = selected;
          hexInput.value = selected.toUpperCase();
          for (const swatch of paletteButtons) {
            const active = swatch.dataset.color?.toLowerCase() === selected.toLowerCase();
            swatch.style.outline = active ? '2px solid var(--accent)' : 'none';
            swatch.style.outlineOffset = active ? '1px' : '0';
          }
          if (notify) onPreview?.(selected);
        };

        const updateFromPointer = (event: PointerEvent) => {
          const rect = field.getBoundingClientRect();
          s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
          v = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
          updateUi(true);
        };
        field.addEventListener('pointerdown', (event) => {
          field.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        });
        field.addEventListener('pointermove', (event) => {
          if (field.hasPointerCapture(event.pointerId)) updateFromPointer(event);
        });
        field.addEventListener('pointerup', (event) => {
          if (field.hasPointerCapture(event.pointerId)) field.releasePointerCapture(event.pointerId);
        });
        field.addEventListener('keydown', (event) => {
          const step = event.shiftKey ? 0.05 : 0.01;
          if (event.key === 'ArrowLeft') s -= step;
          else if (event.key === 'ArrowRight') s += step;
          else if (event.key === 'ArrowUp') v += step;
          else if (event.key === 'ArrowDown') v -= step;
          else return;
          event.preventDefault();
          s = Math.max(0, Math.min(1, s));
          v = Math.max(0, Math.min(1, v));
          updateUi(true);
        });
        hueInput.addEventListener('input', () => {
          h = Number(hueInput.value);
          updateUi(true);
        });
        hexInput.addEventListener('input', () => {
          const value = hexInput.value.trim();
          if (!/^#[0-9a-f]{6}$/i.test(value)) return;
          const [r, g, b] = hexToRgb(value);
          ({ h, s, v } = rgbToHsv(r, g, b));
          updateUi(true);
        });

        content.appendChild(field);
        content.appendChild(hueRow);
        content.appendChild(valueRow);
        content.appendChild(hexWrap);
        updateUi(false);

        const result = await showBlockingDialog({ title: t('colorpicker.customTitle'), content });
        return result === 'save' ? selected : null;
      }
    },
  );
});
