export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

/** #RRGGBB または #RRGGBBAA を受け取りr,g,b,a(0-1)を返す。アルファ省略時はa=1として扱う */
export function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const clean = hex.replace('#', '');
  const [r, g, b] = hexToRgb('#' + clean.slice(0, 6));
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

export function rgbaToHex8(r: number, g: number, b: number, a: number): string {
  const alphaByte = Math.max(0, Math.min(255, Math.round(a * 255)));
  return rgbToHex(r, g, b) + alphaByte.toString(16).padStart(2, '0');
}
