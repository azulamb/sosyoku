/*
<drawing-canvas>
ドキュメントを合成表示し、ポインタ入力(ペン/塗りつぶし/消しゴム/選択/移動)で描画するキャンバスコンポーネント。
1本指/ペン/マウス = 描画、2本以上のポインタ = 'pan-zoom' イベントを発火して外側(canvas-desk)に処理を委譲する。
選択解除・選択範囲削除のショートカットは app.ts から runShortcutAction() 経由で呼び出される。
*/
import type { SosyokuDocument } from '../core/document.ts';
import { CanvasEngine } from '../core/canvas-engine.ts';
import { GestureController } from '../core/pointer-input.ts';
import { cropImageData } from '../core/imagedata.ts';
import type { BrushShape, NormalLayer, ReferenceLayer } from '../core/layer.ts';
import { type CurvePoint, DEFAULT_PRESSURE_CURVE, evaluatePressureCurve } from '../core/pressure-curve.ts';
import { hexToRgba } from '../core/color.ts';
import type { ShortcutActionId } from '../core/shortcuts.ts';
import type { ToolName } from '../core/tools.ts';
import { clamp, type Rect } from '../core/util.ts';

export type { ToolName };

export interface BrushSetting {
  radius: number;
  shape: BrushShape;
}

interface Point {
  x: number;
  y: number;
}

interface Offset {
  dx: number;
  dy: number;
}

export interface DrawingCanvasElement extends HTMLElement {
  setDocument(doc: SosyokuDocument): void;
  setTool(tool: ToolName): void;
  setBrush(brush: BrushSetting): void;
  setPressureCurve(points: CurvePoint[]): void;
  setTouchDrawingDisabled(disabled: boolean): void;
  setGridVisible(visible: boolean): void;
  setBackgroundColor(color: string): void;
  /** 実行した(状態が変化した)場合にtrueを返す */
  runShortcutAction(action: ShortcutActionId): boolean;
  render(): void;
}

const REF_HANDLE_SIZE = 14;
const OVERLAY_COLOR = '#007acc';
const ZERO_OFFSET: Offset = { dx: 0, dy: 0 };

function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.round(Math.min(a.x, b.x)),
    y: Math.round(Math.min(a.y, b.y)),
    w: Math.round(Math.abs(b.x - a.x)),
    h: Math.round(Math.abs(b.y - a.y)),
  };
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function offsetRect(rect: Rect, { dx, dy }: Offset): Rect {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}

function hasArea(rect: Rect | null): rect is Rect {
  return !!rect && rect.w > 0 && rect.h > 0;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** 選択範囲(またはレイヤー全体)を浮かせて移動中の状態。選択解除まではレイヤーに確定しない */
interface FloatingMove {
  layer: NormalLayer;
  /** 移動開始時点のレイヤー全体のピクセル(常にここから作り直すため、何度ドラッグしても劣化しない) */
  before: ImageData;
  region: Rect;
  content: OffscreenCanvas;
  /** 現在のドラッグ開始点(ドラッグしていない間はnull) */
  dragOrigin: Point | null;
  /** 確定済み(ドラッグが一段落した)オフセット */
  committed: Offset;
  /** 現在ドラッグ中も含めた最新のオフセット(オーバーレイの選択枠追従に使う) */
  live: Offset;
}

/** 参照レイヤーの移動/拡大縮小ドラッグ中の状態 */
interface ReferenceDrag {
  layer: ReferenceLayer;
  mode: 'move' | 'resize';
  start: Point;
  original: Rect;
}

/** ペン/消しゴムのストローク中の状態 */
interface Stroke {
  layer: NormalLayer;
  before: ImageData;
  dirty: Rect | null;
  lastPoint: Point;
}

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
      private touchDrawingDisabled = false;
      private gesture = new GestureController();

      private stroke: Stroke | null = null;
      private selection: Rect | null = null;
      private selectStart: Point | null = null;
      private floating: FloatingMove | null = null;
      private refDrag: ReferenceDrag | null = null;

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

      setBrush(brush: BrushSetting) {
        this.brush = brush;
      }

      setPressureCurve(points: CurvePoint[]) {
        this.pressureCurve = points;
      }

      setTouchDrawingDisabled(disabled: boolean) {
        this.touchDrawingDisabled = disabled;
        if (disabled) this.finishStroke();
      }

      /**
       * ドキュメントの背景色(#RRGGBBAA)を表示に反映する。アルファ値がある場合は市松模様の上に
       * 半透明の背景色を重ねて表示する(市松模様自体はエクスポートには含まれない、表示上のみの演出)。
       */
      setBackgroundColor(color: string) {
        const { r, g, b, a } = hexToRgba(color);
        const style = this.bgLayer.style;
        if (a >= 1) {
          style.backgroundImage = 'none';
          style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
          return;
        }
        const tint = `rgba(${r}, ${g}, ${b}, ${a})`;
        const checker = 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)';
        style.backgroundColor = '#ffffff';
        style.backgroundImage = `linear-gradient(${tint}, ${tint}), ${checker}, ${checker}`;
        style.backgroundSize = 'auto, 16px 16px, 16px 16px';
        style.backgroundPosition = '0 0, 0 0, 8px 8px';
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

      runShortcutAction(action: ShortcutActionId): boolean {
        if (action === 'deselect') {
          if (!this.floating && !this.selection) return false;
          this.commitPendingMove();
          this.selection = null;
          this.render();
          return true;
        }

        if (action !== 'deleteSelection') return false;
        const selection = this.selection;
        if (this.tool !== 'select' || !selection || selection.w < 1 || selection.h < 1) return false;
        const layer = this.editableNormalLayer();
        if (!layer) return false;

        const before = layer.snapshot();
        layer.ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
        this.pushRegionCommand(layer, before, selection, 'delete-selection');
        this.render();
        return true;
      }

      /** ツール・ドラッグ状態に応じてキャンバス上のカーソル形状を切り替える */
      private updateCursor() {
        let cursor = 'default';
        if (this.tool === 'move') cursor = this.floating || this.refDrag ? 'grabbing' : 'grab';
        else if (this.tool === 'select') cursor = 'crosshair';
        this.canvas.style.cursor = cursor;
      }

      private drawOverlay() {
        const ctx = this.canvas.getContext('2d');
        if (!ctx || !this.doc) return;

        // フローティング移動中(まだレイヤーに確定していない)は選択枠も現在位置に追従させる
        const selection = this.floating ? offsetRect(this.floating.region, this.floating.live) : this.selection;

        ctx.save();
        ctx.strokeStyle = OVERLAY_COLOR;
        ctx.fillStyle = OVERLAY_COLOR;
        ctx.lineWidth = 1;
        if (hasArea(selection)) {
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(selection.x + 0.5, selection.y + 0.5, selection.w - 1, selection.h - 1);
        }

        const active = this.doc.activeLayer;
        if (this.tool === 'move' && active?.type === 'reference') {
          const { x, y, w, h } = active.bounds;
          ctx.setLineDash([]);
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
          ctx.fillRect(x + w - REF_HANDLE_SIZE / 2, y + h - REF_HANDLE_SIZE / 2, REF_HANDLE_SIZE, REF_HANDLE_SIZE);
        }
        ctx.restore();
      }

      /** アクティブレイヤーが描画可能な通常レイヤーならそれを返す */
      private editableNormalLayer(): NormalLayer | null {
        const layer = this.doc?.activeLayer;
        return layer?.type === 'normal' && layer.editable ? layer : null;
      }

      private toCanvasPoint(e: PointerEvent): Point {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
      }

      /** 選択範囲をキャンバスの範囲内に収める(キャンバス外から/へドラッグされた場合でも安全に扱えるようにする) */
      private clampRectToCanvas(rect: Rect): Rect {
        const { width, height } = this.canvas;
        const x0 = clamp(rect.x, 0, width);
        const y0 = clamp(rect.y, 0, height);
        const x1 = clamp(rect.x + rect.w, 0, width);
        const y1 = clamp(rect.y + rect.h, 0, height);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }

      private shouldIgnoreDrawPointer(e: PointerEvent): boolean {
        return this.touchDrawingDisabled && e.pointerType === 'touch';
      }

      private emitPointerInfo(point: Point, pressure: number, pointerType: string) {
        this.dispatchEvent(
          new CustomEvent('pointer-info', {
            detail: { x: point.x, y: point.y, pressure, pointerType },
            bubbles: true,
            composed: true,
          }),
        );
      }

      // ---- 選択 ----

      private beginSelection(point: Point) {
        this.commitPendingMove();
        this.selectStart = point;
        this.selection = this.clampRectToCanvas(rectFromPoints(point, point));
        this.render();
      }

      private updateSelection(point: Point) {
        if (!this.selectStart) return;
        this.selection = this.clampRectToCanvas(rectFromPoints(this.selectStart, point));
        this.render();
      }

      private finishSelection() {
        if (this.selection && (this.selection.w < 1 || this.selection.h < 1)) this.selection = null;
        this.selectStart = null;
        this.render();
      }

      // ---- ポインタイベント ----

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
        if (this.gesture.down(e.pointerId, e.clientX, e.clientY) !== 'draw') return;
        this.beginSelection(this.toCanvasPoint(e));
      };

      private onPointerDown = (e: PointerEvent) => {
        this.canvas.setPointerCapture(e.pointerId);
        if (this.gesture.down(e.pointerId, e.clientX, e.clientY) !== 'draw') return;
        if (this.shouldIgnoreDrawPointer(e) || !this.doc) return;
        const point = this.toCanvasPoint(e);

        switch (this.tool) {
          case 'select':
            this.beginSelection(point);
            return;
          case 'move':
            this.beginMove(point);
            this.updateCursor();
            return;
          case 'fill':
            this.fillAt(point);
            return;
          case 'pen':
          case 'eraser':
            this.beginStroke(point, e.pressure);
            return;
        }
      };

      private onPointerMove = (e: PointerEvent) => {
        const result = this.gesture.move(e.pointerId, e.clientX, e.clientY, e.pressure, e.pointerType);
        if (!result) return;

        if (result.type === 'pan-zoom') {
          this.dispatchEvent(new CustomEvent('pan-zoom', { detail: result, bubbles: true, composed: true }));
          return;
        }
        if (this.shouldIgnoreDrawPointer(e)) return;

        const point = this.toCanvasPoint(e);

        if (this.tool === 'select') {
          this.updateSelection(point);
          return;
        }

        if (this.tool === 'move') {
          this.updateMove(point);
        } else {
          if (!this.stroke) return;
          this.continueStroke(point, result.pressure);
        }
        this.emitPointerInfo(point, result.pressure, e.pointerType);
      };

      private onPointerUp = (e: PointerEvent) => {
        this.gesture.up(e.pointerId);
        if (this.tool === 'select') this.finishSelection();
        else if (this.tool === 'move') this.finishMove();
        else this.finishStroke();
      };

      // ---- 塗りつぶし ----

      private fillAt(point: Point) {
        const layer = this.editableNormalLayer();
        if (!layer) return;
        const before = layer.snapshot();
        const bbox = layer.floodFill(point.x, point.y);
        if (bbox) this.pushRegionCommand(layer, before, bbox, 'fill');
        this.render();
      }

      // ---- ペン/消しゴム ----

      private beginStroke(point: Point, pressure: number) {
        const layer = this.editableNormalLayer();
        if (!layer) return;
        this.stroke = { layer, before: layer.snapshot(), dirty: null, lastPoint: point };
        this.paintAt(point, pressure);
        this.render();
      }

      /** 前回位置から今回位置までをブラシ半径に応じた間隔で補間しながら描く */
      private continueStroke(point: Point, pressure: number) {
        const stroke = this.stroke;
        if (!stroke) return;
        const from = stroke.lastPoint;
        const dx = point.x - from.x;
        const dy = point.y - from.y;
        const step = Math.max(1, this.brush.radius * 0.5);
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          this.paintAt({ x: from.x + dx * t, y: from.y + dy * t }, pressure);
        }
        stroke.lastPoint = point;
        this.render();
      }

      private paintAt(point: Point, pressure: number) {
        const stroke = this.stroke;
        if (!stroke) return;
        const adjusted = clamp(evaluatePressureCurve(this.pressureCurve, clamp(pressure, 0, 1)), 0, 1);
        const radius = this.brush.radius * (0.3 + adjusted * 0.7);
        const bbox = stroke.layer.stamp(point.x, point.y, radius, this.brush.shape, this.tool === 'eraser');
        if (bbox) stroke.dirty = stroke.dirty ? unionRect(stroke.dirty, bbox) : bbox;
      }

      private finishStroke() {
        const stroke = this.stroke;
        this.stroke = null;
        if (stroke?.dirty) this.pushRegionCommand(stroke.layer, stroke.before, stroke.dirty, this.tool);
      }

      // ---- 移動 ----

      private beginMove(point: Point) {
        const layer = this.doc?.activeLayer;
        if (!layer?.editable) return;

        if (layer.type === 'reference') {
          const nearCorner = Math.abs(point.x - (layer.x + layer.width)) < REF_HANDLE_SIZE &&
            Math.abs(point.y - (layer.y + layer.height)) < REF_HANDLE_SIZE;
          this.refDrag = { layer, mode: nearCorner ? 'resize' : 'move', start: point, original: layer.bounds };
          return;
        }

        // 同じレイヤーへのフローティング移動が既に進行中ならそのまま継続する(選択解除まではレイヤーに
        // 確定しない)。別レイヤーへの移動を新たに始める場合は、先に前のフローティング移動を確定する。
        if (this.floating?.layer !== layer) {
          this.commitPendingMove();
          const region: Rect = hasArea(this.selection)
            ? this.selection
            : { x: 0, y: 0, w: layer.canvas.width, h: layer.canvas.height };
          const before = layer.snapshot();
          const content = new OffscreenCanvas(Math.max(1, region.w), Math.max(1, region.h));
          (content.getContext('2d') as OffscreenCanvasRenderingContext2D)
            .putImageData(cropImageData(before, region.x, region.y, region.w, region.h), 0, 0);
          this.floating = {
            layer,
            before,
            region,
            content,
            dragOrigin: null,
            committed: ZERO_OFFSET,
            live: ZERO_OFFSET,
          };
        }
        this.floating!.dragOrigin = point;
      }

      private updateMove(point: Point) {
        if (this.refDrag) {
          this.updateReferenceDrag(this.refDrag, point);
          this.render();
          return;
        }

        const floating = this.floating;
        if (!floating?.dragOrigin) return;
        const offset = {
          dx: floating.committed.dx + Math.round(point.x - floating.dragOrigin.x),
          dy: floating.committed.dy + Math.round(point.y - floating.dragOrigin.y),
        };
        const { region } = floating;
        const ctx = floating.layer.ctx;
        // 常にフローティング開始時の元画像から作り直すため、何度ドラッグし直しても劣化・重複しない。
        // 貼り付けは putImageData ではなく drawImage(source-over)を使い、選択範囲の透明部分で
        // 移動先の既存の描画を消してしまわないようにする。
        ctx.putImageData(floating.before, 0, 0);
        ctx.clearRect(region.x, region.y, region.w, region.h);
        ctx.drawImage(floating.content, region.x + offset.dx, region.y + offset.dy);
        floating.live = offset;
        this.render();
      }

      private updateReferenceDrag({ layer, mode, start, original }: ReferenceDrag, point: Point) {
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        if (mode === 'move') {
          layer.setTransform({ ...original, x: Math.round(original.x + dx), y: Math.round(original.y + dy) });
        } else {
          const w = Math.max(4, Math.round(original.w + dx));
          const h = Math.max(4, Math.round(w * (original.h / original.w)));
          layer.setTransform({ ...original, w, h });
        }
      }

      private finishMove() {
        const refDrag = this.refDrag;
        if (refDrag) {
          this.refDrag = null;
          const { layer, original: before } = refDrag;
          const after = layer.bounds;
          if (!sameRect(before, after)) {
            this.pushHistory(
              'transform',
              () => layer.setTransform(before),
              () => layer.setTransform(after),
            );
          }
        } else if (this.floating) {
          // このドラッグ分のオフセットを確定するが、レイヤー本体・履歴への反映は選択解除まで行わない
          // (commitPendingMoveを参照)。フローティング状態のまま次のドラッグを継続できる。
          this.floating.committed = this.floating.live;
          this.floating.dragOrigin = null;
        }
        this.updateCursor();
      }

      /** フローティング中の移動をレイヤーに確定し、履歴へ1つの操作として登録する */
      private commitPendingMove() {
        const floating = this.floating;
        if (!floating) return;
        this.floating = null;
        const { layer, region, committed } = floating;
        if (committed.dx !== 0 || committed.dy !== 0) {
          const moved = offsetRect(region, committed);
          const bbox = this.clampRectToLayer(unionRect(region, moved), layer);
          this.pushRegionCommand(layer, floating.before, bbox, 'move');
          if (this.selection) this.selection = moved;
        }
        this.render();
      }

      private clampRectToLayer(rect: Rect, layer: NormalLayer): Rect {
        const x = Math.max(0, rect.x);
        const y = Math.max(0, rect.y);
        return {
          x,
          y,
          w: Math.min(layer.canvas.width, rect.x + rect.w) - x,
          h: Math.min(layer.canvas.height, rect.y + rect.h) - y,
        };
      }

      // ---- 履歴 ----

      /**
       * 操作を履歴に登録する。history.push()は'changed'イベントを同期的に発火する(タブの●表示はそれを
       * 購読して即時反映される)ため、markDirty()は必ずpush()より前に呼び、発火時点で最新のdirty状態を読めるようにする。
       */
      private pushHistory(label: string, undo: () => void, redo: () => void) {
        const doc = this.doc;
        if (!doc) return;
        const apply = (fn: () => void) => () => {
          fn();
          doc.markDirty();
          this.render();
        };
        doc.markDirty();
        doc.history.push({ label, undo: apply(undo), redo: apply(redo) });
      }

      /** 変更前の全体スナップショットと現在のレイヤーから、bbox部分だけを差分として履歴に登録する */
      private pushRegionCommand(layer: NormalLayer, beforeFull: ImageData, bbox: Rect, label: string) {
        const before = cropImageData(beforeFull, bbox.x, bbox.y, bbox.w, bbox.h);
        const after = layer.ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
        this.pushHistory(
          label,
          () => layer.ctx.putImageData(before, bbox.x, bbox.y),
          () => layer.ctx.putImageData(after, bbox.x, bbox.y),
        );
      }
    },
  );
});
