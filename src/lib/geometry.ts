// src/lib/geometry.ts
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Clamp a normalized ([0,1]) rect so it stays in bounds with at least `min`
 * width/height. Used for the swap mask.
 */
export function clampRect(r: Rect, min: number): Rect {
  const w = Math.max(min, Math.min(r.w, 1));
  const h = Math.max(min, Math.min(r.h, 1));
  const x = Math.max(0, Math.min(r.x, 1 - w));
  const y = Math.max(0, Math.min(r.y, 1 - h));
  return { x, y, w, h };
}

/** Map a normalized rect to pixel coords for a box of (w, h). */
export function toPixels(r: Rect, w: number, h: number): Rect {
  return { x: r.x * w, y: r.y * h, w: r.w * w, h: r.h * h };
}
