/** 筆圧調整カーブ(入力の筆圧強さ→実際に反映される強さ)の型・既定値・評価関数 */

export interface CurvePoint {
  x: number;
  y: number;
}

/** 既定は線形(入力=出力)。x=0とx=1の2点を最低限保持する。 */
export const DEFAULT_PRESSURE_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

/**
 * 制御点(x昇順でなくてもよい)を区分線形補間して、任意の入力筆圧に対する出力値を返す。
 * 定義域([最小x, 最大x])の外側は、最も近い端点の値でフラットに延長する。
 */
export function evaluatePressureCurve(points: CurvePoint[], input: number): number {
  if (points.length === 0) return input;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const x = Math.max(0, Math.min(1, input));

  if (x <= sorted[0].x) return sorted[0].y;
  const last = sorted[sorted.length - 1];
  if (x >= last.x) return last.y;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return x;
}
