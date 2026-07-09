/** ポインタ数に応じて描画(1本)とキャンバス操作(パン/ズーム, 2本以上)を振り分ける */

export type GestureMode = 'idle' | 'draw' | 'pan-zoom';

interface PointerRecord {
  x: number;
  y: number;
}

export interface DrawEvent {
  type: 'draw';
  x: number;
  y: number;
  pressure: number;
  pointerType: string;
}

export interface PanZoomEvent {
  type: 'pan-zoom';
  dx: number;
  dy: number;
  scaleFactor: number;
  centerX: number;
  centerY: number;
}

export class GestureController {
  private pointers = new Map<number, PointerRecord>();
  private mode: GestureMode = 'idle';
  private lastCenter: { x: number; y: number } | null = null;
  private lastDistance: number | null = null;

  get currentMode(): GestureMode {
    return this.mode;
  }

  /** 戻り値: モードが変化した場合、変化後のモードを返す(呼び出し側でストロークの開始/中断に使う) */
  down(pointerId: number, x: number, y: number): GestureMode {
    const previous = this.mode;
    this.pointers.set(pointerId, { x, y });
    this.updateMode();
    if (this.mode !== previous) this.resetPanZoomTracking();
    return this.mode;
  }

  move(
    pointerId: number,
    x: number,
    y: number,
    pressure: number,
    pointerType: string,
  ): DrawEvent | PanZoomEvent | null {
    if (!this.pointers.has(pointerId)) return null;
    this.pointers.set(pointerId, { x, y });

    if (this.mode === 'draw') {
      return { type: 'draw', x, y, pressure: pressure > 0 ? pressure : 0.5, pointerType };
    }

    if (this.mode === 'pan-zoom') {
      const points = [...this.pointers.values()];
      if (points.length < 2) return null;
      const [a, b] = points;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      let result: PanZoomEvent | null = null;
      if (this.lastCenter && this.lastDistance) {
        result = {
          type: 'pan-zoom',
          dx: center.x - this.lastCenter.x,
          dy: center.y - this.lastCenter.y,
          scaleFactor: this.lastDistance > 0 ? distance / this.lastDistance : 1,
          centerX: center.x,
          centerY: center.y,
        };
      }
      this.lastCenter = center;
      this.lastDistance = distance;
      return result;
    }

    return null;
  }

  up(pointerId: number): GestureMode {
    this.pointers.delete(pointerId);
    const previous = this.mode;
    this.updateMode();
    if (this.mode !== previous) this.resetPanZoomTracking();
    return this.mode;
  }

  private updateMode() {
    if (this.pointers.size === 0) this.mode = 'idle';
    else if (this.pointers.size === 1) this.mode = 'draw';
    else this.mode = 'pan-zoom';
  }

  private resetPanZoomTracking() {
    this.lastCenter = null;
    this.lastDistance = null;
  }
}
