// src/generators/swap-collage/dimensions.ts
import type { Slot } from "./swapReducer";
import type { Dims, Orientation } from "@/lib/canvas/dimensions";

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
