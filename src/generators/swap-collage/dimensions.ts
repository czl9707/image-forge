// src/generators/swap-collage/dimensions.ts
import type { AspectId, Orientation } from "./swapReducer";

export interface Dims {
  cw: number;
  ch: number;
}

/** Logical canvas size from aspect + long-edge export size. */
export function canvasDims(aspect: AspectId, longEdge: number): Dims {
  switch (aspect) {
    case "square":
      return { cw: longEdge, ch: longEdge };
    case "landscape":
      return { cw: longEdge, ch: Math.round((longEdge * 9) / 16) };
    case "portrait":
      return { cw: Math.round((longEdge * 9) / 16), ch: longEdge };
  }
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
