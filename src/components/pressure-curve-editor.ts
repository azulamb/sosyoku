/*
<pressure-curve-editor>
筆圧調整カーブ(横軸: 入力される筆圧の強さ、縦軸: 実際に反映される強さ)をグラフィカルに編集するコンポーネント。
グラフをクリック(タップ)するとポイントを追加、ポイントをドラッグすると移動、グラフの外へドラッグすると削除する。
最低2点は保持され、削除できない。
*/
import { t } from '../i18n/index.ts';
import { DEFAULT_PRESSURE_CURVE } from '../core/pressure-curve.ts';
import type { CurvePoint } from '../core/pressure-curve.ts';

export interface PressureCurveEditorElement extends HTMLElement {
  getPoints(): CurvePoint[];
  setPoints(points: CurvePoint[]): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const OUTSIDE_MARGIN = 8;
const HIT_RADIUS = 6;

((script, init) => {
  const tagname = script.dataset['pressureCurveEditor'] || 'pressure-curve-editor';
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
    class extends HTMLElement implements PressureCurveEditorElement {
      private points: CurvePoint[] = DEFAULT_PRESSURE_CURVE.map((p) => ({ ...p }));
      private svg: SVGSVGElement;
      private pathEl: SVGPathElement;
      private pointEls: SVGCircleElement[] = [];
      private draggingIndex: number | null = null;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display: block; }
          .wrap { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
          svg {
            width: 240px; height: 240px; touch-action: none; cursor: crosshair;
            background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
          }
          .grid-line { stroke: var(--border); stroke-width: 0.5; }
          .curve-path { fill: none; stroke: var(--accent); stroke-width: 1.5; }
          .point { fill: var(--bg-elevated); stroke: var(--accent); stroke-width: 1.5; cursor: grab; }
          .point:hover { fill: var(--accent); }
          .hint { font-size: 11px; color: var(--text-muted); max-width: 260px; line-height: 1.6; }
          .reset-btn {
            padding: 6px 12px; border: 1px solid var(--border); border-radius: 4px; background: transparent;
            color: inherit; cursor: pointer; font-size: 12px;
          }
          .reset-btn:hover { background: var(--bg-sunken); }
        `;

        const wrap = document.createElement('div');
        wrap.className = 'wrap';

        this.svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
        this.svg.setAttribute('viewBox', '0 0 100 100');

        for (let i = 1; i < 4; i++) {
          const pos = i * 25;
          const vLine = document.createElementNS(SVG_NS, 'line');
          vLine.setAttribute('x1', String(pos));
          vLine.setAttribute('y1', '0');
          vLine.setAttribute('x2', String(pos));
          vLine.setAttribute('y2', '100');
          vLine.setAttribute('class', 'grid-line');
          this.svg.appendChild(vLine);

          const hLine = document.createElementNS(SVG_NS, 'line');
          hLine.setAttribute('x1', '0');
          hLine.setAttribute('y1', String(pos));
          hLine.setAttribute('x2', '100');
          hLine.setAttribute('y2', String(pos));
          hLine.setAttribute('class', 'grid-line');
          this.svg.appendChild(hLine);
        }

        const border = document.createElementNS(SVG_NS, 'rect');
        border.setAttribute('x', '0');
        border.setAttribute('y', '0');
        border.setAttribute('width', '100');
        border.setAttribute('height', '100');
        border.setAttribute('fill', 'none');
        border.setAttribute('class', 'grid-line');
        this.svg.appendChild(border);

        this.pathEl = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
        this.pathEl.setAttribute('class', 'curve-path');
        this.svg.appendChild(this.pathEl);

        const hint = document.createElement('div');
        hint.className = 'hint';
        hint.textContent = t('pressurecurve.hint');

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'reset-btn';
        resetBtn.textContent = t('pressurecurve.reset');
        resetBtn.addEventListener('click', () => {
          this.points = DEFAULT_PRESSURE_CURVE.map((p) => ({ ...p }));
          this.redraw();
        });

        wrap.appendChild(this.svg);
        wrap.appendChild(hint);
        wrap.appendChild(resetBtn);
        shadow.appendChild(style);
        shadow.appendChild(wrap);

        this.svg.addEventListener('pointerdown', this.onPointerDown);
        this.svg.addEventListener('pointermove', this.onPointerMove);
        this.svg.addEventListener('pointerup', this.onPointerUp);
        this.svg.addEventListener('pointercancel', this.onPointerUp);

        document.addEventListener('locale-changed', () => {
          hint.textContent = t('pressurecurve.hint');
          resetBtn.textContent = t('pressurecurve.reset');
        });

        this.redraw();
      }

      getPoints(): CurvePoint[] {
        return this.points.map((p) => ({ ...p }));
      }

      setPoints(points: CurvePoint[]) {
        this.points = points.length >= 2
          ? points.map((p) => ({ ...p }))
          : DEFAULT_PRESSURE_CURVE.map((p) => ({ ...p }));
        this.redraw();
      }

      private toSvgPoint(e: PointerEvent): { x: number; y: number } {
        const rect = this.svg.getBoundingClientRect();
        return {
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        };
      }

      private dataToSvg(p: CurvePoint): { x: number; y: number } {
        return { x: p.x * 100, y: (1 - p.y) * 100 };
      }

      private svgToData(x: number, y: number): CurvePoint {
        return {
          x: Math.max(0, Math.min(1, x / 100)),
          y: Math.max(0, Math.min(1, 1 - y / 100)),
        };
      }

      private hitTestPoint(svgPos: { x: number; y: number }): number | null {
        let closest: number | null = null;
        let closestDist = HIT_RADIUS;
        this.points.forEach((p, i) => {
          const sp = this.dataToSvg(p);
          const dist = Math.hypot(sp.x - svgPos.x, sp.y - svgPos.y);
          if (dist < closestDist) {
            closestDist = dist;
            closest = i;
          }
        });
        return closest;
      }

      private onPointerDown = (e: PointerEvent) => {
        this.svg.setPointerCapture(e.pointerId);
        const svgPos = this.toSvgPoint(e);
        const hit = this.hitTestPoint(svgPos);
        if (hit !== null) {
          this.draggingIndex = hit;
        } else {
          const data = this.svgToData(svgPos.x, svgPos.y);
          this.points.push(data);
          this.points.sort((a, b) => a.x - b.x);
          this.draggingIndex = this.points.indexOf(data);
        }
        this.redraw();
      };

      private onPointerMove = (e: PointerEvent) => {
        if (this.draggingIndex === null) return;
        const svgPos = this.toSvgPoint(e);
        const outside = svgPos.x < -OUTSIDE_MARGIN || svgPos.x > 100 + OUTSIDE_MARGIN ||
          svgPos.y < -OUTSIDE_MARGIN || svgPos.y > 100 + OUTSIDE_MARGIN;

        if (outside && this.points.length > 2) {
          this.points.splice(this.draggingIndex, 1);
          this.draggingIndex = null;
          this.redraw();
          return;
        }

        const data = this.svgToData(svgPos.x, svgPos.y);
        this.points[this.draggingIndex] = data;
        this.points.sort((a, b) => a.x - b.x);
        this.draggingIndex = this.points.indexOf(data);
        this.redraw();
      };

      private onPointerUp = (e: PointerEvent) => {
        if (this.svg.hasPointerCapture(e.pointerId)) this.svg.releasePointerCapture(e.pointerId);
        this.draggingIndex = null;
      };

      private redraw() {
        const d = this.points
          .map((p, i) => {
            const sp = this.dataToSvg(p);
            return `${i === 0 ? 'M' : 'L'} ${sp.x} ${sp.y}`;
          })
          .join(' ');
        this.pathEl.setAttribute('d', d);

        for (const el of this.pointEls) el.remove();
        this.pointEls = [];
        for (const p of this.points) {
          const sp = this.dataToSvg(p);
          const circle = document.createElementNS(SVG_NS, 'circle');
          circle.setAttribute('cx', String(sp.x));
          circle.setAttribute('cy', String(sp.y));
          circle.setAttribute('r', '3');
          circle.setAttribute('class', 'point');
          this.svg.appendChild(circle);
          this.pointEls.push(circle);
        }
      }
    },
  );
});
