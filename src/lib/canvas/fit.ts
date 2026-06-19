// src/lib/canvas/fit.ts

/**
 * Cover-fit: scale an (iw × ih) image so it fully covers a (boxW × boxH) box.
 * Returns the uniform scale only. Centering/panning is the caller's job — the
 * swap-collage layout clamps the position to the cover window separately.
 */
export function coverFit(
  iw: number,
  ih: number,
  boxW: number,
  boxH: number,
): { scale: number } {
  const scale = Math.max(boxW / iw, boxH / ih);
  return { scale };
}

/**
 * Clamp an image's top-left (x, y) so a (width × height) image always fully
 * covers a (tileW × tileH) tile. For full coverage the top-left must satisfy
 * `tileW - width <= x <= 0` (and likewise for y): x <= 0 keeps the left edge
 * past the tile's left, x + width >= tileW keeps the right edge past the tile's
 * right. Requires width >= tileW (i.e. a cover-fit or zoomed-in image); when
 * the image is smaller than the tile on an axis the image is centered there.
 */
export function clampCoverPos(
  x: number,
  y: number,
  width: number,
  height: number,
  tileW: number,
  tileH: number,
): { x: number; y: number } {
  return {
    x: width >= tileW ? Math.min(Math.max(x, tileW - width), 0) : (tileW - width) / 2,
    y: height >= tileH ? Math.min(Math.max(y, tileH - height), 0) : (tileH - height) / 2,
  };
}
