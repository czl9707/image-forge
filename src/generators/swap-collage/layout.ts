// src/generators/swap-collage/layout.ts
//
// The pure heart of swap collage: turn two images, two transforms, a shared
// normalized mask, and a tile layout into the concrete pixel rectangles each
// image occupies. No Konva, no React, no bitmaps — only image *dimensions* —
// so the whole swap can be unit-tested in Node.
//
// The defining cross-reference lives here and nowhere else: a tile's OVERLAY
// shows the *other* slot's image, framed by the *other* slot's transform. That
// is "the swap," and it is now a one-line assertion in layout.test.ts.
import type { Rect } from "@/lib/geometry";
import { toPixels } from "@/lib/geometry";
import { clampCoverPos, coverFit } from "@/lib/canvas/fit";
import type { TileLayout } from "./dimensions";
import type { Slot, Transform } from "./swapReducer";

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDims {
  w: number;
  h: number;
}

export interface SwapLayoutInput {
  tiles: TileLayout;
  mask: Rect; // normalized [0,1] per-tile
  images: Record<Slot, ImageDims | null>;
  xforms: Record<Slot, Transform>;
}

export interface TilePlacements {
  /** This slot's own image, cover-fit + framed by its own transform. */
  base: Placement | null;
  /** The other slot's image framed by the other slot's transform (the swap). */
  overlay: Placement | null;
}

export interface SwapLayout {
  tiles: Record<Slot, TilePlacements>;
  /** The mask in tile pixels (same for both tiles — the mask is shared). */
  maskPx: Rect;
}

/**
 * Forward: transform → concrete pixel rectangle for one image in one tile.
 * Cover-fit scale × zoom, centered + panned, then clamped to the cover window
 * so an empty edge can never be revealed (in preview or export).
 */
function placement(
  iw: number,
  ih: number,
  tileW: number,
  tileH: number,
  xform: Transform,
): Placement {
  const { scale } = coverFit(iw, ih, tileW, tileH);
  const width = iw * scale * xform.zoom;
  const height = ih * scale * xform.zoom;
  const { x, y } = clampCoverPos(
    (tileW - width) / 2 + xform.panX * tileW,
    (tileH - height) / 2 + xform.panY * tileH,
    width,
    height,
    tileW,
    tileH,
  );
  return { width, height, x, y };
}

/**
 * Solve the whole collage's placement in one shot. Pure: takes image
 * dimensions, never bitmaps or nodes. The swap cross-reference — each tile's
 * overlay wears the *other* slot's transform — is made explicit here.
 */
export function solveSwapLayout(input: SwapLayoutInput): SwapLayout {
  const { tiles, mask, images, xforms } = input;
  const { tileW, tileH } = tiles;
  const a = images.A;
  const b = images.B;
  return {
    tiles: {
      A: {
        base: a ? placement(a.w, a.h, tileW, tileH, xforms.A) : null,
        overlay: b ? placement(b.w, b.h, tileW, tileH, xforms.B) : null,
      },
      B: {
        base: b ? placement(b.w, b.h, tileW, tileH, xforms.B) : null,
        overlay: a ? placement(a.w, a.h, tileW, tileH, xforms.A) : null,
      },
    },
    maskPx: toPixels(mask, tileW, tileH),
  };
}

/**
 * Inverse of `placement`: read a node's pixel geometry back to a
 * resolution-stable transform. The position is clamped to the cover window
 * first, so a drag can never store a transform that would reveal an empty edge.
 * Pure — the caller reads x/y/width/height off the Konva node and passes them in.
 */
export function solveTransform(
  x: number,
  y: number,
  width: number,
  height: number,
  iw: number,
  ih: number,
  tileW: number,
  tileH: number,
): Transform {
  const { scale } = coverFit(iw, ih, tileW, tileH);
  const zoom = width / (iw * scale);
  const clamped = clampCoverPos(x, y, width, height, tileW, tileH);
  return {
    zoom,
    panX: (clamped.x - (tileW - width) / 2) / tileW,
    panY: (clamped.y - (tileH - height) / 2) / tileH,
  };
}
