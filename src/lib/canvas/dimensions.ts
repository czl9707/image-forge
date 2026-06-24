// src/lib/canvas/dimensions.ts

/** Landscape/portrait split orientation for a 2-axis collage canvas. */
export type Orientation = "lr" | "tb";

/** Aspect-ratio shapes a collage canvas can take (expressed landscape). */
export type AspectId = "16:9" | "4:3" | "1:1";

export interface Dims {
  cw: number;
  ch: number;
}

/** Logical canvas size from aspect (a shape) + orientation + long-edge export
 *  size. Aspect is a ratio shape expressed landscape; Top/Bottom orientation
 *  rotates the canvas to its portrait form (w/h swapped). Square is symmetric. */
export function canvasDims(
  aspect: AspectId,
  orientation: Orientation,
  longEdge: number,
): Dims {
  const base =
    aspect === "1:1"
      ? { cw: longEdge, ch: longEdge }
      : aspect === "4:3"
        ? { cw: longEdge, ch: Math.round((longEdge * 3) / 4) }
        : { cw: longEdge, ch: Math.round((longEdge * 9) / 16) }; // "16:9"
  return orientation === "tb"
    ? { cw: base.ch, ch: base.cw }
    : { cw: base.cw, ch: base.ch };
}

export interface PlaceholderStrip {
  y: number;
  height: number;
}

/** Vertical strip at the top of a tile reserved for the "Drop or click to
 *  upload" hint, so the centered swap box never covers it. The hint text is
 *  vertically centered within this strip. Pure: takes a tile height in any
 *  consistent unit (logical or display px). */
export function placeholderTextStrip(tileH: number): PlaceholderStrip {
  return { y: 0, height: tileH * 0.15 };
}
