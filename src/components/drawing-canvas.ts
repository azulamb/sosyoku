/*
<drawing-canvas>
ドキュメントを合成表示し、ポインタ入力(ペン/塗りつぶし/消しゴム/選択/移動)で描画するキャンバスコンポーネント。
1本指/ペン/マウス = 描画、2本以上のポインタ = 'pan-zoom' イベントを発火して外側(canvas-desk)に処理を委譲する。
*/
import type { SosyokuDocument } from '../core/document.ts';
import { CanvasEngine } from '../core/canvas-engine.ts';
import { GestureController } from '../core/pointer-input.ts';
import { cropImageData } from '../core/imagedata.ts';
import type { NormalLayer, ReferenceLayer } from '../core/layer.ts';
import type { BrushShape } from '../core/layer.ts';
import { DEFAULT_PRESSURE_CURVE, evaluatePressureCurve } from '../core/pressure-curve.ts';
import type { CurvePoint } from '../core/pressure-curve.ts';
import { hexToRgba } from '../core/color.ts';
import { matchesShortcut } from '../core/shortcuts.ts';
import { settingsStore } from '../core/settings-store.ts';

export type ToolName = 'pen' | 'eraser' | 'fill' | 'select' | 'move';

export interface BrushSetting {
  radius: number;
  shape: BrushShape;
}

interface DirtyRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawingCanvasElement extends HTMLElement {
  setDocument(doc: SosyokuDocument): void;
  setTool(tool: ToolName): void;
  setBrush(brush: BrushSetting): void;
  setPressureCurve(points: CurvePoint[]): void;
  setGridVisible(visible: boolean): void;
  setBackgroundColor(color: string): void;
  render(): void;
}

const REF_HANDLE_SIZE = 14;

((script, init) => {
  const tagname = script.dataset['drawingCanvas'] || 'drawing-canvas';
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
    class extends HTMLElement implements DrawingCanvasElement {
      private canvas: HTMLCanvasElement;
      private bgLayer: HTMLDivElement;
      private outsideListenerTarget: HTMLElement | null = null;
      private engine: CanvasEngine | null = null;
      private doc: SosyokuDocument | null = null;
      private tool: ToolName = 'pen';
      private brush: BrushSetting = { radius: 3, shape: 'round' };
      private pressureCurve: CurvePoint[] = DEFAULT_PRESSURE_CURVE;
      private gesture = new GestureController();

      private strokeLayer: NormalLayer | null = null;
      private strokeBefore: ImageData | null = null;
      private strokeDirty: DirtyRect | null = null;
      private lastPoint: { x: number; y: number } | null = null;

      private selection: Rect | null = null;
      private selectStart: { x: number; y: number } | null = null;

      private moveLayer: NormalLayer | null = null;
      private moveFullBefore: ImageData | null = null;
      private moveRegion: Rect | null = null;
      private moveContentCanvas: OffscreenCanvas | null = null;
      private moveDragOrigin: { x: number; y: number } | null = null;
      // moveCommittedOffset: このフローティング移動セッション内で、確定済み(ドラッグが一段落した)オフセット。
      // moveLiveOffset: 現在ドラッグ中も含めた最新のオフセット(オーバーレイの選択枠追従に使う)。
      // 選択解除(新規選択・ツール切替・Escape・ドキュメント切替)まではレイヤー本体には確定(履歴登録)しない。
      private moveCommittedOffset = { dx: 0, dy: 0 };
      private moveLiveOffset = { dx: 0, dy: 0 };

      private refLayer: ReferenceLayer | null = null;
      private refDragMode: 'move' | 'resize' | null = null;
      private refDragStart:
        | { x: number; y: number; origX: number; origY: number; origW: number; origH: number }
        | null = null;

      constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display: block; }
          .canvas-wrap { position: relative; display: inline-block; }
          .bg-layer { position: absolute; inset: 0; z-index: 0; background-color: #ffffff; }
          canvas {
            position: relative; z-index: 1;
            display: block;
            image-rendering: pixelated;
            touch-action: none;
          }
        `;
        this.canvas = document.createElement('canvas');
        const wrap = document.createElement('div');
        wrap.className = 'canvas-wrap';
        this.bgLayer = document.createElement('div');
        this.bgLayer.className = 'bg-layer';
        wrap.appendChild(this.bgLayer);
        wrap.appendChild(this.canvas);
        shadow.appendChild(style);
        shadow.appendChild(wrap);
        this.updateCursor();

        this.canvas.addEventListener('pointerdown', this.onPointerDown);
        this.canvas.addEventListener('pointermove', this.onPointerMove);
        this.canvas.addEventListener('pointerup', this.onPointerUp);
        this.canvas.addEventListener('pointercancel', this.onPointerUp);
        globalThis.addEventListener('keydown', this.onKeyDown);
      }

      connectedCallback() {
        // 選択ツールがキャンバス外(canvas-deskの余白)からもドラッグ開始できるよう、
        // 親要素(canvas-desk)側でも pointerdown を拾う。移動・終了は既存のcanvas側のリスナーが
        // pointer capture 経由で処理する。disconnectedCallback時点ではparentElementがnullになるため
        // 参照を保持しておく。
        this.outsideListenerTarget = this.parentElement;
        this.outsideListenerTarget?.addEventListener('pointerdown', this.onOutsidePointerDown);
      }

      disconnectedCallback() {
        globalThis.removeEventListener('keydown', this.onKeyDown);
        this.outsideListenerTarget?.removeEventListener('pointerdown', this.onOutsidePointerDown);
        this.outsideListenerTarget = null;
      }

      setDocument(doc: SosyokuDocument) {
        this.commitPendingMove();
        this.doc = doc;
        this.selection = null;
        this.canvas.width = doc.width;
        this.canvas.height = doc.height;
        this.canvas.style.width = `${doc.width}px`;
        this.canvas.style.height = `${doc.height}px`;
        this.engine = new CanvasEngine(this.canvas);
        this.render();
      }

      setTool(tool: ToolName) {
        if (tool !== 'move') this.commitPendingMove();
        this.tool = tool;
        this.updateCursor();
        this.render();
      }

      /** ツール・ドラッグ状態に応じてキャンバス上のカーソル形状を切り替える */
      private updateCursor() {
        if (this.tool === 'move') {
          this.canvas.style.cursor = this.moveLayer || this.refLayer ? 'grabbing' : 'grab';
        } else if (this.tool === 'select') {
          this.canvas.style.cursor = 'crosshair';
        } else {
          this.canvas.style.cursor = 'default';
        }
      }

      setBrush(brush: BrushSetting) {
        this.brush = brush;
      }

      setPressureCurve(points: CurvePoint[]) {
        this.pressureCurve = points;
      }

      /**
       * ドキュメントの背景色(#RRGGBBAA)を表示に反映する。アルファ値がある場合は市松模様の上に
       * 半透明の背景色を重ねて表示する(市松模様自体はエクスポートには含まれない、表示上のみの演出)。
       */
      setBackgroundColor(color: string) {
        const { r, g, b, a } = hexToRgba(color);
        if (a >= 1) {
          this.bgLayer.style.backgroundImage = 'none';
          this.bgLayer.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        } else {
          this.bgLayer.style.backgroundColor = '#ffffff';
          this.bgLayer.style.backgroundImage =
            `linear-gradient(rgba(${r}, ${g}, ${b}, ${a}), rgba(${r}, ${g}, ${b}, ${a})), ` +
            `linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), ` +
            `linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)`;
          this.bgLayer.style.backgroundSize = 'auto, 16px 16px, 16px 16px';
          this.bgLayer.style.backgroundPosition = '0 0, 0 0, 8px 8px';
        }
      }

      setGridVisible(visible: boolean) {
        if (this.engine) this.engine.gridVisible = visible;
        this.render();
      }

      render() {
        if (!this.doc || !this.engine) return;
        this.engine.render(this.doc);
        this.drawOverlay();
      }

      private drawOverlay() {
        const ctx = this.canvas.getContext('2d');
        if (!ctx || !this.doc) return;

        // フローティング移動中(まだレイヤーに確定していない)は選択枠も現在位置に追従させる
        const effectiveSelection = this.moveLayer && this.moveRegion
          ? {
            x: this.moveRegion.x + this.moveLiveOffset.dx,
            y: this.moveRegion.y + this.moveLiveOffset.dy,
            w: this.moveRegion.w,
            h: this.moveRegion.h,
          }
          : this.selection;

        if (effectiveSelection && effectiveSelection.w > 0 && effectiveSelection.h > 0) {
          ctx.save();
          ctx.strokeStyle = '#007acc';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(
            effectiveSelection.x + 0.5,
            effectiveSelection.y + 0.5,
            effectiveSelection.w - 1,
            effectiveSelection.h - 1,
          );
          ctx.restore();
        }

        const active = this.doc.activeLayer;
        if (this.tool === 'move' && active?.type === 'reference') {
          ctx.save();
          ctx.strokeStyle = '#007acc';
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.strokeRect(active.x + 0.5, active.y + 0.5, active.width - 1, active.height - 1);
          ctx.fillStyle = '#007acc';
          ctx.fillRect(
            active.x + active.width - REF_HANDLE_SIZE / 2,
            active.y + active.height - REF_HANDLE_SIZE / 2,
            REF_HANDLE_SIZE,
            REF_HANDLE_SIZE,
          );
          ctx.restore();
        }
      }

      private toCanvasPoint(e: PointerEvent): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
      }

      /** 選択範囲をキャンバスの範囲内に収める(キャンバス外から/へドラッグされた場合でも安全に扱えるようにする) */
      private clampRectToCanvas(rect: Rect): Rect {
        const x0 = Math.max(0, Math.min(this.canvas.width, rect.x));
        const y0 = Math.max(0, Math.min(this.canvas.height, rect.y));
        const x1 = Math.max(0, Math.min(this.canvas.width, rect.x + rect.w));
        const y1 = Math.max(0, Math.min(this.canvas.height, rect.y + rect.h));
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }

      /**
       * 選択ツール使用時、キャンバスの外側(canvas-desk のパディング部分)からでも
       * 選択範囲のドラッグを開始できるようにする。キャンバス内で始まった場合は
       * 通常の onPointerDown が処理するのでここでは何もしない。
       */
      private onOutsidePointerDown = (e: PointerEvent) => {
        if (this.tool !== 'select' || !this.doc) return;
        const rect = this.canvas.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        if (inside) return;

        this.canvas.setPointerCapture(e.pointerId);
        const mode = this.gesture.down(e.pointerId, e.clientX, e.clientY);
        if (mode !== 'draw') return;

        this.commitPendingMove();
        const point = this.toCanvasPoint(e);
        this.selectStart = point;
        this.selection = this.clampRectToCanvas({ x: Math.round(point.x), y: Math.round(point.y), w: 0, h: 0 });
        this.render();
      };

      private onKeyDown = (e: KeyboardEvent) => {
        const shortcuts = settingsStore.get().shortcuts;

        if (matchesShortcut(e, shortcuts, 'deselect')) {
          const target = e.target as HTMLElement | null;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
          }
          if (!this.moveLayer && !this.selection) return;
          this.commitPendingMove();
          this.selection = null;
          this.render();
          e.preventDefault();
          return;
        }

        if (!matchesShortcut(e, shortcuts, 'deleteSelection')) return;
        if (this.tool !== 'select' || !this.selection || this.selection.w < 1 || this.selection.h < 1) return;
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

        const doc = this.doc;
        const layer = doc?.activeLayer;
        if (!doc || !layer || layer.type !== 'normal' || layer.locked || !layer.visible) return;

        const before = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        layer.ctx.clearRect(this.selection.x, this.selection.y, this.selection.w, this.selection.h);
        this.pushRegionCommand(layer, before, this.selection, 'delete-selection');
        this.render();
        e.preventDefault();
      };

      private onPointerDown = (e: PointerEvent) => {
        this.canvas.setPointerCapture(e.pointerId);
        const mode = this.gesture.down(e.pointerId, e.clientX, e.clientY);
        if (mode !== 'draw') return;

        const doc = this.doc;
        if (!doc) return;
        const point = this.toCanvasPoint(e);

        if (this.tool === 'select') {
          this.commitPendingMove();
          this.selectStart = point;
          this.selection = this.clampRectToCanvas({ x: Math.round(point.x), y: Math.round(point.y), w: 0, h: 0 });
          this.render();
          return;
        }

        if (this.tool === 'move') {
          this.beginMove(doc, point);
          this.updateCursor();
          return;
        }

        const layer = doc.activeLayer;
        if (!layer || layer.type !== 'normal' || layer.locked || !layer.visible) return;

        if (this.tool === 'fill') {
          const before = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
          const bbox = layer.floodFill(point.x, point.y);
          if (bbox) this.pushRegionCommand(layer, before, bbox, 'fill');
          this.render();
          return;
        }

        if (this.tool !== 'pen' && this.tool !== 'eraser') return;

        this.strokeLayer = layer;
        this.strokeBefore = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        this.strokeDirty = null;
        this.lastPoint = point;
        this.paintAt(point, e.pressure);
        this.render();
      };

      private onPointerMove = (e: PointerEvent) => {
        const result = this.gesture.move(e.pointerId, e.clientX, e.clientY, e.pressure, e.pointerType);
        if (!result) return;

        if (result.type === 'pan-zoom') {
          this.dispatchEvent(new CustomEvent('pan-zoom', { detail: result, bubbles: true, composed: true }));
          return;
        }

        const point = this.toCanvasPoint(e);

        if (this.tool === 'select' && this.selectStart) {
          const x = Math.min(this.selectStart.x, point.x);
          const y = Math.min(this.selectStart.y, point.y);
          const w = Math.abs(point.x - this.selectStart.x);
          const h = Math.abs(point.y - this.selectStart.y);
          this.selection = this.clampRectToCanvas({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
          this.render();
          return;
        }

        if (this.tool === 'move') {
          this.updateMove(point);
          this.dispatchEvent(
            new CustomEvent('pointer-info', {
              detail: { x: point.x, y: point.y, pressure: result.pressure, pointerType: e.pointerType },
              bubbles: true,
              composed: true,
            }),
          );
          return;
        }

        if (!this.strokeLayer) return;
        this.interpolateAndPaint(point, result.pressure);
        this.lastPoint = point;
        this.render();
        this.dispatchEvent(
          new CustomEvent('pointer-info', {
            detail: { x: point.x, y: point.y, pressure: result.pressure, pointerType: e.pointerType },
            bubbles: true,
            composed: true,
          }),
        );
      };

      private onPointerUp = (e: PointerEvent) => {
        this.gesture.up(e.pointerId);

        if (this.tool === 'select') {
          if (this.selection && (this.selection.w < 1 || this.selection.h < 1)) this.selection = null;
          this.selectStart = null;
          this.render();
          return;
        }

        if (this.tool === 'move') {
          this.finishMove();
          return;
        }

        this.finishStroke();
      };

      private beginMove(doc: SosyokuDocument, point: { x: number; y: number }) {
        const layer = doc.activeLayer;
        if (!layer || layer.locked || !layer.visible) return;

        if (layer.type === 'reference') {
          const nearCorner = Math.abs(point.x - (layer.x + layer.width)) < REF_HANDLE_SIZE &&
            Math.abs(point.y - (layer.y + layer.height)) < REF_HANDLE_SIZE;
          this.refLayer = layer;
          this.refDragMode = nearCorner ? 'resize' : 'move';
          this.refDragStart = {
            x: point.x,
            y: point.y,
            origX: layer.x,
            origY: layer.y,
            origW: layer.width,
            origH: layer.height,
          };
          return;
        }

        // 同じレイヤーへのフローティング移動が既に進行中ならそのまま継続する(選択解除まではレイヤーに
        // 確定しない)。別レイヤーへの移動を新たに始める場合は、先に前のフローティング移動を確定する。
        if (this.moveLayer !== layer) {
          this.commitPendingMove();
          const region: Rect = this.selection && this.selection.w > 0 && this.selection.h > 0
            ? this.selection
            : { x: 0, y: 0, w: layer.canvas.width, h: layer.canvas.height };

          this.moveLayer = layer;
          this.moveRegion = region;
          this.moveFullBefore = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
          const content = cropImageData(this.moveFullBefore, region.x, region.y, region.w, region.h);
          this.moveContentCanvas = new OffscreenCanvas(Math.max(1, region.w), Math.max(1, region.h));
          const contentCtx = this.moveContentCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
          contentCtx.putImageData(content, 0, 0);
          this.moveCommittedOffset = { dx: 0, dy: 0 };
          this.moveLiveOffset = { dx: 0, dy: 0 };
        }
        this.moveDragOrigin = point;
      }

      private updateMove(point: { x: number; y: number }) {
        if (this.refLayer && this.refDragStart) {
          const dx = point.x - this.refDragStart.x;
          const dy = point.y - this.refDragStart.y;
          const layer = this.refLayer;
          if (this.refDragMode === 'move') {
            layer.setTransform(
              Math.round(this.refDragStart.origX + dx),
              Math.round(this.refDragStart.origY + dy),
              this.refDragStart.origW,
              this.refDragStart.origH,
            );
          } else {
            const aspect = this.refDragStart.origH / this.refDragStart.origW;
            const newW = Math.max(4, Math.round(this.refDragStart.origW + dx));
            const newH = Math.max(4, Math.round(newW * aspect));
            layer.setTransform(this.refDragStart.origX, this.refDragStart.origY, newW, newH);
          }
          this.render();
          return;
        }

        if (
          this.moveLayer && this.moveFullBefore && this.moveRegion && this.moveContentCanvas &&
          this.moveDragOrigin
        ) {
          const dx = this.moveCommittedOffset.dx + Math.round(point.x - this.moveDragOrigin.x);
          const dy = this.moveCommittedOffset.dy + Math.round(point.y - this.moveDragOrigin.y);
          const layer = this.moveLayer;
          const ctx = layer.ctx;
          // 常にフローティング開始時の元画像から作り直すため、何度ドラッグし直しても劣化・重複しない。
          // 貼り付けは putImageData ではなく drawImage(source-over)を使い、選択範囲の透明部分で
          // 移動先の既存の描画を消してしまわないようにする。
          ctx.putImageData(this.moveFullBefore, 0, 0);
          ctx.clearRect(this.moveRegion.x, this.moveRegion.y, this.moveRegion.w, this.moveRegion.h);
          ctx.drawImage(this.moveContentCanvas, this.moveRegion.x + dx, this.moveRegion.y + dy);
          this.moveLiveOffset = { dx, dy };
          this.render();
        }
      }

      private finishMove() {
        if (this.refLayer && this.refDragStart) {
          const layer = this.refLayer;
          const before = {
            x: this.refDragStart.origX,
            y: this.refDragStart.origY,
            w: this.refDragStart.origW,
            h: this.refDragStart.origH,
          };
          const after = { x: layer.x, y: layer.y, w: layer.width, h: layer.height };
          if (before.x !== after.x || before.y !== after.y || before.w !== after.w || before.h !== after.h) {
            this.doc?.markDirty();
            this.doc?.history.push({
              label: 'transform',
              undo: () => {
                layer.setTransform(before.x, before.y, before.w, before.h);
                this.doc?.markDirty();
                this.render();
              },
              redo: () => {
                layer.setTransform(after.x, after.y, after.w, after.h);
                this.doc?.markDirty();
                this.render();
              },
            });
          }
          this.refLayer = null;
          this.refDragStart = null;
          this.updateCursor();
          return;
        }

        if (this.moveLayer) {
          // このドラッグ分のオフセットを確定するが、レイヤー本体・履歴への反映は選択解除まで行わない
          // (commitPendingMoveを参照)。フローティング状態のまま次のドラッグを継続できる。
          this.moveCommittedOffset = this.moveLiveOffset;
          this.moveDragOrigin = null;
        }
        this.updateCursor();
      }

      /** フローティング中の移動をレイヤーに確定し、履歴へ1つの操作として登録する */
      private commitPendingMove() {
        if (!this.moveLayer || !this.moveFullBefore || !this.moveRegion) return;
        const layer = this.moveLayer;
        const region = this.moveRegion;
        const { dx, dy } = this.moveCommittedOffset;
        if (dx !== 0 || dy !== 0) {
          const unionMinX = Math.max(0, Math.min(region.x, region.x + dx));
          const unionMinY = Math.max(0, Math.min(region.y, region.y + dy));
          const unionMaxX = Math.min(layer.canvas.width, Math.max(region.x + region.w, region.x + dx + region.w));
          const unionMaxY = Math.min(layer.canvas.height, Math.max(region.y + region.h, region.y + dy + region.h));
          const bbox: Rect = { x: unionMinX, y: unionMinY, w: unionMaxX - unionMinX, h: unionMaxY - unionMinY };
          this.pushRegionCommand(layer, this.moveFullBefore, bbox, 'move');
          if (this.selection) {
            this.selection = { x: region.x + dx, y: region.y + dy, w: region.w, h: region.h };
          }
        }
        this.moveLayer = null;
        this.moveFullBefore = null;
        this.moveRegion = null;
        this.moveContentCanvas = null;
        this.moveDragOrigin = null;
        this.moveCommittedOffset = { dx: 0, dy: 0 };
        this.moveLiveOffset = { dx: 0, dy: 0 };
        this.render();
      }

      private finishStroke() {
        if (this.strokeLayer && this.strokeBefore && this.strokeDirty) {
          const layer = this.strokeLayer;
          const before = this.strokeBefore;
          const { minX, minY, maxX, maxY } = this.strokeDirty;
          const bbox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
          this.pushRegionCommand(layer, before, bbox, this.tool);
        }
        this.strokeLayer = null;
        this.strokeBefore = null;
        this.strokeDirty = null;
        this.lastPoint = null;
      }

      private pushRegionCommand(layer: NormalLayer, beforeFull: ImageData, bbox: Rect, label: string) {
        const before = cropImageData(beforeFull, bbox.x, bbox.y, bbox.w, bbox.h);
        const after = layer.ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
        // history.push()はChangeイベントを同期的に発火する(タブの●表示はそれを購読して即時反映される)ため、
        // markDirty()は必ずpush()より前に呼び、イベント発火時点で最新のdirty状態が読めるようにする。
        this.doc?.markDirty();
        this.doc?.history.push({
          label,
          undo: () => {
            layer.ctx.putImageData(before, bbox.x, bbox.y);
            this.doc?.markDirty();
            this.render();
          },
          redo: () => {
            layer.ctx.putImageData(after, bbox.x, bbox.y);
            this.doc?.markDirty();
            this.render();
          },
        });
      }

      private interpolateAndPaint(point: { x: number; y: number }, pressure: number) {
        if (!this.lastPoint) {
          this.paintAt(point, pressure);
          return;
        }
        const dx = point.x - this.lastPoint.x;
        const dy = point.y - this.lastPoint.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.max(1, this.brush.radius * 0.5);
        const steps = Math.max(1, Math.ceil(dist / step));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          this.paintAt({ x: this.lastPoint.x + dx * t, y: this.lastPoint.y + dy * t }, pressure);
        }
      }

      private paintAt(point: { x: number; y: number }, pressure: number) {
        if (!this.strokeLayer) return;
        const adjusted = evaluatePressureCurve(this.pressureCurve, Math.min(1, Math.max(0, pressure)));
        const radius = this.brush.radius * (0.3 + Math.min(1, Math.max(0, adjusted)) * 0.7);
        const bbox = this.strokeLayer.stamp(point.x, point.y, radius, this.brush.shape, this.tool === 'eraser');
        if (!bbox) return;
        const maxX = bbox.x + bbox.w - 1;
        const maxY = bbox.y + bbox.h - 1;
        if (!this.strokeDirty) {
          this.strokeDirty = { minX: bbox.x, minY: bbox.y, maxX, maxY };
        } else {
          this.strokeDirty.minX = Math.min(this.strokeDirty.minX, bbox.x);
          this.strokeDirty.minY = Math.min(this.strokeDirty.minY, bbox.y);
          this.strokeDirty.maxX = Math.max(this.strokeDirty.maxX, maxX);
          this.strokeDirty.maxY = Math.max(this.strokeDirty.maxY, maxY);
        }
      }
    },
  );
});
