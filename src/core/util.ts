/** 汎用の数値・幾何・ID ユーティリティ */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 長さ length の配列上で index から offset だけ進めた位置を、両端で循環させて返す */
export function wrapIndex(index: number, offset: number, length: number): number {
  return ((index + offset) % length + length) % length;
}

let sequence = 0;

/** セッション内で重複せず、別セッション由来のIDとも衝突しにくい一意IDを生成する */
export function createId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
