// src/lib/canvas/fit.ts
export interface Fit {
  scale: number;
  x: number;
  y: number;
}

/**
 * Cover-fit: scale an (iw × ih) image so it fully covers a (boxW × boxH) box,
 * centered. Returns the uniform scale and the centered top-left position.
 */
export function coverFit(
  iw: number,
  ih: number,
  boxW: number,
  boxH: number,
): Fit {
  const scale = Math.max(boxW / iw, boxH / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  return { scale, x: (boxW - drawW) / 2, y: (boxH - drawH) / 2 };
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
