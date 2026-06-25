// src/generators/grid-reveal/layout.ts
import type { Rect } from "@/lib/geometry";
import { coverFit } from "@/lib/canvas/fit";

/** Random-strip clamp multipliers, as a fraction of the uniform strip (1/n). */
export const MIN_STRIP_MULT = 0.5;
export const MAX_STRIP_MULT = 1.5;

/** Border look — always drawn, baked into the export. */
export const BORDER_COLOR = "#888888";
export const BORDER_OPACITY = 0.75;
export const BORDER_WIDTH = 1; // logical px (NOT divided by stage scale)

export interface Transform {
  panX: number; // [0,1], 0.5 = centered
  panY: number; // [0,1], 0.5 = centered
  zoom: number; // multiplier of cover scale (1 = cover)
}

export const IDENTITY_XFORM: Transform = { panX: 0.5, panY: 0.5, zoom: 1 };

/** n uniform strips summing to 1. */
export function uniformStrips(n: number): number[] {
  if (n <= 0) return [];
  const w = 1 / n;
  return Array.from({ length: n }, () => w);
}

/**
 * Random partition of 1 into n strips. Each raw draw is clamped to
 * [MIN_STRIP_MULT/n, MAX_STRIP_MULT/n] then the set is renormalized to sum 1.
 * `rng` is injected so tests are deterministic (defaults to Math.random).
 */
export function rollStrips(n: number, rng: () => number = Math.random): number[] {
  if (n <= 0) return [];
  const unit = 1 / n;
  const lo = MIN_STRIP_MULT * unit;
  const hi = MAX_STRIP_MULT * unit;
  const raw = Array.from({ length: n }, () => lo + rng() * (hi - lo));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/** Cumulative pixel origins (length n+1) for fractional strips over `len`. */
function origins(strips: number[], len: number): number[] {
  const acc: number[] = [0];
  let pos = 0;
  for (const s of strips) {
    pos += s * len;
    acc.push(pos);
  }
  return acc;
}

/** [rows][cols] pixel rects tiling the (cw × ch) canvas — no gaps, no overlap. */
export function cellRects(
  colStrips: number[],
  rowStrips: number[],
  cw: number,
  ch: number,
): Rect[][] {
  const xs = origins(colStrips, cw);
  const ys = origins(rowStrips, ch);
  const grid: Rect[][] = [];
  for (let r = 0; r < rowStrips.length; r++) {
    const row: Rect[] = [];
    for (let c = 0; c < colStrips.length; c++) {
      row.push({ x: xs[c], y: ys[r], w: xs[c + 1] - xs[c], h: ys[r + 1] - ys[r] });
    }
    grid.push(row);
  }
  return grid;
}

/** Which cell a logical-canvas point (x, y) falls in, or null if off-canvas. */
export function hitTest(
  x: number,
  y: number,
  colStrips: number[],
  rowStrips: number[],
  cw: number,
  ch: number,
): { row: number; col: number } | null {
  if (x < 0 || y < 0 || x > cw || y > ch) return null;
  const xs = origins(colStrips, cw);
  const ys = origins(rowStrips, ch);
  let col = 0;
  for (let i = 1; i < xs.length; i++) {
    if (x >= xs[i]) col = i;
    else break;
  }
  if (colStrips.length > 0) col = Math.min(col, colStrips.length - 1);
  let row = 0;
  for (let i = 1; i < ys.length; i++) {
    if (y >= ys[i]) row = i;
    else break;
  }
  if (rowStrips.length > 0) row = Math.min(row, rowStrips.length - 1);
  return { row, col };
}

/**
 * Cover-fit placement of an (iw × ih) image inside the (cw × ch) viewport,
 * scaled by xform.zoom, then panned. x = -(imgW - cw)·panX so panX=0 shows the
 * left edge, panX=1 the right edge, 0.5 centered. Always fully covers the
 * viewport (zoom ≥ 1 keeps the image at or past cover on both axes).
 */
export function placement(
  iw: number,
  ih: number,
  cw: number,
  ch: number,
  xform: Transform,
): { x: number; y: number; width: number; height: number } {
  const { scale } = coverFit(iw, ih, cw, ch);
  const imgW = iw * scale * xform.zoom;
  const imgH = ih * scale * xform.zoom;
  // `+ 0` coerces the negative zero that -(imgW-cw)*0 produces to +0, so the
  // pan-extreme positions are exact (Vitest's toBe uses Object.is).
  return {
    x: -(imgW - cw) * xform.panX + 0,
    y: -(imgH - ch) * xform.panY + 0,
    width: imgW,
    height: imgH,
  };
}

/** Interior strip-boundary pixel positions along one axis, for drawing lines. */
export function splitLines(strips: number[], len: number): number[] {
  return origins(strips, len).slice(1, -1);
}
