// src/lib/filters/colorize.ts

/** Rec.601 luminance of an 8-bit RGB triple, normalized to [0,1]. */
export function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Convert HSL to an 8-bit RGB triple. h in [0,360), s and l in [0,1]. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r: number;
  let g: number;
  let b: number;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Konva filter: Photoshop-style "着色". Reads `this.colorHue` and `this.colorSat`,
 * discards each pixel's original hue/saturation, and repaints it at the pixel's
 * own luminance. White stays white, black stays black; mid-tones take the tint.
 *
 * `this` is the Konva node at apply time.
 */
export function colorize(this: { colorHue: number; colorSat: number }, imageData: ImageData): void {
  const { colorHue, colorSat } = this;
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = luminance(d[i], d[i + 1], d[i + 2]);
    const [r, g, b] = hslToRgb(colorHue, colorSat, l);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}
