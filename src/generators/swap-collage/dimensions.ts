// src/generators/swap-collage/dimensions.ts
import type { AspectId, Orientation, Slot } from "./swapReducer";

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

export interface TileLayout {
  tileW: number;
  tileH: number;
  A: { x: number; y: number };
  B: { x: number; y: number };
}

/** Equal-half tile positions in logical px. */
export function tileLayout(
  orientation: Orientation,
  { cw, ch }: Dims,
): TileLayout {
  if (orientation === "lr") {
    return {
      tileW: cw / 2,
      tileH: ch,
      A: { x: 0, y: 0 },
      B: { x: cw / 2, y: 0 },
    };
  }
  return {
    tileW: cw,
    tileH: ch / 2,
    A: { x: 0, y: 0 },
    B: { x: 0, y: ch / 2 },
  };
}

/** Which half of the canvas a point falls in — A is always the first (left or
 *  top) tile, mirroring the A/B assignment in `tileLayout`. Coordinates and
 *  dimensions may be in any consistent units (logical px, display px, …) since
 *  the split is on the midline. */
export function pointToSlot(
  orientation: Orientation,
  x: number,
  y: number,
  cw: number,
  ch: number,
): Slot {
  if (orientation === "lr") return x < cw / 2 ? "A" : "B";
  return y < ch / 2 ? "A" : "B";
}

export interface Display {
  dispW: number;
  dispH: number;
  scale: number;
}

/** Largest uniform scale fitting the logical canvas into the available box. */
export function containFit(
  cw: number,
  ch: number,
  availW: number,
  availH: number,
): Display {
  const scale = Math.min(availW / cw, availH / ch);
  return { dispW: cw * scale, dispH: ch * scale, scale };
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
